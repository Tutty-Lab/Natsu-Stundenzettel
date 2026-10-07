import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import type { Employee } from "../types";
import {
  buildStundenzettelPdf,
  buildWochenplanPdf,
  buildWochenRasterPdf,
  savePdf,
  safeFileName,
  type WocheZumDruck,
} from "../lib/pdf";
import { StundenzettelPage } from "./StundenzettelPage";
import { WochenplanPage } from "./WochenplanPage";
import { WochenRasterPage } from "./WochenRasterPage";
import { weeksOfMonth } from "../lib/weeks";

/** Was gedruckt wird: Wochen-Dienstplan (ganzer Laden) oder Stundenzettel je Person. */
type Mode = "week" | "timesheet";
/** Form des Wochenplans: Tabelle Person × Tag oder Zeitleiste je Tag. */
type Layout = "table" | "timeline";

/** Was gerade im (unsichtbaren) Druckbereich steht. */
type PrintJob =
  | { kind: "week"; layout: Layout; weeks: WocheZumDruck[] }
  | { kind: "timesheet"; employees: Employee[]; period?: WocheZumDruck };

const ALL = "all";

/**
 * Zwei Tabs teilen sich diese Komponente: „Bảng chấm công" (Stundenzettel je
 * Person) und „Thời gian biểu" (Wochen-Dienstplan des ganzen Ladens, je Woche
 * eine Seite).
 */
