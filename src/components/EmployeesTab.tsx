import { useState, type ReactNode } from "react";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import {
  AZUBI_HOURS_IN_TERM,
  AZUBI_WORKDAYS_IN_TERM,
  type AzubiConfig,
  type Employee,
  type EmploymentType,
  type WeekPattern,
} from "../types";
import { splitTargetHours } from "../lib/splitTargetHours";
import {
  AZUBI_MONTHLY_WEEKS,
  azubiConfigOf,
  azubiMonthlyMinutes,
  azubiWeeklyHours,
  azubiWeeklyLimit,
  defaultAzubiConfig,
} from "../lib/azubi";
import { WEEKDAY_LABELS_VI, WEEKDAY_SHORT_VI, type WeekdayKey } from "../lib/demand";
import { distributeLengths, isValidPattern } from "../lib/weekPattern";
import { employmentPeriodLabel } from "../lib/employmentPeriod";
import { VOLLZEIT_KIEU, kieuOf, kieuText, suggestedKieu } from "../lib/vollzeitKieu";
import { calculatePause } from "../lib/time";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base sm:text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

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
  const kieu = kieuOf(p);
  if (kieu) {
    const rest = p.restDays?.length ? ` · nghỉ ${p.restDays.map((k) => WEEKDAY_SHORT_VI[k]).join(" ")}` : "";
    return `${kieu.label}: ${kieuText(kieu.pattern)}${rest}`;
  }
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
        `Mỗi tuần ${days} ca, mỗi ca ${fmtH(min)}–${fmtH(max)}h. Giờ tháng lấy theo ô "Giờ / tháng".`,
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
      "Tuần đầu và cuối tháng tính theo số ngày làm trong tháng. Ô \"Giờ / tháng\" không dùng nữa.",
    ],
  };
}

