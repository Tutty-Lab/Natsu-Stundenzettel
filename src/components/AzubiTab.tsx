import type { UseScheduleReturn } from "../hooks/useSchedule";
import {
  AZUBI_HOURS_IN_TERM,
  AZUBI_HOURS_OUT_OF_TERM,
  AZUBI_WORKDAYS_IN_TERM,
  type AzubiConfig,
  type Employee,
  type WeekdayName,
} from "../types";
import { WEEKDAY_LABELS_VI, WEEKDAY_SHORT_VI } from "../lib/demand";
import {
  AZUBI_MONTHLY_WEEKS,
  azubiConfigOf,
  azubiWeeklyHours,
  azubiWeeklyLimit,
} from "../lib/azubi";

const WEEKDAYS: WeekdayName[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const SCHOOL_DAYS_REQUIRED = 2;

const fmtH = (hours: number) => String(hours).replace(".", ",");

export function AzubiTab({ store }: { store: UseScheduleReturn }) {
  const { schedule, updateEmployee } = store;
  const azubis = schedule.employees.filter((employee) => employee.employmentType === "AZUBI");

  return (
    <section className="max-w-4xl rounded-lg bg-white border border-slate-200 shadow-sm">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-base font-semibold text-slate-900">Azubi</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Kỳ học: tối đa {AZUBI_HOURS_IN_TERM}h/tuần, {AZUBI_WORKDAYS_IN_TERM} ngày làm, 2 ngày
          học. Ngoài kỳ học: tối đa {fmtH(AZUBI_HOURS_OUT_OF_TERM)}h/tuần. Giờ tháng = giờ tuần ×{" "}
          {AZUBI_MONTHLY_WEEKS}.
        </p>
      </div>

      {azubis.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500">
          Chưa có Azubi. Mở tab Nhân viên và chọn hình thức Azubi.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {azubis.map((employee) => (
            <AzubiRow
              key={employee.id}
              employee={employee}
              onChange={(azubi) => updateEmployee(employee.id, { azubi })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AzubiRow({
  employee,
  onChange,
}: {
  employee: Employee;
  onChange: (config: AzubiConfig) => void;
}) {
  const config = azubiConfigOf(employee.azubi);
  const weeklyHours = azubiWeeklyHours(config);
  const weeklyLimit = azubiWeeklyLimit(config);
  const setConfig = (patch: Partial<AzubiConfig>) => onChange({ ...config, ...patch });

  const setWeeklyHours = (value: number) => {
    const normalized = Math.max(0, Math.round(value * 2) / 2);
    setConfig(
      config.inSchoolTerm
        ? { weeklyHoursInTerm: normalized }
        : { weeklyHoursOutOfTerm: normalized },
    );
  };

  const toggleSchoolDay = (weekday: WeekdayName) => {
    const selected = config.schoolDays.includes(weekday);
    if (!selected && config.schoolDays.length >= SCHOOL_DAYS_REQUIRED) return;
    setConfig({
      schoolDays: selected
        ? config.schoolDays.filter((day) => day !== weekday)
        : [...config.schoolDays, weekday],
    });
  };

  const problems: string[] = [];
  if (weeklyHours > weeklyLimit) problems.push(`Vượt mức tối đa ${fmtH(weeklyLimit)}h/tuần.`);
  if (config.inSchoolTerm && config.schoolDays.length !== SCHOOL_DAYS_REQUIRED) {
    problems.push("Chọn đúng 2 ngày học.");
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[9rem] flex-1">
          <div className="font-medium text-slate-900">{employee.name}</div>
          <div className="text-xs text-slate-500">
            {employee.targetMinutes / 60}h/tháng
          </div>
        </div>

        <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={config.inSchoolTerm}
            onChange={(event) => setConfig({ inSchoolTerm: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
          />
          Kỳ học
        </label>

        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="number"
            min={0}
            step={0.5}
            value={weeklyHours}
            onChange={(event) => setWeeklyHours(Number(event.target.value))}
            aria-label={`Giờ mỗi tuần của ${employee.name}`}
            className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <span className="text-slate-500">/ tối đa {fmtH(weeklyLimit)}h mỗi tuần</span>
        </label>

        {config.inSchoolTerm ? (
          <div className="flex items-center gap-1" role="group" aria-label="Ngày học">
            <span className="mr-1 text-xs text-slate-500">Ngày học</span>
            {WEEKDAYS.map((weekday) => {
              const selected = config.schoolDays.includes(weekday);
              const disabled = !selected && config.schoolDays.length >= SCHOOL_DAYS_REQUIRED;
              return (
                <button
                  key={weekday}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => toggleSchoolDay(weekday)}
                  title={WEEKDAY_LABELS_VI[weekday]}
                  className={`w-8 rounded border py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                    selected
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  {WEEKDAY_SHORT_VI[weekday]}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="text-xs text-emerald-700">Ngoài kỳ học: làm cả tuần</span>
        )}
      </div>

      {problems.length > 0 && (
        <p className="mt-1.5 text-xs font-medium text-amber-700" role="alert">
          {problems.join(" ")} Sửa trước khi tạo lịch.
        </p>
      )}
    </li>
  );
}
