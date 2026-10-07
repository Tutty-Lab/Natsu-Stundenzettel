import type { UseScheduleReturn } from "../hooks/useSchedule";
import { minutesToDecimalHours } from "../lib/time";

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-sm">
      <div className="text-[11px] sm:text-xs text-slate-500 leading-tight">{label}</div>
      <div className={`text-base sm:text-lg font-semibold leading-tight ${accent ?? "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

export function Dashboard({ store }: { store: UseScheduleReturn }) {
  const { schedule, validation } = store;
  const vz = schedule.employees.filter((e) => e.employmentType === "VOLLZEIT").length;
  const tz = schedule.employees.filter((e) => e.employmentType === "TEILZEIT").length;
  const azubi = schedule.employees.filter((e) => e.employmentType === "AZUBI").length;
  // Wirksames Soll des Monats (Wochenvertrag 40 h/Woche, Ein-/Austritt), nicht
  // das eingetragene 176 h – sonst passen „định mức" und „đã xếp" nie zusammen.
  const targetMin = validation.summaries.reduce((s, x) => s + x.targetMinutes, 0);
  const plannedMin = schedule.shifts.reduce((s, x) => s + x.paidMinutes, 0);
  const notGenerated = schedule.shifts.length === 0;

  // Trước khi tạo lịch: trạng thái trung tính (chưa xếp giờ nào nên chưa thể "lỗi").
  const statusValue = notGenerated
    ? "Chưa tạo lịch"
    : validation.valid
      ? "Hợp lệ"
      : `${validation.errors.length} lỗi`;
  const statusAccent = notGenerated
    ? "text-slate-500"
    : validation.valid
      ? "text-emerald-600"
      : "text-rose-600";

  return (
    <div>
      {/* Kurzfassung immer sichtbar; Einzelzahlen nur aufgeklappt (wie Thiên Long). */}
      <details className="group rounded-lg bg-white border border-slate-200 shadow-sm">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
          <span className={`font-semibold ${statusAccent}`}>{statusValue}</span>
          <span className="text-slate-600">
            {schedule.employees.length} nhân viên · định mức {minutesToDecimalHours(targetMin)} h · đã xếp{" "}
            {minutesToDecimalHours(plannedMin)} h
          </span>
          <span className="ml-auto text-xs text-slate-400 group-open:hidden">Chi tiết ▾</span>
          <span className="ml-auto hidden text-xs text-slate-400 group-open:inline">Thu gọn ▴</span>
        </summary>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 border-t border-slate-100 p-2">
          <Stat label="Số nhân viên" value={String(schedule.employees.length)} />
          <Stat label="Toàn thời gian" value={String(vz)} />
          <Stat label="Bán thời gian" value={String(tz)} />
          <Stat label="Azubi" value={String(azubi)} />
          <Stat label="Tổng giờ định mức" value={`${minutesToDecimalHours(targetMin)} h`} />
          <Stat label="Tổng giờ đã xếp" value={`${minutesToDecimalHours(plannedMin)} h`} />
          <Stat label="Trạng thái kiểm tra" value={statusValue} accent={statusAccent} />
        </div>
      </details>
      {notGenerated && schedule.employees.length > 0 && (
        <div className="mt-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2">
          Chưa có lịch tháng này. Bấm „+ Tạo lịch làm việc" để tạo lịch.
        </div>
      )}
      {notGenerated && schedule.employees.length === 0 && (
        <div className="mt-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2">
          Chưa có nhân viên. Mở tab „Nhân viên" và bấm „+ Thêm".
        </div>
      )}
      {validation.valid && schedule.shifts.length > 0 && (
        <div className="mt-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2">
          Tất cả giờ định mức đã được phân bổ chính xác.
        </div>
      )}
    </div>
  );
}
