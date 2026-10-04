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

function splitInfo(targetHours: number, type: EmploymentType): { ok: boolean; text: string } {
  if (targetHours <= 0) return { ok: true, text: "—" };
  try {
    const parts = splitTargetHours(Math.round(targetHours), type);
    return { ok: true, text: `${parts.length} ca` };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : "không hợp lệ" };
  }
}

type Draft = {
  name: string;
  employmentType: EmploymentType;
  hours: string;
  availableWeekdays: WeekdayKey[]; // [] = mọi ngày
  maxDays: string;
  azubi?: AzubiConfig;
  /** „Mẫu tuần" */
  patternOn: boolean;
  pDays: string;
  pMin: string;
  pMax: string;
  pWeekly: string;
  pRest: WeekdayKey[]; // [] = tự động
};

function draftFrom(emp?: Employee): Draft {
  return {
    name: emp?.name ?? "",
    employmentType: emp?.employmentType ?? "VOLLZEIT",
    hours: emp ? String(emp.targetMinutes / 60) : "176",
    availableWeekdays: emp?.availableWeekdays ?? [],
    maxDays: emp?.maxDaysPerWeek ? String(emp.maxDaysPerWeek) : "",
    azubi: emp?.azubi,
    patternOn: Boolean(emp?.weekPattern),
    pDays: String(emp?.weekPattern?.days ?? 6),
    pMin: String(emp?.weekPattern?.minHours ?? 6.5),
    pMax: String(emp?.weekPattern?.maxHours ?? 7),
    pWeekly: emp?.weekPattern ? (emp.weekPattern.weeklyHours !== undefined ? String(emp.weekPattern.weeklyHours) : "") : "40",
    pRest: emp?.weekPattern?.restDays ?? [],
  };
}

/** Muster aus dem Formular; undefined, wenn aus oder unvollständig. */
function patternFrom(d: Draft): WeekPattern | undefined {
  if (!d.patternOn || d.employmentType === "AZUBI") return undefined;
  const days = Math.round(Number(d.pDays));
  const p: WeekPattern = {
    days,
    minHours: Number(d.pMin),
    maxHours: Number(d.pMax),
    weeklyHours: d.pWeekly.trim() === "" ? undefined : Number(d.pWeekly),
    // Ruhetage nur übernehmen, wenn genau so viele gewählt sind, wie die
    // Woche freie Tage hat; sonst automatisch.
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
    // Mit Mẫu tuần bestimmt das Muster die Tage je Woche.
    maxDaysPerWeek:
      weekPattern || d.maxDays === "" || tage < 1 ? undefined : Math.min(7, Math.round(tage)),
    weekPattern,
  };
}

const fmtH = (h: number) => String(h).replace(".", ",");

/** „4 ca 6,5h + 2 ca 7h = 40h" für die Vorschau. */
function patternPreview(d: Draft): { ok: boolean; text: string } {
  const days = Math.round(Number(d.pDays));
  const min = Number(d.pMin);
  const max = Number(d.pMax);
  if (!(days >= 1 && days <= 6)) return { ok: false, text: "Số ngày/tuần phải từ 1 đến 6." };
  if (!(min > 0 && max >= min && max <= 8) || (min * 2) % 1 !== 0 || (max * 2) % 1 !== 0) {
    return { ok: false, text: "Độ dài ca: từ ≤ đến, bước 0,5 giờ, tối đa 8 giờ." };
  }
  if (d.pRest.length > 0 && d.pRest.length !== 7 - days) {
    return { ok: false, text: `Chọn đúng ${7 - days} ngày nghỉ, hoặc bỏ chọn hết để app tự chia.` };
  }
  if (d.pWeekly.trim() === "") {
    return {
      ok: true,
      text: `Mỗi tuần ${days} ca, mỗi ca ${fmtH(min)}–${fmtH(max)}h; giờ tháng lấy theo ô định mức tháng.`,
    };
  }
  const weekly = Number(d.pWeekly);
  const laengen = distributeLengths(days, Math.round(weekly * 60), Math.round(min * 60), Math.round(max * 60));
  if (!laengen) {
    return {
      ok: false,
      text: `${fmtH(weekly)}h/tuần không chia được thành ${days} ca ${fmtH(min)}–${fmtH(max)}h (được ${fmtH(days * min)}–${fmtH(days * max)}h).`,
    };
  }
  const gruppen = new Map<number, number>();
  for (const l of laengen) gruppen.set(l / 60, (gruppen.get(l / 60) ?? 0) + 1);
  const teile = [...gruppen].sort((a, b) => a[0] - b[0]).map(([h, n]) => `${n} ca ${fmtH(h)}h`);
  return { ok: true, text: `Tuần đủ: ${teile.join(" + ")} = ${fmtH(weekly)}h` };
}