export function StundenzettelTab({ store, kind = "timesheet" }: { store: UseScheduleReturn; kind?: Mode }) {
  const { schedule } = store;
  const mode = kind;
  const [layout, setLayout] = useState<Layout>("table");
  // Stundenzettel: Person (ALL = alle) und Zeitraum (ALL = ganzer Monat, sonst weekStart).
  const [who, setWho] = useState<string>(ALL);
  const [period, setPeriod] = useState<string>(ALL);
  const [job, setJob] = useState<PrintJob | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<string>("");

  const weeks = useMemo(
    () =>
      weeksOfMonth(schedule.year, schedule.month).map((w, i) => ({
        ...w,
        number: i + 1,
        title: `Woche ${w.label}${schedule.year}`,
      })),
    [schedule.year, schedule.month],
  );
  const monthTag = `${schedule.year}-${String(schedule.month).padStart(2, "0")}`;
  // Thời gian biểu: ALL = jede Woche des Monats (je Woche eine Seite), sonst
  // weekStart. Start: die Woche mit dem heutigen Tag, sonst die erste.
  const [weekKey, setWeekKey] = useState<string>(() => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return (weeks.find((w) => w.dates.includes(iso)) ?? weeks[0])?.weekStart ?? ALL;
  });

  const chosenWeeks: WocheZumDruck[] = (weekKey === ALL ? weeks : weeks.filter((w) => w.weekStart === weekKey)).map(
    (w) => ({ dates: w.dates, label: w.title }),
  );
  const chosenEmployees = who === ALL ? schedule.employees : schedule.employees.filter((e) => e.id === who);
  const periodWeek = weeks.find((w) => w.weekStart === period);
  const chosenPeriod: WocheZumDruck | undefined = periodWeek
    ? { dates: periodWeek.dates, label: periodWeek.title }
    : undefined;
  const previewEmployee = chosenEmployees[0] ?? null;

  // Vùng in phải được render TRƯỚC khi gọi print, và print phải nằm trong cùng
  // thao tác chạm (mobile chặn print ngoài gesture). flushSync render đồng bộ.
  function onPrint() {
    const next: PrintJob =
      mode === "week"
        ? { kind: "week", layout, weeks: chosenWeeks }
        : { kind: "timesheet", employees: chosenEmployees, period: chosenPeriod };
    flushSync(() => setJob(next));
    window.print();
  }

  async function onPdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfProgress("");
    // Kurzer Yield, damit „Đang tạo PDF…" zuerst sichtbar wird.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      if (mode === "week") {
        const doc =
          layout === "table"
            ? buildWochenRasterPdf(schedule, chosenWeeks)
            : buildWochenplanPdf(schedule, chosenWeeks);
        const weekTag = weekKey === ALL ? "ca_thang" : `tuan_${weekKey}`;
        savePdf(doc, `Dienstplan_${monthTag}_${weekTag}.pdf`);
      } else {
        const whoTag = who === ALL ? "tat_ca" : safeFileName(previewEmployee?.name ?? who);
        const periodTag = periodWeek ? `_tuan_${periodWeek.weekStart}` : "";
        const doc = await buildStundenzettelPdf(
          schedule,
          chosenEmployees,
          { dates: chosenPeriod?.dates, periodLabel: chosenPeriod?.label },
          (current, total) => {
            if (total > 1) setPdfProgress(`${current}/${total}`);
          },
        );
        savePdf(doc, `Stundenzettel_${whoTag}_${monthTag}${periodTag}.pdf`);
      }
    } catch (error) {
      alert(`Không tạo được PDF: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPdfBusy(false);
      setPdfProgress("");
    }
  }

  if (schedule.employees.length === 0) {
    return (
      <div className="no-print rounded bg-white border border-slate-200 p-6 text-center text-slate-400">
        Thêm nhân viên và tạo lịch làm việc trước.
      </div>
    );
  }

  const selectClass = "rounded border border-slate-300 px-2 py-1.5 text-sm";
  const previewWeek = chosenWeeks[0];

  return (
    <>
      <div className="no-print">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 mb-3 flex flex-wrap items-center gap-2">
          {mode === "week" ? (
            <>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Tuần">
                {weeks.map((w) => (
                  <button
                    key={w.weekStart}
                    type="button"
                    aria-pressed={weekKey === w.weekStart}
                    onClick={() => setWeekKey(w.weekStart)}
                    className={`rounded-full border px-3 py-1 text-sm ${
                      weekKey === w.weekStart
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
                    }`}
                  >
                    Tuần {w.number} <span className="opacity-70">{w.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={weekKey === ALL}
                  onClick={() => setWeekKey(ALL)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    weekKey === ALL
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
                  }`}
                >
                  Cả tháng
                </button>
              </div>
              <select aria-label="Dạng" className={selectClass} value={layout} onChange={(e) => setLayout(e.target.value as Layout)}>
                <option value="table">Bảng: nhân viên × ngày</option>
                <option value="timeline">Biểu đồ giờ theo ngày</option>
              </select>
            </>
          ) : (
            <>
              <select aria-label="Nhân viên" className={selectClass} value={who} onChange={(e) => setWho(e.target.value)}>
                <option value={ALL}>Tất cả nhân viên</option>
                {schedule.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <select aria-label="Thời gian" className={selectClass} value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value={ALL}>Cả tháng</option>
                {weeks.map((w) => (
                  <option key={w.weekStart} value={w.weekStart}>
                    Tuần {w.number}: {w.label}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            {pdfBusy && (
              <span className="text-sm text-slate-500">
                {pdfProgress ? `Đang tạo PDF (${pdfProgress})…` : "Đang tạo PDF…"}
              </span>
            )}
            <button
              type="button"
              disabled={pdfBusy}
              onClick={onPrint}
              title="Mở hộp thoại in. Chọn lề „Chuẩn“ và tỉ lệ 100 %."
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
            >
              In
            </button>
            <button
              type="button"
              disabled={pdfBusy}
              onClick={() => void onPdf()}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 active:bg-slate-800 disabled:opacity-40"
            >
              Xuất PDF
            </button>
          </div>
        </div>

        <div className="mb-1 text-xs text-slate-500">
          {mode === "week" ? (
            <>
              Xem trước: <b>{previewWeek?.label}</b>
              {weekKey === ALL && weeks.length > 1 && ` (và ${weeks.length - 1} tuần nữa, mỗi tuần in một trang)`}
            </>
          ) : (
            <>
              Xem trước: <b>{previewEmployee?.name}</b>
              {who === ALL && " (chọn một người để xem người khác)"}
            </>
          )}
        </div>
        <div className="rounded-lg border border-slate-300 shadow-sm bg-white overflow-x-auto">
          {mode === "week" && previewWeek && (
            <div className="min-w-[860px]">
              {layout === "table" ? (
                <WochenRasterPage schedule={schedule} dates={previewWeek.dates} periodLabel={previewWeek.label} />
              ) : (
                <WochenplanPage schedule={schedule} dates={previewWeek.dates} periodLabel={previewWeek.label} />
              )}
            </div>
          )}
          {mode === "timesheet" && previewEmployee && (
            <StundenzettelPage
              schedule={schedule}
              employee={previewEmployee}
              dates={chosenPeriod?.dates}
              periodLabel={chosenPeriod?.label}
            />
          )}
        </div>
      </div>

      {/* Vùng in ẩn: mỗi tuần / mỗi nhân viên một trang */}
      <div className="print-area">
        {job?.kind === "week" &&
          job.weeks.map((w) =>
            job.layout === "table" ? (
              <WochenRasterPage key={w.label} schedule={schedule} dates={w.dates} periodLabel={w.label} />
            ) : (
              <WochenplanPage key={w.label} schedule={schedule} dates={w.dates} periodLabel={w.label} />
            ),
          )}
        {job?.kind === "timesheet" &&
          job.employees.map((emp) => (
            <StundenzettelPage
              key={emp.id}
              schedule={schedule}
              employee={emp}
              dates={job.period?.dates}
              periodLabel={job.period?.label}
            />
          ))}
      </div>
    </>
  );
}
