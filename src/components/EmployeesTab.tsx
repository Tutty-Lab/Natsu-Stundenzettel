import { useState } from "react";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import type { AzubiConfig, Employee, EmploymentType, WeekPattern } from "../types";
import { splitTargetHours } from "../lib/splitTargetHours";
import {
  azubiMonthlyMinutes,
  azubiWeeklyHours,
  defaultAzubiConfig,
} from "../lib/azubi";
import { WEEKDAY_SHORT_VI, type WeekdayKey } from "../lib/demand";
import { distributeLengths, isValidPattern } from "../lib/weekPattern";
import { employmentPeriodLabel } from "../lib/employmentPeriod";
import { calculatePause } from "../lib/time";

const inputClass =
  "rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

const WEEKDAY_ORDER: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const WARN_HOURS = 192;

const TYPE_SHORT: Record<EmploymentType, string> = {
  VOLLZEIT: "TT",
  TEILZEIT: "BT",
  AZUBI: "Azubi",
};

/**
 * Mẫu cho đội toàn thời gian (yêu cầu của chủ quán Natsu): 40 h mỗi tuần,
 * 6 ngày, 4 ca 6,5 h + 2 ca 7 h. Mỗi ca trên 6 h có thêm 30 phút nghỉ.
 */
const VOLLZEIT_MUSTER: WeekPattern = { days: 6, minHours: 6.5, maxHours: 7, weeklyHours: 40 };

/** Độ dài ca mặc định khi bật ngày cố định, theo hình thức. */
const STANDARD_LAENGE: Record<Exclude<EmploymentType, "AZUBI">, { min: number; max: number; weekly: string }> = {
  VOLLZEIT: { min: 6.5, max: 7, weekly: "40" },
  TEILZEIT: { min: 4, max: 6, weekly: "" },
};

const fmtH = (h: number) => String(h).replace(".", ",");

function splitInfo(targetHours: number, type: EmploymentType): { ok: boolean; text: string } {
  if (targetHours <= 0) return { ok: true, text: "—" };
  try {
    const parts = splitTargetHours(Math.round(targetHours), type);
    return { ok: true, text: `${parts.length} ca` };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : "không hợp lệ" };
  }
}

/** „6 ngày · ca 6,5–7h · 40h/tuần · nghỉ T2" */
function patternSummary(p: WeekPattern): string {
  const teile = [`${p.days} ngày cố định`, `ca ${fmtH(p.minHours)}–${fmtH(p.maxHours)}h`];
  if (p.weeklyHours !== undefined) teile.push(`${fmtH(p.weeklyHours)}h/tuần`);
  if (p.restDays?.length) teile.push(`nghỉ ${p.restDays.map((k) => WEEKDAY_SHORT_VI[k]).join(" ")}`);
  return teile.join(" · ");
}

type Draft = {
  name: string;
  employmentType: EmploymentType;
  hours: string;
  startDate: string;
  endDate: string;
  availableWeekdays: WeekdayKey[]; // [] = mọi ngày
  /** Cài đặt cũ: tối đa N ngày/tuần (chỉ khi chưa có ngày cố định). */
  maxDays: string;
  azubi?: AzubiConfig;
  /** Ngày cố định mỗi tuần; "" = app tự chọn. */
  pDays: string;
  pMin: string;
  pMax: string;
  pWeekly: string;
  pRest: WeekdayKey[]; // [] = tự động
};

function draftFrom(emp?: Employee): Draft {
  const p = emp?.weekPattern;
  return {
    name: emp?.name ?? "",
    employmentType: emp?.employmentType ?? "VOLLZEIT",
    hours: emp ? String(emp.targetMinutes / 60) : "176",
    startDate: emp?.startDate ?? "",
    endDate: emp?.endDate ?? "",
    availableWeekdays: emp?.availableWeekdays ?? [],
    maxDays: emp?.maxDaysPerWeek ? String(emp.maxDaysPerWeek) : "",
    azubi: emp?.azubi,
    pDays: p ? String(p.days) : "",
    pMin: p ? String(p.minHours) : "",
    pMax: p ? String(p.maxHours) : "",
    pWeekly: p?.weeklyHours !== undefined ? String(p.weeklyHours) : "",
    pRest: p?.restDays ?? [],
  };
}

