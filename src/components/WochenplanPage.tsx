import type { Schedule } from "../types";
import { minutesToTime } from "../lib/time";
import {
  WOCHEN_FARBEN,
  WOCHEN_SCHICHTEN,
  wochenplanFor,
  wochenSpanne,
  wochenSpuren,
  type WochenBalken,
} from "../lib/pdf";

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r}, ${g}, ${b})`;

/**
 * Lịch làm việc một tuần dạng BIỂU ĐỒ THỜI GIAN: mỗi ngày một khối, trục
 * ngang là giờ, mỗi ca một thanh từ giờ vào đến giờ ra, tên và giờ nằm trên
 * thanh, màu theo ca. Nhìn là thấy lúc nào đông, lúc nào vắng.
 * Cùng dữ liệu với PDF (wochenplanFor).
 */
export function WochenplanPage({
  schedule,
  dates,
  periodLabel,
}: {
  schedule: Schedule;
  dates: string[];
  periodLabel: string;
}) {
  const tage = wochenplanFor(schedule, dates);
  const { from, to } = wochenSpanne(tage);
  const pct = (minute: number) => ((minute - from) / (to - from)) * 100;
  const hours: number[] = [];
  for (let m = from; m <= to; m += 60) hours.push(m);

  return (
    <div className="wochenplan-page bg-white text-slate-900 p-5 text-[12px] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">


      <div className="flex items-end justify-between border-b-2 border-slate-800 pb-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Dienstplan</h2>
          <p className="text-slate-600">
            {schedule.companyName || "—"}
            {schedule.address && <span className="text-slate-400"> · {schedule.address}</span>}
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-slate-700">{periodLabel}</div>
          <div className="mt-1 flex justify-end gap-3 text-[10px] text-slate-600">
            {WOCHEN_SCHICHTEN.map((s) => (
              <span key={s.key} className="flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-3.5 rounded-sm border"
                  style={{ background: rgb(WOCHEN_FARBEN[s.key].fill), borderColor: rgb(WOCHEN_FARBEN[s.key].edge) }}
                />
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stundenachse */}
      <div className="flex border-b border-slate-800">
        <div className="w-28 shrink-0" />
        <div className="relative h-6 flex-1">
          {hours.map((m) => (
            <span
              key={m}
              className="absolute bottom-1 -translate-x-1/2 text-[10px] tabular-nums text-slate-500 first:translate-x-0 last:-translate-x-full"
              style={{ left: `${pct(m)}%` }}
            >
              {minutesToTime(m)}
            </span>
          ))}
        </div>
      </div>

      {tage.map((t) => (
        <div
          key={t.date}
          className={`flex border-b border-slate-300 break-inside-avoid ${t.closed ? "bg-slate-50" : ""}`}
        >
          <div className="w-28 shrink-0 py-2 pr-2">
            <div className="text-[13px] font-bold">{t.head.split(" ")[0]}</div>
            <div className="text-[11px] text-slate-500">
              {t.head.split(" ")[1]} · {t.people} Pers.
            </div>
            {t.note && <div className="text-[10px] text-amber-700">{t.note}</div>}
          </div>
          <div className="relative flex-1 py-2">
            {/* Stundenlinien */}
            {hours.map((m) => (
              <div key={m} className="absolute inset-y-0 w-px bg-slate-200" style={{ left: `${pct(m)}%` }} />
            ))}
            {t.bars.length === 0 ? (
              <div className="relative text-slate-400">{t.closed ? "geschlossen" : "kein Dienst"}</div>
            ) : (
              <div className="relative space-y-[3px]">
                {/* Dienste ohne Überschneidung teilen sich eine Zeile – wie in der PDF. */}
                {wochenSpuren(t.bars).map((spur, i) => (
                  <div key={i} className="relative h-[18px]">
                    {spur.map((b) => (
                      <Balken key={`${b.name}-${b.start}`} bar={b} left={pct(b.start)} width={pct(b.end) - pct(b.start)} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Ein Dienst als Balken; Name links, Uhrzeit rechts im Balken. */
function Balken({ bar, left, width }: { bar: WochenBalken; left: number; width: number }) {
  const farbe = WOCHEN_FARBEN[bar.schicht];
  const zeit = `${minutesToTime(bar.start)}–${minutesToTime(bar.end)}${bar.pause ? ` · P${bar.pause}` : ""}`;
  return (
    <div
      className="absolute inset-y-0 flex items-center justify-between gap-2 overflow-hidden rounded-sm border-l-[3px] pl-1.5 pr-1 text-[11px] leading-none"
      style={{ left: `${left}%`, width: `${width}%`, background: rgb(farbe.fill), borderColor: rgb(farbe.edge) }}
      title={`${bar.name} ${zeit}`}
    >
      <span className="truncate font-semibold">{bar.name}</span>
      <span className="shrink-0 tabular-nums text-slate-600">{zeit}</span>
    </div>
  );
}
