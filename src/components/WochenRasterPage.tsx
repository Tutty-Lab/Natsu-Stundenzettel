import type { Schedule } from "../types";
import { minutesToDecimalHours } from "../lib/time";
import { wochenRasterFor } from "../lib/pdf";

/**
 * Lịch làm việc một tuần dạng BẢNG: mỗi người một dòng, mỗi ngày một cột, trong
 * ô là giờ vào–giờ ra. Cột cuối là tổng giờ công của tuần. Dùng để dán ở quán.
 * Cùng dữ liệu với PDF (wochenRasterFor).
 */
export function WochenRasterPage({
  schedule,
  dates,
  periodLabel,
}: {
  schedule: Schedule;
  dates: string[];
  periodLabel: string;
}) {
  const { days, rows, people } = wochenRasterFor(schedule, dates);

  return (
    <div className="wochenraster-page bg-white text-slate-900 p-5 text-[11px] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      <div className="flex items-end justify-between border-b-2 border-slate-800 pb-2 mb-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Dienstplan</h2>
          <p className="text-slate-600">
            {schedule.companyName || "—"}
            {schedule.address && <span className="text-slate-400"> · {schedule.address}</span>}
          </p>
        </div>
        <div className="text-sm font-semibold text-slate-700">{periodLabel}</div>
      </div>

      <table className="w-full table-fixed border-collapse border border-slate-800">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[6%]" />
          {days.map((d) => (
            <col key={d.date} />
          ))}
          <col className="w-[7%]" />
        </colgroup>
        <thead className="bg-slate-100">
          <tr className="border-b border-slate-800">
            <th className="px-1.5 py-1 text-left">Name</th>
            <th className="px-1 py-1 text-left">Art</th>
            {days.map((d) => (
              <th key={d.date} className="border-l border-slate-300 px-1 py-1 text-center">
                <div>
                  {d.wd} {d.dm}
                </div>
                {d.note && <div className="truncate text-[9px] font-normal text-amber-700">{d.note}</div>}
              </th>
            ))}
            <th className="border-l border-slate-300 px-1.5 py-1 text-right">Std.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const typWechsel = rows[i + 1] && rows[i + 1].typ !== r.typ;
            return (
              <tr
                key={`${r.name}-${i}`}
                className={`break-inside-avoid ${i % 2 ? "bg-slate-50" : ""} ${
                  typWechsel ? "border-b border-slate-500" : "border-b border-slate-200"
                }`}
              >
                <td className="truncate px-1.5 py-1 font-semibold">{r.name}</td>
                <td className="px-1 py-1 text-slate-600">{r.typ}</td>
                {r.cells.map((cell, k) => (
                  <td key={k} className="border-l border-slate-300 px-1 py-1 text-center tabular-nums">
                    {cell.length === 0 ? (
                      <span className="text-slate-300">–</span>
                    ) : (
                      cell.map((t) => <div key={t}>{t}</div>)
                    )}
                  </td>
                ))}
                <td className="border-l border-slate-300 px-1.5 py-1 text-right font-semibold tabular-nums">
                  {minutesToDecimalHours(r.paidMinutes)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-slate-100 font-semibold text-slate-600">
          <tr className="border-t border-slate-800">
            <td className="px-1.5 py-1" colSpan={2}>
              Personen
            </td>
            {people.map((n, i) => (
              <td key={i} className="border-l border-slate-300 px-1 py-1 text-center">
                {n}
              </td>
            ))}
            <td className="border-l border-slate-300" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