/** Muster aus dem Formular; undefined, wenn keine festen Tage oder unvollständig. */
function patternFrom(d: Draft): WeekPattern | undefined {
  if (d.pDays.trim() === "" || d.employmentType === "AZUBI") return undefined;
  const days = Math.round(Number(d.pDays));
  const p: WeekPattern = {
    days,
    minHours: Number(d.pMin),
    maxHours: Number(d.pMax),
    weeklyHours: d.pWeekly.trim() === "" ? undefined : Number(d.pWeekly),
    // Ruhetage nur übernehmen, wenn genau so viele gewählt sind, wie die
    // Woche freie Tage hat; sonst verteilt die App sie selbst.
    restDays: d.pRest.length === 7 - days ? [...d.pRest] : undefined,
  };
  return isValidPattern(p) ? p : undefined;
}

function draftToEmployee(d: Draft): Omit<Employee, "id"> {
  const stunden = Math.max(0, Math.round(Number(d.hours) || 0));
  const tage = Number(d.maxDays);
  const isAzubi = d.employmentType === "AZUBI";
  // Azubi: die Stunden kommen aus der Azubi-Konfiguration (Tab „Azubi"), nicht
  // aus dem Stundenfeld. Bestehende Konfiguration bleibt erhalten.
  const azubi = isAzubi ? d.azubi ?? defaultAzubiConfig() : undefined;
  const weekPattern = patternFrom(d);
  return {
    name: d.name.trim() || "Nhân viên mới",
    employmentType: d.employmentType,
    targetMinutes: isAzubi ? azubiMonthlyMinutes(azubi) : stunden * 60,
    azubi,
    availableWeekdays:
      d.availableWeekdays.length === 0 || d.availableWeekdays.length === 7
        ? undefined
        : [...d.availableWeekdays],
    // Mit festen Tagen bestimmt das Muster die Tage je Woche.
    maxDaysPerWeek:
      weekPattern || d.maxDays === "" || tage < 1 ? undefined : Math.min(7, Math.round(tage)),
    weekPattern,
    startDate: d.startDate || undefined,
    endDate: d.endDate || undefined,
  };
}

/** Vorschau: Schichten einer vollen Woche inkl. Pause und Anwesenheit. */
function patternPreview(d: Draft): { ok: boolean; lines: string[] } {
  const days = Math.round(Number(d.pDays));
  const min = Number(d.pMin);
  const max = Number(d.pMax);
  if (!(days >= 1 && days <= 6)) return { ok: false, lines: ["Số ngày cố định phải từ 1 đến 6."] };
  if (!(min > 0 && max >= min && max <= 8) || (min * 2) % 1 !== 0 || (max * 2) % 1 !== 0) {
    return { ok: false, lines: ["Độ dài ca: \"từ\" nhỏ hơn hoặc bằng \"đến\". Bước 0,5 giờ. Tối đa 8 giờ."] };
  }
  if (d.pRest.length > 0 && d.pRest.length !== 7 - days) {
    return { ok: false, lines: [`Chọn đúng ${7 - days} ngày nghỉ. Hoặc bỏ chọn hết để app tự chia.`] };
  }
  const anwesend = (h: number) => {
    const pause = calculatePause(h * 60);
    return pause > 0 ? `${fmtH(h)}h + ${pause}′ nghỉ = có mặt ${fmtH(h + pause / 60)}h` : `${fmtH(h)}h, không nghỉ`;
  };
  if (d.pWeekly.trim() === "") {
    return {
      ok: true,
      lines: [
        `Mỗi tuần ${days} ca, mỗi ca ${fmtH(min)}–${fmtH(max)}h. Giờ tháng lấy theo ô "Giờ định mức / tháng".`,
        `Ca ${anwesend(min)}.`,
      ],
    };
  }
  const weekly = Number(d.pWeekly);
  const laengen = distributeLengths(days, Math.round(weekly * 60), Math.round(min * 60), Math.round(max * 60));
  if (!laengen) {
    return {
      ok: false,
      lines: [
        `${fmtH(weekly)}h/tuần không chia được thành ${days} ca ${fmtH(min)}–${fmtH(max)}h. Được từ ${fmtH(days * min)}h đến ${fmtH(days * max)}h.`,
      ],
    };
  }
  const gruppen = new Map<number, number>();
  for (const l of laengen) gruppen.set(l / 60, (gruppen.get(l / 60) ?? 0) + 1);
  const sortiert = [...gruppen].sort((a, b) => a[0] - b[0]);
  return {
    ok: true,
    lines: [
      `Tuần đủ: ${sortiert.map(([h, n]) => `${n} ca ${fmtH(h)}h`).join(" + ")} = ${fmtH(weekly)}h.`,
      ...sortiert.map(([h]) => `Ca ${anwesend(h)}.`),
      "Tuần đầu và cuối tháng tính theo số ngày làm trong tháng. Ô \"Giờ định mức / tháng\" không dùng nữa.",
    ],
  };
}

