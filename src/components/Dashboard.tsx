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
      {/* Thống kê luôn hiện (không thu gọn), trạng thái đứng đầu. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <Stat label="Trạng thái kiểm tra" value={statusValue} accent={statusAccent} />
        <Stat label="Số nhân viên" value={String(schedule.employees.length)} />
        <Stat label="Toàn thời gian" value={String(vz)} />
        <Stat label="Bán thời gian" value={String(tz)} />
        <Stat label="Azubi" value={String(azubi)} />
        <Stat label="Tổng giờ định mức" value={`${minutesToDecimalHours(targetMin)} h`} />
        <Stat label="Tổng giờ đã xếp" value={`${minutesToDecimalHours(plannedMin)} h`} />
      </div>
    </div>
  );
}