export function EmployeesTab({ store }: { store: UseScheduleReturn }) {
  const { schedule, addEmployee, updateEmployee, removeEmployee } = store;
  const isLocked = false;

  const [offen, setOffen] = useState<null | "new" | string>(null);
  const bearbeitet =
    typeof offen === "string" && offen !== "new"
      ? schedule.employees.find((e) => e.id === offen)
      : undefined;

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
        Giờ nhập theo <b>tháng</b>. Bấm vào một người để sửa (hình thức, giờ, ngày làm trong
        tuần, số ngày/tuần). Học nghề (Azubi) chỉnh giờ ở tab <b>Azubi</b>.
      </p>

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

      {offen !== null && !isLocked && (
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
  const info = isAzubi
    ? { ok: true, text: `${azubiWeeklyHours(emp.azubi)}h/tuần · tab Azubi` }
    : splitInfo(stunden, emp.employmentType);
  const tooMany = !isAzubi && stunden > WARN_HOURS;
  const tage = emp.availableWeekdays;

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
          {!isAzubi && `${stunden}h · `}
          <span className={info.ok ? "" : "text-rose-600"}>{info.text}</span>
        </span>
        {tage && tage.length > 0 && (
          <span className="text-slate-400">· {tage.map((k) => WEEKDAY_SHORT_VI[k]).join(" ")}</span>
        )}
        {emp.weekPattern ? (
          <span className="text-indigo-600">
            · mẫu tuần {emp.weekPattern.days} ngày, ca {fmtH(emp.weekPattern.minHours)}–
            {fmtH(emp.weekPattern.maxHours)}h
            {emp.weekPattern.weeklyHours !== undefined && `, ${fmtH(emp.weekPattern.weeklyHours)}h/tuần`}
            {emp.weekPattern.restDays?.length
              ? `, nghỉ ${emp.weekPattern.restDays.map((k) => WEEKDAY_SHORT_VI[k]).join(" ")}`
              : ""}
          </span>
        ) : emp.maxDaysPerWeek ? (
          <span className="text-slate-400">· {emp.maxDaysPerWeek} ngày/tuần</span>
        ) : null}
      </div>
    </div>
  );
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
  const info = splitInfo(stunden, d.employmentType);
  const tooMany = !isAzubi && stunden > WARN_HOURS;

  const alleTage = d.availableWeekdays.length === 0;
  const toggleWeekday = (key: WeekdayKey) => {
    const basis = alleTage ? WEEKDAY_ORDER : d.availableWeekdays;
    set(
      "availableWeekdays",
      basis.includes(key) ? basis.filter((k) => k !== key) : [...basis, key],
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-lg bg-white shadow-xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            {employee ? "Sửa nhân viên" : "Thêm nhân viên"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="px-4 py-3 space-y-4">
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
          {!isAzubi && (
            <div className={`text-xs ${info.ok ? "text-slate-500" : "text-rose-600"}`}>
              {info.text}
              {tooMany && (
                <span className="text-amber-600 font-medium"> · ⚠ &gt;{WARN_HOURS}h/tháng</span>
              )}
            </div>
          )}

          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs text-slate-600 mb-1.5">
              Ngày làm trong tuần
              {alleTage && <span className="text-slate-400"> — bỏ trống = làm mọi ngày</span>}
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
            {!d.patternOn && (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                Số ngày làm mỗi tuần
                <input
                  type="number"
                  min={1}
                  max={7}
                  placeholder="—"
                  className={`${inputClass} w-16`}
                  value={d.maxDays}
                  onChange={(e) => set("maxDays", e.target.value)}
                />
                <span className="text-slate-400">bỏ trống = không giới hạn</span>
              </label>
            )}
          </div>

          {!isAzubi && <PatternSection d={d} set={set} />}
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
                  className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
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

/**
 * „Mẫu tuần": feste Arbeitswoche (Tage je Woche, Schichtlänge von–bis,
 * Wochenvertrag, feste Ruhetage). Wunsch von Natsu: Vollzeit 40 h auf sechs
 * Tage, vier Tage 6,5 h und zwei Tage 7 h.
 */
function PatternSection({
  d,
  set,
}: {
  d: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
}) {
  const vorschau = patternPreview(d);
  const ruheSoll = 7 - Math.round(Number(d.pDays) || 0);
  const toggleRest = (key: WeekdayKey) =>
    set("pRest", d.pRest.includes(key) ? d.pRest.filter((k) => k !== key) : [...d.pRest, key]);

  return (
    <div className="border-t border-slate-100 pt-3">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={d.patternOn}
          onChange={(e) => set("patternOn", e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        <span className="font-medium">Mẫu tuần cố định</span>
        <span className="text-xs text-slate-400">số ngày + độ dài ca mỗi tuần</span>
      </label>

      {d.patternOn && (
        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="block">
              <span className="text-[11px] text-slate-600">Ngày/tuần</span>
              <input
                type="number" min={1} max={6} step={1} inputMode="numeric"
                className={`${inputClass} mt-0.5 w-full`}
                value={d.pDays}
                onChange={(e) => set("pDays", e.target.value)}
              />
            </label>
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
                — {d.pRest.length === 0 ? "để trống = app tự chia so le vào ngày vắng" : `chọn đúng ${ruheSoll} ngày`}
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

          <div className={`text-xs ${vorschau.ok ? "text-indigo-700" : "text-rose-600"}`}>{vorschau.text}</div>
          {d.pWeekly.trim() !== "" && (
            <div className="text-[11px] text-slate-500">
              Có giờ/tuần thì giờ của tháng tính theo tuần: tuần đủ đúng {fmtH(Number(d.pWeekly) || 0)}h, tuần
              đầu/cuối tháng tính theo số ngày làm. Ô "Giờ định mức / tháng" ở trên không dùng nữa.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
