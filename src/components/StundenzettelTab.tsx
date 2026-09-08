import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import type { Employee } from "../types";
import { elementsToPdf, safeFileName } from "../lib/pdf";
import { StundenzettelPage } from "./StundenzettelPage";
import { weeksOfMonth } from "../lib/weeks";

export function StundenzettelTab({ store }: { store: UseScheduleReturn }) {
  const { schedule } = store;
  // who: "all" = ganzer Laden, sonst eine employeeId.
  const [who, setWho] = useState<string>("all");
  // what: "stundenzettel" (Monat) | "sz-<weekStart>" (Woche).
  const [what, setWhat] = useState<string>("stundenzettel");
  const weeks = useMemo(
    () => weeksOfMonth(schedule.year, schedule.month),
    [schedule.year, schedule.month],
  );
  const [printList, setPrintList] = useState<Employee[] | null>(null);
  const [pdfList, setPdfList] = useState<Employee[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pdfStage = useRef<HTMLDivElement>(null);
  // Zeitraum für den Stundenzettel: gesetzt => Wochen-Zettel, leer => Monat.
  const [szDates, setSzDates] = useState<string[] | undefined>(undefined);
  const [szLabel, setSzLabel] = useState<string | undefined>(undefined);

  const monthTag = `${schedule.year}-${String(schedule.month).padStart(2, "0")}`;

  // "Tất cả" => alle; sonst genau die gewählte Person.
  const chosenEmployees =
    who === "all" ? schedule.employees : schedule.employees.filter((e) => e.id === who);
  const previewEmployee =
    who === "all" ? schedule.employees[0] ?? null : chosenEmployees[0] ?? null;
  const whoTag = who === "all" ? "tat_ca" : safeFileName(previewEmployee?.name ?? who);

  // Wochen-Stundenzettel: nur die Tage dieser Woche, mit Wochentitel oben rechts.
  function szWeekFor(weekStart: string): { dates: string[]; label: string } | null {
    const w = weeks.find((x) => x.weekStart === weekStart);
    if (!w) return null;
    return { dates: w.dates, label: `Woche ${w.label}${schedule.year}` };
  }

  // Vùng in phải được render TRƯỚC khi gọi print, và print phải nằm trong cùng
  // thao tác chạm (mobile chặn print ngoài gesture). flushSync render đồng bộ.
  function doPrint(list: Employee[], sz?: { dates?: string[]; label?: string }) {
    if (list.length === 0) return;
    flushSync(() => {
      setSzDates(sz?.dates);
      setSzLabel(sz?.label);
      setPrintList(list);
    });
    window.print();
  }

  async function doPdf(
    list: Employee[],
    filename: string,
    sz?: { dates?: string[]; label?: string },
  ) {
    if (list.length === 0 || pdfBusy) return;
    setPdfBusy(true);
    flushSync(() => {
      setSzDates(sz?.dates);
      setSzLabel(sz?.label);
      setPdfList(list);
    });
    try {
      const pages = Array.from(
        pdfStage.current?.querySelectorAll<HTMLElement>(".stundenzettel-page") ?? [],
      );
      await elementsToPdf(pages, filename);
    } catch (error) {
      alert(`Không tạo được PDF: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPdfList(null);
      setPdfBusy(false);
    }
  }

  function onPrint() {
    if (what.startsWith("sz-")) {
      const sz = szWeekFor(what.slice(3));
      if (sz) doPrint(chosenEmployees, sz);
      return;
    }
    doPrint(chosenEmployees);
  }

  function onPdf() {
    if (what.startsWith("sz-")) {
      const weekStart = what.slice(3);
      const sz = szWeekFor(weekStart);
      if (sz) {
        void doPdf(chosenEmployees, `Stundenzettel_${whoTag}_${monthTag}_tuan_${weekStart}.pdf`, sz);
      }
      return;
    }
    void doPdf(chosenEmployees, `Stundenzettel_${whoTag}_${monthTag}.pdf`);
  }

  if (schedule.employees.length === 0) {
    return (
      <div className="no-print rounded bg-white border border-slate-200 p-6 text-center text-slate-400">
        Vui lòng thêm nhân viên và tạo lịch làm việc trước.
      </div>
    );
  }

  return (
    <>
      <div className="no-print">
        {/* ---- In & Xuất ---- */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 mb-4">
          <div className="text-sm font-medium text-slate-700 mb-2">In &amp; Xuất file</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Cho ai</span>
              <select
                className="rounded border border-slate-300 px-2 py-2 text-sm min-w-[10rem]"
                value={who}
                onChange={(e) => setWho(e.target.value)}
              >
                <option value="all">Tất cả (cả quán)</option>
                {schedule.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Nội dung</span>
              <select
                className="rounded border border-slate-300 px-2 py-2 text-sm min-w-[14rem]"
                value={what}
                onChange={(e) => setWhat(e.target.value)}
              >
                <option value="stundenzettel">Bảng chấm công (Stundenzettel) — cả tháng</option>
                {weeks.map((w) => (
                  <option key={`sz-${w.weekStart}`} value={`sz-${w.weekStart}`}>
                    Bảng chấm công (Stundenzettel) — tuần {w.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-2">
              <button
                disabled={pdfBusy}
                onClick={onPrint}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
              >
                🖨 In
              </button>
              <button
                disabled={pdfBusy}
                onClick={onPdf}
                className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 active:bg-slate-800 disabled:opacity-40"
              >
                ⬇ Xuất PDF
              </button>
              {pdfBusy && <span className="text-sm text-slate-500">Đang tạo PDF…</span>}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Tờ <span className="font-medium">Stundenaufzeichnung</span> theo mẫu tiếng Đức (dùng nộp
            tại Đức) — một tờ mỗi người, chọn cả tháng hoặc từng tuần.{" "}
            <span className="font-medium">Xuất PDF</span> tải thẳng file .pdf về máy; trên điện thoại
            mở bảng Chia sẻ. <span className="font-medium">In</span> mở hộp thoại in (chọn lề „Chuẩn",
            tỉ lệ 100 %).
          </p>
        </div>

        {previewEmployee && (
          <>
            <div className="mb-1 text-xs text-slate-500">
              Xem trước: <b>{previewEmployee.name}</b>
              {who === "all" && " (chọn một người ở ô „Cho ai“ để xem người khác)"}
            </div>
            <div className="rounded-lg border border-slate-300 shadow-sm bg-white overflow-x-auto">
              <StundenzettelPage schedule={schedule} employee={previewEmployee} />
            </div>
          </>
        )}
      </div>

      {/* Vùng in ẩn: mỗi nhân viên một trang */}
      <div className="print-area">
        {(printList ?? []).map((emp) => (
          <StundenzettelPage
            key={emp.id}
            schedule={schedule}
            employee={emp}
            dates={szDates}
            periodLabel={szLabel}
          />
        ))}
      </div>

      {/* Sân khấu ngoài màn hình – chỉ có nội dung trong lúc tạo PDF */}
      <div ref={pdfStage} aria-hidden="true" className="pdf-stage no-print">
        {(pdfList ?? []).map((emp) => (
          <StundenzettelPage
            key={emp.id}
            schedule={schedule}
            employee={emp}
            dates={szDates}
            periodLabel={szLabel}
          />
        ))}
      </div>
    </>
  );
}
