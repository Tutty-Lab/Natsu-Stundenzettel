import type { UseScheduleReturn } from "../hooks/useSchedule";
import {
  AZUBI_HOURS_IN_TERM,
  AZUBI_HOURS_OUT_OF_TERM,
  AZUBI_WORKDAYS_IN_TERM,
  type AzubiConfig,
  type WeekdayName,
} from "../types";
import { WEEKDAY_LABELS_VI } from "../lib/demand";
import { AZUBI_MONTHLY_WEEKS, azubiConfigOf, azubiWeeklyHours } from "../lib/azubi";

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

export function AzubiTab({ store }: { store: UseScheduleReturn }) {
  const { schedule, updateEmployee } = store;
  const azubis = schedule.employees.filter((employee) => employee.employmentType === "AZUBI");

  if (azubis.length === 0) {
    return (
      <section className="rounded-lg bg-white border border-slate-200 p-4 sm:p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Azubi</h2>
        <p className="mt-2 text-sm text-slate-500">
          Chưa có Azubi. Sang tab Nhân viên và chọn hình thức Azubi (học nghề).
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <section className="rounded-lg bg-white border border-slate-200 p-4 sm:p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Quy tắc Azubi</h2>
        <p className="mt-1 text-sm text-slate-600">
          Trong kỳ học: <b>{AZUBI_HOURS_IN_TERM}h/tuần</b>, chọn đúng 2 ngày học,
          hệ thống xếp tối đa <b>{AZUBI_WORKDAYS_IN_TERM} ngày làm</b> và để 2 ngày nghỉ.
          Ngoài kỳ học: <b>{AZUBI_HOURS_OUT_OF_TERM}h/tuần</b>. Định mức tháng luôn
          tính cố định {AZUBI_MONTHLY_WEEKS} tuần, tương ứng <b>96h</b> hoặc <b>154h</b>.
        </p>
      </section>

      {azubis.map((employee) => {
        const config = azubiConfigOf(employee.azubi);
        const validSchoolDays = config.schoolDays.length === SCHOOL_DAYS_REQUIRED;
        const setConfig = (patch: Partial<AzubiConfig>) =>
          updateEmployee(employee.id, { azubi: { ...config, ...patch } });

        const toggleSchoolDay = (weekday: WeekdayName) => {
          const selected = config.schoolDays.includes(weekday);
          if (!selected && config.schoolDays.length >= SCHOOL_DAYS_REQUIRED) return;
          setConfig({
            schoolDays: selected
              ? config.schoolDays.filter((day) => day !== weekday)
              : [...config.schoolDays, weekday],
          });
        };

        return (
          <section
            key={employee.id}
            className="rounded-lg bg-white border border-slate-200 p-4 sm:p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">{employee.name}</h3>
              <span className="text-sm text-slate-500">
                <b className="text-slate-900">{employee.targetMinutes / 60}h/tháng</b>
                {" · "}{azubiWeeklyHours(config)}h/tuần
              </span>
            </div>

            <label className="mt-4 flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.inSchoolTerm}
                onChange={(event) => setConfig({ inSchoolTerm: event.target.checked })}
                className="h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
              />
              <span className="text-sm text-slate-700">
                Đang trong kỳ học nghề
                <span className="text-slate-400"> — bỏ tích khi nghỉ hè / ngoài kỳ học</span>
              </span>
            </label>

            {config.inSchoolTerm ? (
              <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-700 mb-2">
                  Chọn đúng 2 ngày đi học (không xếp ca):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((weekday) => {
                    const selected = config.schoolDays.includes(weekday);
                    const disabled =
                      !selected && config.schoolDays.length >= SCHOOL_DAYS_REQUIRED;
                    return (
                      <button
                        key={weekday}
                        type="button"
                        aria-pressed={selected}
                        disabled={disabled}
                        onClick={() => toggleSchoolDay(weekday)}
                        className={`px-3 py-1.5 rounded-full border text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                          selected
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                        }`}
                      >
                        {WEEKDAY_LABELS_VI[weekday]}
                      </button>
                    );
                  })}
                </div>
                {!validSchoolDays && (
                  <p className="mt-2 text-xs font-medium text-amber-700" role="alert">
                    Cần chọn đúng 2 ngày học trước khi tạo lịch.
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  5 ngày còn lại gồm 3 ngày làm và 2 ngày nghỉ; tổng không vượt 24h/tuần.
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Ngoài kỳ học: không khóa ngày học, hệ thống chia tối đa 38,5h trong mỗi tuần.
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
