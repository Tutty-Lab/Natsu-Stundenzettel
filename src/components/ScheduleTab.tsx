import { useMemo, useState } from "react";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import type { Shift } from "../types";
import {
  datesOfMonth,
  parseIsoDate,
  WEEKDAY_SHORT_VI,
  weekdayKeyOf,
} from "../lib/demand";
import { minutesToShortHours, minutesToTime } from "../lib/time";
import { signedHours } from "../lib/dateFormat";
import { nrwHolidays } from "../lib/holidays";
import { resolveDay, type OverrideMap } from "../lib/workHours";
import { dayCoverage, normalizeStaffing } from "../lib/coverage";
import { ShiftCellEditor } from "./ShiftCellEditor";
import { ScheduleDayView } from "./ScheduleDayView";

function isWeekendKey(iso: string): boolean {
  const k = weekdayKeyOf(parseIsoDate(iso));
  return k === "saturday" || k === "sunday";
}

function cellClass(shift: Shift | undefined): string {
  if (!shift) return "shift-free";
  const base =
    shift.shiftType === "EARLY"
      ? "shift-early"
      : shift.shiftType === "MID"
        ? "shift-mid"
        : "shift-late";
  return `${base} ${!shift.generated ? "shift-custom" : ""}`;
}

export function ScheduleTab({ store }: { store: UseScheduleReturn }) {
  const { schedule, validation, genError } = store;
  const [selected, setSelected] = useState<{ employeeId: string; date: string } | null>(null);
  // Mặc định: điện thoại -> xem theo ngày, màn lớn -> bảng tháng.
  const [view, setView] = useState<"grid" | "day">(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches ? "day" : "grid",
  );

  const dates = useMemo(
    () => datesOfMonth(schedule.year, schedule.month),
    [schedule.year, schedule.month],
  );

  // Tra nhanh: employeeId#date -> Shift
  const shiftMap = useMemo(() => {
    const m = new Map<string, Shift>();
    for (const s of schedule.shifts) m.set(`${s.employeeId}#${s.date}`, s);
    return m;
  }, [schedule.shifts]);

  const summaryByEmp = useMemo(
    () => new Map(validation.summaries.map((s) => [s.employee.id, s] as const)),
    [validation.summaries],
  );

  const overridesByDate = useMemo(
    () => new Map(schedule.dateOverrides.map((o) => [o.date, o] as const)),
    [schedule.dateOverrides],
  );

  // Tổng theo ngày cho các dòng chân bảng.
  const dayStats = useMemo(() => {
    const stats = new Map<
      string,
      { people: Set<string>; shifts: number; total: number; early: number; mid: number; late: number }
    >();
    for (const d of dates) stats.set(d, { people: new Set(), shifts: 0, total: 0, early: 0, mid: 0, late: 0 });
    for (const s of schedule.shifts) {
      const st = stats.get(s.date);
      if (!st) continue;
      // „Số nhân viên" zählt PERSONEN – wer zweimal am Tag arbeitet, ist eine
      // Person mit zwei Diensten (Zeile „Số ca" darunter).
      st.people.add(s.employeeId);
      st.shifts += 1;
      st.total += s.paidMinutes;
      if (s.shiftType === "EARLY") st.early += 1;
      else if (s.shiftType === "MID") st.mid += 1;
      else st.late += 1; // LATE hoặc CUSTOM tính là ca tối
    }
    return stats;
  }, [dates, schedule.shifts]);

  // Debug wie Thiên Long: je Zeitfenster der Filiale (Cả ngày + Stoßzeiten aus
  // Cài đặt) die WENIGSTEN Anwesenden, die Mindestbesetzung und das dynamische
  // „nên có" (siehe lib/coverage.ts).
  const staffing = useMemo(() => normalizeStaffing(schedule.staffing, store.storeId), [schedule.staffing, store.storeId]);
  const coverageRows = useMemo<CoverageWindow[]>(
    () => [
      { key: "all", label: "Cả ngày" },
      ...staffing.peaks.map((p, i) => ({
        key: `peak-${i}`,
        label: `${p.label} ${minutesToTime(p.startMinutes)}–${minutesToTime(p.endMinutes)}`,
        from: p.startMinutes,
        to: p.endMinutes,
      })),
    ],
    [staffing],
  );
  const coverage = useMemo(() => {
    const holidays = nrwHolidays(schedule.year);
    const overrides: OverrideMap = Object.fromEntries(schedule.dateOverrides.map((o) => [o.date, o]));
    const byDate = new Map<string, Shift[]>();
    for (const s of schedule.shifts) {
      const list = byDate.get(s.date);
      if (list) list.push(s);
      else byDate.set(s.date, [s]);
    }
    const result = new Map<string, Map<string, Coverage | null>>();
    for (const d of dates) {
      const row = new Map<string, Coverage | null>();
      const day = resolveDay(schedule.workHours, d, holidays, overrides);
      const { slots } = day.closed ? { slots: [] } : dayCoverage(byDate.get(d) ?? [], day.window, staffing);
      for (const w of coverageRows) {
        const inWindow = slots.filter((x) => x.t >= (w.from ?? 0) && x.t + 30 <= (w.to ?? 24 * 60));
        if (inWindow.length === 0) {
          row.set(w.key, null);
          continue;
        }
        const weakest = inWindow.reduce((a, b) => (b.have < a.have ? b : a));
        const busiest = inWindow.reduce((a, b) => (b.have > a.have ? b : a));
        // Thiếu = có takt dưới mức tối thiểu CỦA CHÍNH takt đó (Cả ngày gồm cả giờ cao điểm).
        const worst = inWindow.reduce((a, b) => (b.have - b.floor < a.have - a.floor ? b : a));
        const short = worst.have < worst.floor;
        row.set(w.key, {
          count: short ? worst.have : weakest.have,
          at: short ? worst.t : weakest.t,
          need: short ? worst.floor : weakest.floor,
          // „nên có" an genau dem gezeigten Takt (in einer Stoßzeit überall gleich).
          target: Math.round((short ? worst : weakest).target),
          max: busiest.have,
          maxAt: busiest.t,
        });
      }
      result.set(d, row);
    }
    return result;
  }, [dates, schedule.shifts, schedule.workHours, schedule.dateOverrides, schedule.year, staffing, coverageRows]);

  const hasEmployees = schedule.employees.length > 0;

  return (
    <section>
      {/* „+ Tạo lịch làm việc", „Lịch đã lưu" und der Monat sitzen in App.tsx. */}

      {/* Chuyển chế độ xem */}
      {hasEmployees && (
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 mb-3">
          <button
            onClick={() => setView("day")}
            className={`px-3 py-1.5 text-sm rounded-md ${
              view === "day" ? "bg-slate-900 text-white" : "text-slate-600"
            }`}
          >
            Theo ngày
          </button>
          <button
            onClick={() => setView("grid")}
            className={`px-3 py-1.5 text-sm rounded-md ${
              view === "grid" ? "bg-slate-900 text-white" : "text-slate-600"
            }`}
          >
            Bảng tháng
          </button>
        </div>
      )}

      {genError && (
        <div className="mb-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">
          {genError}
        </div>
      )}

      {/* Lỗi kiểm tra */}
      {!validation.valid && schedule.shifts.length > 0 && (
        <div className="mb-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">
          <div className="font-medium mb-1">Lỗi kiểm tra ({validation.errors.length}):</div>
          <ul className="list-disc pl-5 space-y-0.5 max-h-40 overflow-auto">
            {validation.errors.slice(0, 30).map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Chú thích (chỉ ở bảng tháng) */}
      {view === "grid" && (
        <div className="flex flex-wrap gap-3 mb-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border shift-early" /> Ca sáng
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border shift-late" /> Ca tối
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border shift-mid" /> Ca chuyển tiếp
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border shift-free" /> Nghỉ
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border shift-custom bg-white" /> Đã sửa tay
          </span>
        </div>
      )}

      {!hasEmployees ? (
        <div className="rounded bg-white border border-slate-200 p-6 text-center text-slate-400">
          Vui lòng thêm nhân viên trước.
        </div>
      ) : view === "day" ? (
        <ScheduleDayView store={store} onEdit={(employeeId, date) => setSelected({ employeeId, date })} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white -mx-3 sm:mx-0">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-slate-100 border-b border-r border-slate-200 px-2 py-2 text-left min-w-[130px]">
                  Nhân viên
                </th>
                <th className="bg-slate-100 border-b border-slate-200 px-2 py-2 text-left">Loại</th>
                <th className="bg-slate-100 border-b border-slate-200 px-2 py-2 text-right">Định mức</th>
                {dates.map((d) => {
                  const day = parseIsoDate(d).getDate();
                  const wk = WEEKDAY_SHORT_VI[weekdayKeyOf(parseIsoDate(d))];
                  const ov = overridesByDate.get(d);
                  const headerBg = ov?.closed
                    ? "bg-rose-100"
                    : ov
                      ? "bg-sky-100"
                      : isWeekendKey(d)
                        ? "bg-slate-200"
                        : "bg-slate-100";
                  return (
                    <th
                      key={d}
                      title={
                        ov?.closed
                          ? `Đóng cửa${ov.note ? " · " + ov.note : ""}`
                          : ov
                            ? `Giờ riêng${ov.note ? " · " + ov.note : ""}`
                            : undefined
                      }
                      className={`border-b border-l border-slate-200 px-1 py-1 text-center min-w-[88px] ${headerBg}`}
                    >
                      <div className="font-semibold">{day}</div>
                      <div className="text-[10px] text-slate-500">{wk}</div>
                      {ov?.closed && <div className="text-[9px] text-rose-600 font-medium">Đóng cửa</div>}
                      {ov && !ov.closed && <div className="text-[9px] text-sky-700 font-medium">Giờ riêng</div>}
                    </th>
                  );
                })}
                <th className="bg-slate-100 border-b border-l border-slate-200 px-2 py-2 text-right min-w-[64px]">
                  Đã xếp
                </th>
                <th className="bg-slate-100 border-b border-l border-slate-200 px-2 py-2 text-right min-w-[70px]">
                  Chênh lệch
                </th>
              </tr>
            </thead>
            <tbody>
              {schedule.employees.map((emp) => {
                const sum = summaryByEmp.get(emp.id);
                const diff = sum?.diffMinutes ?? -emp.targetMinutes;
                return (
                  <tr key={emp.id} className="hover:bg-slate-50/50">
                    <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-2 py-1 font-medium whitespace-nowrap">
                      {emp.name}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1 text-slate-500">
                      {emp.employmentType === "VOLLZEIT"
                        ? "TT"
                        : emp.employmentType === "AZUBI"
                          ? "AZ"
                          : "BT"}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1 text-right text-slate-500">
                      {emp.targetMinutes / 60}h
                    </td>
                    {dates.map((d) => {
                      const shift = shiftMap.get(`${emp.id}#${d}`);
                      return (
                        <td
                          key={d}
                          onClick={() => setSelected({ employeeId: emp.id, date: d })}
                          className={`border-b border-l border-slate-200 px-1 py-1 text-center cursor-pointer align-middle ${cellClass(
                            shift,
                          )}`}
                          title="Bấm để sửa"
                        >
                          {shift ? (
                            <div className="leading-tight">
                              <div className="font-medium">
                                {minutesToTime(shift.startMinutes)}–{minutesToTime(shift.endMinutes)}
                              </div>
                              <div className="text-[10px] opacity-80">
                                {minutesToShortHours(shift.paidMinutes)}
                                {shift.pauseMinutes > 0 && ` · Nghỉ ${shift.pauseMinutes}`}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px]">Nghỉ</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-l border-slate-200 px-2 py-1 text-right font-medium">
                      {((sum?.assignedMinutes ?? 0) / 60).toLocaleString("de-DE", {
                        maximumFractionDigits: 2,
                      })}
                      h
                    </td>
                    <td
                      className={`border-b border-l border-slate-200 px-2 py-1 text-right font-medium ${
                        diff === 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {signedHours(diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <SummaryRow label="Số nhân viên" dates={dates} value={(d) => String(dayStats.get(d)!.people.size)} />
              <SummaryRow label="Số ca" dates={dates} value={(d) => String(dayStats.get(d)!.shifts)} />
              <SummaryRow
                label="Tổng giờ"
                dates={dates}
                value={(d) => minutesToShortHours(dayStats.get(d)!.total)}
              />
              <SummaryRow label="Ca sáng" dates={dates} value={(d) => String(dayStats.get(d)!.early)} />
              <SummaryRow
                label="Ca chuyển tiếp"
                dates={dates}
                value={(d) => String(dayStats.get(d)!.mid)}
              />
              <SummaryRow label="Ca tối" dates={dates} value={(d) => String(dayStats.get(d)!.late)} />
              {schedule.shifts.length > 0 && (
                <>
                  {coverageRows.map((w) => (
                    <CoverageRow
                      key={w.key}
                      label={w.label}
                      tag="ít nhất · nên"
                      dates={dates}
                      cell={(d) => coverage.get(d)?.get(w.key) ?? null}
                    />
                  ))}
                  <CoverageRow
                    label="Cả ngày"
                    tag="nhiều nhất"
                    peak
                    dates={dates}
                    cell={(d) => coverage.get(d)?.get("all") ?? null}
                  />
                </>
              )}
            </tfoot>
          </table>
        </div>
      )}

      {selected && (
        <ShiftCellEditor
          store={store}
          employeeId={selected.employeeId}
          date={selected.date}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

function SummaryRow({
  label,
  dates,
  value,
}: {
  label: string;
  dates: string[];
  value: (d: string) => string;
}) {
  return (
    <tr className="bg-slate-50 text-slate-600">
      <td className="sticky left-0 z-10 bg-slate-50 border-t border-r border-slate-200 px-2 py-1 font-medium whitespace-nowrap">
        {label}
      </td>
      <td className="border-t border-slate-200" />
      <td className="border-t border-slate-200" />
      {dates.map((d) => (
        <td key={d} className="border-t border-l border-slate-200 px-1 py-1 text-center">
          {value(d)}
        </td>
      ))}
      <td className="border-t border-l border-slate-200" />
      <td className="border-t border-l border-slate-200" />
    </tr>
  );
}

/**
 * Ein Zeitfenster eines Tages: wenigste Anwesende (count, ab `at`), meiste
 * (max, ab `maxAt`), Mindestbesetzung (need) und dynamisches „nên có" (target).
 */
type Coverage = { count: number; at: number; need: number; target: number; max: number; maxAt: number };

type CoverageWindow = { key: string; label: string; from?: number; to?: number };

/**
 * Dòng độ phủ: số người ít nhất trong khung (giờ bên dưới), „nên N" nhỏ bên
 * cạnh. Dưới mức tối thiểu = đỏ + „cần N"; dưới „nên có" = vàng. Dòng „nhiều
 * nhất" chỉ để xem chỗ thừa người, không tô.
 */
function CoverageRow({
  label,
  tag,
  peak,
  dates,
  cell,
}: {
  label: string;
  tag: string;
  peak?: boolean;
  dates: string[];
  cell: (d: string) => Coverage | null;
}) {
  return (
    <tr className="bg-slate-50 text-slate-600">
      <td className="sticky left-0 z-10 bg-slate-50 border-t border-r border-slate-200 px-2 py-1 font-medium whitespace-nowrap">
        {label} <span className="text-[11px] font-normal text-slate-400">{tag}</span>
      </td>
      <td className="border-t border-slate-200" />
      <td className="border-t border-slate-200" />
      {dates.map((d) => {
        const c = cell(d);
        if (!c) {
          return (
            <td key={d} className="border-t border-l border-slate-200 px-1 py-1 text-center text-slate-300" title="Đóng cửa">
              –
            </td>
          );
        }
        if (peak) {
          return (
            <td
              key={d}
              className="border-t border-l border-slate-200 px-1 py-1 text-center"
              title={`${c.max} người lúc ${minutesToTime(c.maxAt)}–${minutesToTime(c.maxAt + 30)}`}
            >
              {c.max}
              <span className="block text-[10px] leading-none opacity-60">{minutesToTime(c.maxAt)}</span>
            </td>
          );
        }
        const short = c.count < c.need;
        const tone = short
          ? "bg-rose-50 text-rose-700 font-semibold outline outline-2 -outline-offset-2 outline-rose-500"
          : c.count < c.target
            ? "bg-amber-50 text-amber-800"
            : "";
        return (
          <td
            key={d}
            className={`border-t border-l border-slate-200 px-1 py-1 text-center ${tone}`}
            title={`Ít nhất ${c.count} người lúc ${minutesToTime(c.at)}–${minutesToTime(c.at + 30)} · tối thiểu ${c.need} · nên có ~${c.target}`}
          >
            {c.count}
            <span className="ml-0.5 text-[10px] font-normal opacity-60">/ {c.target}</span>
            <span className="block text-[10px] leading-none opacity-60">
              {short ? `cần ${c.need}` : minutesToTime(c.at)}
            </span>
          </td>
        );
      })}
      <td className="border-t border-l border-slate-200" />
      <td className="border-t border-l border-slate-200" />
    </tr>
  );
}
