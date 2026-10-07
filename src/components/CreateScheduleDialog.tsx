import { useState } from "react";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import { MONTH_NAMES_VI } from "../lib/dateFormat";
import { WEEKDAY_SHORT_VI, datesOfMonth, parseIsoDate, weekdayKeyOf } from "../lib/demand";
import { nrwHolidayNames } from "../lib/holidays";
import { minutesToTime } from "../lib/time";
import { azubiConfigOf } from "../lib/azubi";
import { activeDays } from "../lib/employmentPeriod";
import { effectiveTargets } from "../lib/scheduler";
import type { OverrideMap } from "../lib/workHours";

/** „T7 03.10" */
function dayLabel(iso: string): string {
  return `${WEEKDAY_SHORT_VI[weekdayKeyOf(parseIsoDate(iso))]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

const fmtH = (minutes: number) => String(Math.round(minutes / 6) / 10).replace(".", ",");

/**
 * „Tạo lịch làm việc" (wie Thiên Long): fragt Monat und Jahr ab und zeigt vor
 * dem Erzeugen, was in diesem Monat besonders ist – Feiertage, geschlossene
 * Tage / eigene Zeiten, Ein- und Austritte, Azubi in der Schulzeit – für beide
 * Filialen. Danach werden beide Filialen auf einmal erzeugt.
 */
export function CreateScheduleDialog({
  stores,
  initialYear,
  initialMonth,
  onClose,
  onCreate,
}: {
  stores: UseScheduleReturn[];
  initialYear: number;
  initialMonth: number;
  onClose: () => void;
  onCreate: (year: number, month: number) => void;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const thisYear = new Date().getFullYear();
  const years = [...new Set([thisYear - 1, thisYear, thisYear + 1, initialYear])].sort();

  const dates = datesOfMonth(year, month);
  const holidays = [...nrwHolidayNames(year)].filter(([iso]) => dates.includes(iso));
  const anyEmployees = stores.some((s) => s.schedule.employees.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="popup-card w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
          <h3 className="font-semibold text-slate-900">Tạo lịch làm việc</h3>
          <p className="text-xs text-slate-500">Tạo cho cả 2 quán. Chọn tháng và kiểm tra trước khi tạo.</p>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col">
              <span className="mb-1 text-xs text-slate-600">Tháng</span>
              <select
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base sm:text-sm"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {MONTH_NAMES_VI.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col">
              <span className="mb-1 text-xs text-slate-600">Năm</span>
              <select
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base sm:text-sm"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <InfoBlock title="Ngày lễ" empty="Không có ngày lễ.">
            {holidays.map(([iso, name]) => (
              <li key={iso}>
                <b>{dayLabel(iso)}</b> · {name} <span className="text-slate-400">(giờ Chủ nhật)</span>
              </li>
            ))}
          </InfoBlock>

          {stores.map((store) => (
            <StoreMonthInfo key={store.storeId} store={store} year={year} month={month} dates={dates} />
          ))}
        </div>

        <div className="sticky bottom-0 flex items-center gap-2 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={onClose}
            className="ml-auto rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Huỷ
          </button>
          <button
            onClick={() => onCreate(year, month)}
            disabled={!anyEmployees}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            Tạo lịch {month}/{year}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      {children.length === 0 ? (
        <p className="text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-0.5 text-sm text-slate-700">{children}</ul>
      )}
    </section>
  );
}

/** Was in diesem Monat für EINE Filiale besonders ist. */
function StoreMonthInfo({
  store,
  year,
  month,
  dates,
}: {
  store: UseScheduleReturn;
  year: number;
  month: number;
  dates: string[];
}) {
  const { schedule } = store;
  const overrides = schedule.dateOverrides.filter((o) => dates.includes(o.date));
  const overrideMap: OverrideMap = Object.fromEntries(overrides.map((o) => [o.date, o]));
  const targets = effectiveTargets({
    year,
    month,
    workHours: schedule.workHours,
    overrides: overrideMap,
    employees: schedule.employees,
  });
  const total = schedule.employees.reduce((sum, e) => sum + (targets.get(e.id) ?? 0), 0);
  const partial = schedule.employees
    .map((e) => ({ e, days: activeDays(e, dates) }))
    .filter(({ days }) => days < dates.length);
  const azubiInTerm = schedule.employees.filter(
    (e) => e.employmentType === "AZUBI" && azubiConfigOf(e.azubi).inSchoolTerm,
  );
  const existing = store.savedMonths.find((m) => m.year === year && m.month === month);

  const items: React.ReactNode[] = [
    ...overrides.map((o) =>
      o.closed ? (
        <li key={o.date}>
          <b>{dayLabel(o.date)}</b> · <span className="text-rose-700">đóng cửa</span>
          {o.note ? ` · ${o.note}` : ""}
        </li>
      ) : (
        <li key={o.date}>
          <b>{dayLabel(o.date)}</b> · giờ riêng{" "}
          {o.window ? `${minutesToTime(o.window.startMinutes)}–${minutesToTime(o.window.endMinutes)}` : ""}
          {o.note ? ` · ${o.note}` : ""}
        </li>
      ),
    ),
    ...partial.map(({ e, days }) => (
      <li key={e.id}>
        <b>{e.name}</b> ·{" "}
        {days === 0 ? (
          <span className="text-slate-500">không làm tháng này</span>
        ) : (
          <>
            làm {days}/{dates.length} ngày
            {e.startDate && dates.includes(e.startDate) ? ` · vào ${dayLabel(e.startDate)}` : ""}
            {e.endDate && dates.includes(e.endDate) ? ` · thôi làm ${dayLabel(e.endDate)}` : ""}
          </>
        )}
      </li>
    )),
    ...azubiInTerm.map((e) => (
      <li key={`az-${e.id}`}>
        <b>{e.name}</b> · Azubi kỳ học, đi học{" "}
        {azubiConfigOf(e.azubi).schoolDays.map((d) => WEEKDAY_SHORT_VI[d]).join(" ") || "—"}
      </li>
    )),
  ];

  return (
    <section className="rounded-lg border border-slate-200 p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h4 className="truncate text-sm font-semibold text-slate-900">{store.storeConfig.name}</h4>
        <span className="shrink-0 text-xs text-slate-500">
          {schedule.employees.length} người · {fmtH(total)}h
        </span>
      </div>
      {schedule.employees.length === 0 ? (
        <p className="text-sm text-slate-400">Chưa có nhân viên – bỏ qua quán này.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400">Không có ngày đóng cửa, giờ riêng hay thay đổi nhân sự.</p>
      ) : (
        <ul className="space-y-0.5 text-sm text-slate-700">{items}</ul>
      )}
      {existing && (
        <p className="mt-2 rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-xs text-amber-800">
          Đã có lịch tháng này ({existing.shiftCount} ca). Tạo lại sẽ thay lịch này, kể cả ca đã sửa tay.
        </p>
      )}
    </section>
  );
}