export function EmployeesTab({ store }: { store: UseScheduleReturn }) {
  const { schedule, addEmployee, updateEmployee, removeEmployee } = store;

  const [offen, setOffen] = useState<null | "new" | string>(null);
  const bearbeitet =
    typeof offen === "string" && offen !== "new"
      ? schedule.employees.find((e) => e.id === offen)
      : undefined;

  // Vollzeit ohne feste Woche: ein Klick setzt für alle das Muster des Chefs.
  const ohneMuster = schedule.employees.filter((e) => e.employmentType === "VOLLZEIT" && !e.weekPattern);
  const [musterFrage, setMusterFrage] = useState(false);
  const musterFuerAlle = () => {
    for (const e of ohneMuster) {
      updateEmployee(e.id, { weekPattern: { ...VOLLZEIT_MUSTER }, maxDaysPerWeek: undefined });
    }
    setMusterFrage(false);
  };

  return (
    <section className="rounded-lg bg-white border border-slate-200 p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold text-slate-900">
          Nhân viên
          {schedule.employees.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-400">
              {schedule.employees.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => setOffen("new")}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 active:bg-slate-800"
        >
          + Thêm
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Bấm vào một người để sửa. Học nghề (Azubi): sửa giờ ở tab <b>Azubi</b>.
      </p>

      {ohneMuster.length > 0 && (
        <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          <div>
            {ohneMuster.length} người toàn thời gian chưa có lịch tuần cố định. Mẫu của quán:{" "}
            <b>6 ngày/tuần, 4 ca 6,5h + 2 ca 7h = 40h</b>. Mỗi ca nghỉ 30 phút.
          </div>
          {musterFrage ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span>Áp dụng cho {ohneMuster.length} người này?</span>
              <button
                onClick={musterFuerAlle}
                className="rounded bg-indigo-700 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-800"
              >
                Áp dụng
              </button>
              <button
                onClick={() => setMusterFrage(false)}
                className="rounded px-3 py-1 text-sm text-indigo-800 hover:bg-indigo-100"
              >
                Huỷ
              </button>
            </div>
          ) : (
            <button
              onClick={() => setMusterFrage(true)}
              className="mt-2 rounded border border-indigo-300 bg-white px-3 py-1 text-sm font-medium text-indigo-800 hover:bg-indigo-100"
            >
              Áp dụng mẫu cho cả đội toàn thời gian
            </button>
          )}
        </div>
      )}

      {schedule.employees.length === 0 ? (
        <div className="py-8 text-center text-slate-400">
          Chưa có nhân viên. Bấm <b>+ Thêm</b> để tạo.
        </div>
      ) : (
        <ul className="space-y-2">
          {schedule.employees.map((emp) => (
            <li key={emp.id}>
              <button
                onClick={() => setOffen(emp.id)}
                className="w-full text-left rounded-lg border border-slate-200 p-3 flex items-center gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors"
              >
                <EmployeeSummaryRow emp={emp} />
                <span className="text-slate-300 text-lg leading-none">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => setOffen("new")}
        aria-label="Thêm nhân viên"
        className="sm:hidden fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-slate-900 text-white text-2xl shadow-lg active:bg-slate-700 flex items-center justify-center"
      >
        +
      </button>

      {offen !== null && (
        <EmployeeSheet
          key={bearbeitet?.id ?? "new"}
          employee={bearbeitet}
          onClose={() => setOffen(null)}
          onSave={(felder) => {
            if (bearbeitet) updateEmployee(bearbeitet.id, felder);
            else addEmployee(felder);
            setOffen(null);
          }}
          onDelete={
            bearbeitet
              ? () => {
                  removeEmployee(bearbeitet.id);
                  setOffen(null);
                }
              : undefined
          }
        />
      )}
    </section>
  );
}

function EmployeeSummaryRow({ emp }: { emp: Employee }) {
  const isAzubi = emp.employmentType === "AZUBI";
  const stunden = emp.targetMinutes / 60;
  const wochenVertrag = emp.weekPattern?.weeklyHours;
  const info = isAzubi
    ? { ok: true, text: `${azubiWeeklyHours(emp.azubi)}h/tuần · tab Azubi` }
    : wochenVertrag !== undefined
      ? { ok: true, text: `${fmtH(wochenVertrag)}h/tuần` }
      : splitInfo(stunden, emp.employmentType);
  const tooMany = !isAzubi && wochenVertrag === undefined && stunden > WARN_HOURS;
  const tage = emp.availableWeekdays;
  const zeitraum = employmentPeriodLabel(emp);

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-medium text-slate-900 truncate">{emp.name}</span>
        <span className="shrink-0 rounded bg-slate-100 text-slate-600 text-[11px] px-1.5 py-0.5">
          {TYPE_SHORT[emp.employmentType]}
        </span>
        {tooMany && <span className="shrink-0 text-amber-600 text-xs">⚠</span>}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
        <span>
          {!isAzubi && wochenVertrag === undefined && `${stunden}h/tháng · `}
          <span className={info.ok ? "" : "text-rose-600"}>{info.text}</span>
        </span>
        {emp.weekPattern ? (
          <span className="text-indigo-600">· {patternSummary(emp.weekPattern)}</span>
        ) : emp.maxDaysPerWeek ? (
          <span className="text-slate-400">· tối đa {emp.maxDaysPerWeek} ngày/tuần</span>
        ) : null}
        {tage && tage.length > 0 && (
          <span className="text-slate-400">· chỉ {tage.map((k) => WEEKDAY_SHORT_VI[k]).join(" ")}</span>
        )}
        {zeitraum && <span className="text-amber-700">· {zeitraum}</span>}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h4>;
}

function EmployeeSheet({
  employee,
  onClose,
  onSave,
  onDelete,
}: {
  employee?: Employee;
  onClose: () => void;
  onSave: (felder: Omit<Employee, "id">) => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState<Draft>(() => draftFrom(employee));
  const [loeschFrage, setLoeschFrage] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  const isAzubi = d.employmentType === "AZUBI";
  const stunden = Math.max(0, Math.round(Number(d.hours) || 0));
  const festeTage = !isAzubi && d.pDays.trim() !== "";
  const wochenVertrag = festeTage && d.pWeekly.trim() !== "";
  const info = splitInfo(stunden, d.employmentType);
  const tooMany = !isAzubi && !wochenVertrag && stunden > WARN_HOURS;
  const zeitraumFehler = d.startDate && d.endDate && d.endDate < d.startDate;

  const alleTage = d.availableWeekdays.length === 0;
  const toggleWeekday = (key: WeekdayKey) => {
    const basis = alleTage ? WEEKDAY_ORDER : d.availableWeekdays;
    set(
      "availableWeekdays",
      basis.includes(key) ? basis.filter((k) => k !== key) : [...basis, key],
    );
  };

  // Feste Tage eintragen: beim ersten Mal die übliche Länge der Anstellungsart
  // vorschlagen (Vollzeit: Muster des Chefs).
  const setFesteTage = (value: string) => {
    setD((prev) => {
      const next = { ...prev, pDays: value };
      if (value.trim() !== "" && prev.pMin === "" && prev.employmentType !== "AZUBI") {
        const std = STANDARD_LAENGE[prev.employmentType];
        next.pMin = String(std.min);
        next.pMax = String(std.max);
        next.pWeekly = std.weekly;
      }
      return next;
    });
  };
  const musterUebernehmen = () =>
    setD((prev) => ({
      ...prev,
      pDays: String(VOLLZEIT_MUSTER.days),
      pMin: String(VOLLZEIT_MUSTER.minHours),
      pMax: String(VOLLZEIT_MUSTER.maxHours),
      pWeekly: String(VOLLZEIT_MUSTER.weeklyHours),
      pRest: [],
    }));
  const toggleRest = (key: WeekdayKey) =>
    set("pRest", d.pRest.includes(key) ? d.pRest.filter((k) => k !== key) : [...d.pRest, key]);
  const vorschau = festeTage ? patternPreview(d) : null;
  const ruheSoll = 7 - Math.round(Number(d.pDays) || 0);
  const speicherbar = !zeitraumFehler && (!vorschau || vorschau.ok);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-lg bg-white shadow-xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            {employee ? "Sửa nhân viên" : "Thêm nhân viên"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="px-4 py-3 space-y-5">
          {/* ---- Thông tin ---- */}
          <div className="space-y-3">
            <SectionTitle>Thông tin</SectionTitle>
            <label className="block">
              <span className="text-xs text-slate-600">Tên</span>
              <input
                autoFocus={!employee}
                className={`${inputClass} w-full mt-1`}
                value={d.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Tên nhân viên"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-slate-600">Hình thức</span>
                <select
                  className={`${inputClass} w-full mt-1`}
                  value={d.employmentType}
                  onChange={(e) => set("employmentType", e.target.value as EmploymentType)}
                >
                  <option value="VOLLZEIT">Toàn thời gian</option>
                  <option value="TEILZEIT">Bán thời gian</option>
                  <option value="AZUBI">Học nghề (Azubi)</option>
                </select>
              </label>
              {isAzubi ? (
                <div className="block">
                  <span className="text-xs text-slate-600">Giờ</span>
                  <div className="mt-1 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-600">
                    {azubiWeeklyHours(d.azubi)}h/tuần · tab Azubi
                  </div>
                </div>
              ) : wochenVertrag ? (
                <div className="block">
                  <span className="text-xs text-slate-600">Giờ hợp đồng</span>
                  <div className="mt-1 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-600">
                    {fmtH(Number(d.pWeekly) || 0)}h/tuần
                  </div>
                </div>
              ) : (
                <label className="block">
                  <span className="text-xs text-slate-600">Giờ định mức / tháng</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    className={`${inputClass} w-full mt-1`}
                    value={d.hours}
                    onChange={(e) => set("hours", e.target.value)}
                  />
                </label>
              )}
            </div>
            {!isAzubi && !wochenVertrag && (
              <div className={`text-xs ${info.ok ? "text-slate-500" : "text-rose-600"}`}>
                {info.text}
                {tooMany && (
                  <span className="text-amber-600 font-medium"> · ⚠ &gt;{WARN_HOURS}h/tháng</span>
                )}
              </div>
            )}
          </div>

          {/* ---- Thời gian làm việc ---- */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <SectionTitle>Thời gian làm việc</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-slate-600">Ngày vào làm</span>
                <input
                  type="date"
                  className={`${inputClass} w-full mt-1`}
                  value={d.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-600">Ngày thôi làm</span>
                <input
                  type="date"
                  className={`${inputClass} w-full mt-1`}
                  value={d.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                />
              </label>
            </div>
            <p className={`text-xs ${zeitraumFehler ? "text-rose-600" : "text-slate-500"}`}>
              {zeitraumFehler
                ? "Ngày thôi làm phải sau ngày vào làm."
                : "Để trống nếu không có. App không xếp ca ngoài khoảng này. Tháng có ngày vào hoặc thôi làm thì giờ tính theo số ngày đi làm."}
            </p>
          </div>

          {/* ---- Lịch tuần ---- */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <SectionTitle>Lịch tuần</SectionTitle>

            <div>
              <div className="text-xs text-slate-600 mb-1.5">
                Ngày làm được trong tuần
                {alleTage && <span className="text-slate-400"> — để trống = làm mọi ngày</span>}
              </div>
              <div className="flex flex-wrap gap-1">
                {WEEKDAY_ORDER.map((key) => {
                  const an = alleTage || d.availableWeekdays.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleWeekday(key)}
                      className={`rounded px-2 py-1 text-xs border transition-colors ${
                        an
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-slate-400 border-slate-200 line-through"
                      }`}
                    >
                      {WEEKDAY_SHORT_VI[key]}
                    </button>
                  );
                })}
              </div>
            </div>

            {!isAzubi && (
              <div>
                <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  Số ngày làm cố định mỗi tuần
                  <input
                    type="number"
                    min={1}
                    max={6}
                    placeholder="—"
                    className={`${inputClass} w-16`}
                    value={d.pDays}
                    onChange={(e) => setFesteTage(e.target.value)}
                  />
                  <span className="text-slate-400">để trống = app tự chọn ngày</span>
                </label>
                {d.employmentType === "VOLLZEIT" && (
                  <button
                    type="button"
                    onClick={musterUebernehmen}
                    className="mt-2 rounded border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
                  >
                    Dùng mẫu toàn thời gian: 6 ngày, 4 ca 6,5h + 2 ca 7h = 40h
                  </button>
                )}
              </div>
            )}

            {festeTage && (
              <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                <div className="grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="text-[11px] text-slate-600">Ca từ (giờ)</span>
                    <input
                      type="number" min={3} max={8} step={0.5} inputMode="decimal"
                      className={`${inputClass} mt-0.5 w-full`}
                      value={d.pMin}
                      onChange={(e) => set("pMin", e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-slate-600">đến (giờ)</span>
                    <input
                      type="number" min={3} max={8} step={0.5} inputMode="decimal"
                      className={`${inputClass} mt-0.5 w-full`}
                      value={d.pMax}
                      onChange={(e) => set("pMax", e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-slate-600">Giờ/tuần (HĐ)</span>
                    <input
                      type="number" min={1} max={48} step={0.5} inputMode="decimal" placeholder="—"
                      className={`${inputClass} mt-0.5 w-full`}
                      value={d.pWeekly}
                      onChange={(e) => set("pWeekly", e.target.value)}
                    />
                  </label>
                </div>

                <div>
                  <div className="text-[11px] text-slate-600 mb-1">
                    Ngày nghỉ cố định
                    <span className="text-slate-400">
                      {" "}
                      — {d.pRest.length === 0 ? "để trống = app chia so le vào ngày vắng" : `chọn đúng ${ruheSoll} ngày`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAY_ORDER.map((key) => {
                      const an = d.pRest.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleRest(key)}
                          className={`rounded px-2 py-1 text-xs border transition-colors ${
                            an ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-200"
                          }`}
                        >
                          {WEEKDAY_SHORT_VI[key]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {vorschau && (
                  <ul className={`space-y-0.5 text-xs ${vorschau.ok ? "text-indigo-800" : "text-rose-600"}`}>
                    {vorschau.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {!festeTage && !isAzubi && d.maxDays !== "" && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Cài đặt cũ: tối đa {d.maxDays} ngày/tuần.</span>
                <button
                  type="button"
                  onClick={() => set("maxDays", "")}
                  className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100"
                >
                  Bỏ giới hạn này
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 py-3">
          {loeschFrage ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">Xoá nhân viên này?</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setLoeschFrage(false)}
                  className="rounded px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Không
                </button>
                <button
                  onClick={onDelete}
                  className="rounded bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
                >
                  Xoá
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              {onDelete ? (
                <button
                  onClick={() => setLoeschFrage(true)}
                  className="text-rose-600 hover:text-rose-800 text-sm font-medium"
                >
                  Xoá
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="rounded px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Huỷ
                </button>
                <button
                  onClick={() => onSave(draftToEmployee(d))}
                  disabled={!speicherbar}
                  className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
                >
                  Lưu
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