/** Tab Nhân viên – Azubi-Einstellungen stecken direkt im Formular der Person (wie Thiên Long). */
export function EmployeesTab({ store }: { store: UseScheduleReturn }) {
  const { schedule, addEmployee, updateEmployee, removeEmployee } = store;

  const [offen, setOffen] = useState<null | "new" | string>(null);
  const bearbeitet =
    typeof offen === "string" && offen !== "new"
      ? schedule.employees.find((e) => e.id === offen)
      : undefined;

  // Vollzeit ohne feste Woche: einen Kiểu (oder „theo cài đặt cũ") für alle setzen.
  const ohneMuster = schedule.employees.filter((e) => e.employmentType === "VOLLZEIT" && !e.weekPattern);
  const vorschlag1 = ohneMuster.filter((e) => suggestedKieu(e).id === 1).length;
  const gemischt = vorschlag1 > 0 && vorschlag1 < ohneMuster.length;
  const [musterWahl, setMusterWahl] = useState<string>(() => (gemischt ? "auto" : "2"));
  const musterFuerAlle = () => {
    for (const e of ohneMuster) {
      const kieu =
        musterWahl === "auto" ? suggestedKieu(e) : VOLLZEIT_KIEU.find((k) => String(k.id) === musterWahl)!;
      updateEmployee(e.id, { weekPattern: { ...kieu.pattern }, maxDaysPerWeek: undefined });
    }
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
        Bấm vào một người để sửa. Azubi: kỳ học, giờ mỗi tuần và ngày học cài ngay trong đó.
      </p>

      {ohneMuster.length > 0 && (
        <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          <div>{ohneMuster.length} người toàn thời gian chưa có kiểu xếp ca. Chọn một kiểu cho tất cả:</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              aria-label="Kiểu xếp ca cho cả đội"
              value={musterWahl}
              onChange={(e) => setMusterWahl(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {gemischt && (
                <option value="auto">
                  Theo cài đặt cũ: {vorschlag1} người tối đa 5 ngày → Kiểu 1, {ohneMuster.length - vorschlag1} người → Kiểu 2
                </option>
              )}
              {VOLLZEIT_KIEU.map((k) => (
                <option key={k.id} value={String(k.id)}>
                  {k.label} · {kieuText(k.pattern)}
                </option>
              ))}
            </select>
            <button
              onClick={musterFuerAlle}
              className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800"
            >
              Áp dụng
            </button>
          </div>
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
  const azubi = isAzubi ? azubiConfigOf(emp.azubi) : null;
  const info = azubi
    ? {
        ok: true,
        text: `${fmtH(azubiWeeklyHours(azubi))}h/tuần · ${
          azubi.inSchoolTerm
            ? `kỳ học, học ${azubi.schoolDays.map((k) => WEEKDAY_SHORT_VI[k]).join(" ") || "—"}`
            : "ngoài kỳ học"
        }`,
      }
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
          {!isAzubi && wochenVertrag === undefined && `${stunden}h · `}
          <span className={info.ok ? "" : "text-rose-600"}>{info.text}</span>
        </span>
        {emp.weekPattern ? (
          <span className="text-teal-700">· {patternSummary(emp.weekPattern)}</span>
        ) : emp.maxDaysPerWeek ? (
          <span className="text-slate-400">· tối đa {emp.maxDaysPerWeek} ngày/tuần</span>
        ) : null}
        {tage && tage.length > 0 && (
          <span className="text-slate-400">· chỉ {tage.map((k) => WEEKDAY_SHORT_VI[k]).join(" ")}</span>
        )}
        {zeitraum && <span className="text-violet-700">· {zeitraum}</span>}
      </div>
    </div>
  );
}

// ---- Formular (Popup, Aufbau wie Thiên Long) ------------------------------

/** Große Tipp-Ziele statt Dropdowns (Hình thức). */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="grid gap-1 rounded-lg bg-slate-100 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2 py-2.5 text-sm font-medium transition-colors ${
            value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <span className="text-xs font-medium text-slate-600">{children}</span>
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </div>
  );
}

/** Zahlenfeld mit Ziffern-Tastatur und Einheit rechts. */
function HoursInput({
  value,
  onChange,
  placeholder,
  unit = "h",
  warn,
  decimal,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unit?: string;
  warn?: boolean;
  decimal?: boolean;
  label?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode={decimal ? "decimal" : "numeric"}
        enterKeyHint="done"
        min={0}
        step={decimal ? 0.5 : 1}
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        className={`${inputClass} w-full pr-10 tabular-nums ${warn ? "border-amber-400 text-amber-900" : ""}`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
        {unit}
      </span>
    </div>
  );
}

function SheetSection({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Sieben Tage-Knöpfe T2…CN in einer Reihe. */
function WeekdayPicker({
  isOn,
  onToggle,
  isDisabled,
  onClass = "border-slate-900 bg-slate-900 text-white",
  offClass = "border-slate-200 bg-white text-slate-600",
  label,
}: {
  isOn: (key: WeekdayKey) => boolean;
  onToggle: (key: WeekdayKey) => void;
  isDisabled?: (key: WeekdayKey) => boolean;
  onClass?: string;
  offClass?: string;
  label: string;
}) {
  return (
    <div className="grid grid-cols-7 gap-1" role="group" aria-label={label}>
      {WEEKDAY_ORDER.map((key) => {
        const on = isOn(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            title={WEEKDAY_LABELS_VI[key]}
            disabled={isDisabled?.(key)}
            onClick={() => onToggle(key)}
            className={`rounded-md border py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              on ? onClass : offClass
            }`}
          >
            {WEEKDAY_SHORT_VI[key]}
          </button>
        );
      })}
    </div>
  );
}

const SCHOOL_DAYS_REQUIRED = 2;

export function EmployeeSheet({
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
  const [showPeriod, setShowPeriod] = useState(() => !!(employee?.startDate || employee?.endDate));

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  const isAzubi = d.employmentType === "AZUBI";
  const stunden = Math.max(0, Math.round(Number(d.hours) || 0));
  const festeTage = !isAzubi && d.pDays.trim() !== "";
  const wochenVertrag = festeTage && d.pWeekly.trim() !== "";
  const info = splitInfo(stunden, d.employmentType);
  const tooMany = !isAzubi && !wochenVertrag && stunden > WARN_HOURS;
  const zeitraumFehler = !!(d.startDate && d.endDate && d.endDate < d.startDate);

  // ---- Azubi (früher eigener Tab) ----
  const azubi = azubiConfigOf(d.azubi);
  const setAzubi = (patch: Partial<AzubiConfig>) =>
    setD((prev) => ({ ...prev, azubi: { ...azubiConfigOf(prev.azubi), ...patch } }));
  const azubiWeekly = azubiWeeklyHours(azubi);
  const azubiLimit = azubiWeeklyLimit(azubi);
  const setAzubiWeekly = (raw: string) => {
    const normalized = Math.max(0, Math.round((Number(raw) || 0) * 2) / 2);
    setAzubi(azubi.inSchoolTerm ? { weeklyHoursInTerm: normalized } : { weeklyHoursOutOfTerm: normalized });
  };
  const toggleSchoolDay = (key: WeekdayKey) => {
    const selected = azubi.schoolDays.includes(key);
    if (!selected && azubi.schoolDays.length >= SCHOOL_DAYS_REQUIRED) return;
    setAzubi({ schoolDays: selected ? azubi.schoolDays.filter((k) => k !== key) : [...azubi.schoolDays, key] });
  };
  const azubiProblems: string[] = [];
  if (isAzubi && azubiWeekly > azubiLimit) azubiProblems.push(`Vượt mức tối đa ${fmtH(azubiLimit)}h/tuần.`);
  if (isAzubi && azubi.inSchoolTerm && azubi.schoolDays.length !== SCHOOL_DAYS_REQUIRED) {
    azubiProblems.push("Chọn đúng 2 ngày học.");
  }

  const alleTage = d.availableWeekdays.length === 0;
  const toggleWeekday = (key: WeekdayKey) => {
    const basis = alleTage ? WEEKDAY_ORDER : d.availableWeekdays;
    set("availableWeekdays", basis.includes(key) ? basis.filter((k) => k !== key) : [...basis, key]);
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
  const musterUebernehmen = (p: WeekPattern) =>
    setD((prev) => ({
      ...prev,
      pDays: String(p.days),
      pMin: String(p.minHours),
      pMax: String(p.maxHours),
      pWeekly: String(p.weeklyHours),
      pRest: [],
    }));
  const aktiverKieu = d.employmentType === "VOLLZEIT" ? kieuOf(patternFrom(d)) : undefined;
  const toggleRest = (key: WeekdayKey) =>
    set("pRest", d.pRest.includes(key) ? d.pRest.filter((k) => k !== key) : [...d.pRest, key]);
  const vorschau = festeTage ? patternPreview(d) : null;
  const ruheSoll = 7 - Math.round(Number(d.pDays) || 0);
  const speicherbar = !zeitraumFehler && (!vorschau || vorschau.ok) && d.name.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="popup-card w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <h3 className="font-semibold text-slate-900">{employee ? "Sửa nhân viên" : "Thêm nhân viên"}</h3>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="-mr-2 h-10 w-10 rounded-full text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4 space-y-6">
          <SheetSection title="Thông tin">
            <label className="block">
              <FieldLabel>Tên</FieldLabel>
              <input
                autoFocus={!employee}
                autoCapitalize="words"
                autoComplete="off"
                enterKeyHint="next"
                className={`${inputClass} w-full`}
                value={d.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Tên nhân viên"
              />
            </label>
            <div>
              <FieldLabel>Hình thức</FieldLabel>
              <Segmented<EmploymentType>
                value={d.employmentType}
                onChange={(v) => set("employmentType", v)}
                options={[
                  { value: "VOLLZEIT", label: "Toàn TG" },
                  { value: "TEILZEIT", label: "Bán TG" },
                  { value: "AZUBI", label: "Azubi" },
                ]}
              />
            </div>
          </SheetSection>

          <SheetSection title="Giờ làm">
            {isAzubi ? (
              <>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                  <span className="text-sm text-slate-700">
                    Đang trong kỳ học
                    <span className="block text-xs text-slate-400">
                      Kỳ học: tối đa {AZUBI_HOURS_IN_TERM}h/tuần, {AZUBI_WORKDAYS_IN_TERM} ngày làm, 2 ngày học.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={azubi.inSchoolTerm}
                    onChange={(e) => setAzubi({ inSchoolTerm: e.target.checked })}
                    className="h-6 w-6 rounded border-slate-300"
                  />
                </label>
                <div>
                  <FieldLabel hint={`tối đa ${fmtH(azubiLimit)}h mỗi tuần`}>Giờ / tuần</FieldLabel>
                  <HoursInput
                    decimal
                    label={`Giờ mỗi tuần của ${d.name.trim() || "Azubi"}`}
                    value={String(azubiWeekly)}
                    onChange={setAzubiWeekly}
                    warn={azubiWeekly > azubiLimit}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Giờ tháng = giờ tuần × {AZUBI_MONTHLY_WEEKS} = {fmtH(azubiWeekly * AZUBI_MONTHLY_WEEKS)}h.
                  </p>
                </div>
              </>
            ) : wochenVertrag ? (
              <div>
                <FieldLabel hint="giờ tháng tính theo tuần">Giờ hợp đồng</FieldLabel>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                  {fmtH(Number(d.pWeekly) || 0)}h/tuần
                </div>
              </div>
            ) : (
              <div>
                <FieldLabel hint={info.ok ? info.text : undefined}>Giờ / tháng</FieldLabel>
                <HoursInput value={d.hours} onChange={(v) => set("hours", v)} warn={tooMany} />
                {!info.ok && <p className="mt-1 text-xs text-rose-600">{info.text}</p>}
                {tooMany && <p className="mt-1 text-xs text-amber-700">⚠ trên {WARN_HOURS}h/tháng</p>}
              </div>
            )}

            {d.employmentType === "VOLLZEIT" && (
              <div>
                <FieldLabel hint="chọn sẵn số ngày và độ dài ca">Kiểu xếp ca</FieldLabel>
                <select
                  aria-label="Kiểu xếp ca toàn thời gian"
                  className={`${inputClass} w-full`}
                  value={aktiverKieu ? String(aktiverKieu.id) : festeTage ? "custom" : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") setFesteTage("");
                    else if (v === "custom") setFesteTage(d.pDays || "5");
                    else musterUebernehmen(VOLLZEIT_KIEU.find((k) => String(k.id) === v)!.pattern);
                  }}
                >
                  <option value="">Không cố định – app xếp theo giờ tháng</option>
                  {VOLLZEIT_KIEU.map((k) => (
                    <option key={k.id} value={String(k.id)}>
                      {k.label} · {kieuText(k.pattern)}
                    </option>
                  ))}
                  <option value="custom">Tự chỉnh (số ngày và độ dài ca bên dưới)</option>
                </select>
              </div>
            )}

            {!isAzubi && (
              <div>
                <FieldLabel hint="Tự = app tự chọn ngày">Số ngày làm cố định / tuần</FieldLabel>
                <div className="grid grid-cols-7 gap-1">
                  {["", "1", "2", "3", "4", "5", "6"].map((n) => (
                    <button
                      key={n || "auto"}
                      type="button"
                      aria-pressed={d.pDays === n}
                      onClick={() => setFesteTage(n)}
                      className={`rounded-md border py-2.5 text-sm font-medium ${
                        d.pDays === n
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {n || "Tự"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {festeTage && (
              <>
                <div>
                  <FieldLabel hint="bước 0,5h, tối đa 8h">Độ dài ca</FieldLabel>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <HoursInput decimal placeholder="từ" value={d.pMin} onChange={(v) => set("pMin", v)} />
                    <span className="text-slate-400">–</span>
                    <HoursInput decimal placeholder="đến" value={d.pMax} onChange={(v) => set("pMax", v)} />
                  </div>
                </div>
                <div>
                  <FieldLabel hint="bỏ trống = theo giờ tháng">Giờ / tuần (hợp đồng)</FieldLabel>
                  <HoursInput decimal placeholder="—" value={d.pWeekly} onChange={(v) => set("pWeekly", v)} />
                </div>
                {vorschau && (
                  <ul
                    className={`space-y-0.5 rounded-lg px-3 py-2 text-xs ${
                      vorschau.ok ? "bg-indigo-50 text-indigo-800" : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {vorschau.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </>
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
          </SheetSection>

          {festeTage && (
            <SheetSection
              title={`Ngày nghỉ cố định · chọn ${ruheSoll}`}
              hint={d.pRest.length === 0 ? "bỏ trống = app tự chia" : undefined}
            >
              <WeekdayPicker
                label="Ngày nghỉ cố định"
                isOn={(key) => d.pRest.includes(key)}
                onToggle={toggleRest}
                isDisabled={(key) => !d.pRest.includes(key) && d.pRest.length >= ruheSoll}
                onClass="border-amber-500 bg-amber-500 text-white"
              />
              {d.pRest.length > 0 && d.pRest.length !== ruheSoll && (
                <p className="text-xs text-amber-700">
                  Đã chọn {d.pRest.length}/{ruheSoll} ngày.
                </p>
              )}
            </SheetSection>
          )}

          {isAzubi && azubi.inSchoolTerm && (
            <SheetSection title="Ngày học · chọn 2" hint="không xếp ca vào ngày học">
              <WeekdayPicker
                label="Ngày học"
                isOn={(key) => azubi.schoolDays.includes(key)}
                onToggle={toggleSchoolDay}
                isDisabled={(key) =>
                  !azubi.schoolDays.includes(key) && azubi.schoolDays.length >= SCHOOL_DAYS_REQUIRED
                }
              />
            </SheetSection>
          )}

          {azubiProblems.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800" role="alert">
              {azubiProblems.join(" ")} Sửa trước khi tạo lịch.
            </p>
          )}

          <SheetSection title="Ngày làm được" hint="sáng hết = làm mọi ngày">
            <WeekdayPicker
              label="Ngày làm được trong tuần"
              isOn={(key) => alleTage || d.availableWeekdays.includes(key)}
              onToggle={toggleWeekday}
              offClass="border-slate-200 bg-white text-slate-400 line-through"
            />
          </SheetSection>

          <SheetSection title="Thời gian làm việc">
            {!showPeriod ? (
              <button
                type="button"
                onClick={() => setShowPeriod(true)}
                className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-left text-sm text-slate-600"
              >
                + Ngày vào làm / thôi làm <span className="text-slate-400">(nếu không làm cả tháng)</span>
              </button>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <FieldLabel>Ngày vào làm</FieldLabel>
                    <input
                      type="date"
                      className={`${inputClass} w-full`}
                      value={d.startDate}
                      max={d.endDate || undefined}
                      onChange={(e) => set("startDate", e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Ngày thôi làm</FieldLabel>
                    <input
                      type="date"
                      className={`${inputClass} w-full`}
                      value={d.endDate}
                      min={d.startDate || undefined}
                      onChange={(e) => set("endDate", e.target.value)}
                    />
                  </label>
                </div>
                <p className={`text-xs ${zeitraumFehler ? "text-rose-600" : "text-slate-500"}`}>
                  {zeitraumFehler
                    ? "Ngày thôi làm phải sau ngày vào làm."
                    : "Để trống nếu không có. Tháng có ngày vào hoặc thôi làm thì giờ tính theo số ngày đi làm."}
                </p>
              </>
            )}
          </SheetSection>
        </div>

        <div className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {loeschFrage ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">Xoá nhân viên này?</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setLoeschFrage(false)}
                  className="rounded-lg px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Không
                </button>
                <button
                  onClick={onDelete}
                  className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-700"
                >
                  Xoá
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {onDelete && (
                <button
                  onClick={() => setLoeschFrage(true)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  Xoá
                </button>
              )}
              <button
                onClick={onClose}
                className="ml-auto rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Huỷ
              </button>
              <button
                onClick={() => onSave(draftToEmployee(d))}
                disabled={!speicherbar}
                className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
              >
                Lưu
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
