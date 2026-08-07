import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import type { Employee } from "../types";
import { elementsToPdf, safeFileName } from "../lib/pdf";
import { StundenzettelPage } from "./StundenzettelPage";

export function StundenzettelTab({ store }: { store: UseScheduleReturn }) {
  const { schedule } = store;
  const [selectedId, setSelectedId] = useState<string>(schedule.employees[0]?.id ?? "");
  const [printList, setPrintList] = useState<Employee[] | null>(null);
  const [pdfList, setPdfList] = useState<Employee[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pdfStage = useRef<HTMLDivElement>(null);

  const selected =
    schedule.employees.find((employee) => employee.id === selectedId) ??
    schedule.employees[0] ??
    null;
  const monthTag = `${schedule.year}-${String(schedule.month).padStart(2, "0")}`;

  function doPrint(list: Employee[]) {
    if (list.length === 0) return;
    flushSync(() => setPrintList(list));
    window.print();
  }

  async function doPdf(list: Employee[], filename: string) {
    if (list.length === 0 || pdfBusy) return;
    setPdfBusy(true);
    flushSync(() => setPdfList(list));
    try {
      const pages = Array.from(
        pdfStage.current?.querySelectorAll<HTMLElement>(".stundenzettel-page") ?? [],
      );
      await elementsToPdf(pages, filename);
    } catch (error) {
      alert(
        `Không tạo được PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setPdfList(null);
      setPdfBusy(false);
    }
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
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <label className="text-sm text-slate-600">Nhân viên:</label>
          <select
            className="rounded border border-slate-300 px-2 py-2 text-sm"
            value={selected?.id ?? ""}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {schedule.employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            disabled={pdfBusy || !selected}
            onClick={() =>
              selected &&
              void doPdf(
                [selected],
                `Stundenzettel_${safeFileName(selected.name)}_${monthTag}.pdf`,
              )
            }
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 active:bg-slate-800 disabled:opacity-40"
          >
            Xuất PDF — người đang chọn
          </button>
          <button
            disabled={pdfBusy}
            onClick={() =>
              void doPdf(schedule.employees, `Stundenzettel_tat_ca_${monthTag}.pdf`)
            }
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 active:bg-slate-800 disabled:opacity-40"
          >
            Xuất PDF — tất cả
          </button>
          <button
            disabled={pdfBusy || !selected}
            onClick={() => selected && doPrint([selected])}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
          >
            In — người đang chọn
          </button>
          <button
            disabled={pdfBusy}
            onClick={() => doPrint(schedule.employees)}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
          >
            In — tất cả
          </button>
          {pdfBusy && <span className="text-sm text-slate-500">Đang tạo PDF…</span>}
        </div>

        <p className="text-xs text-slate-500 mb-3">
          Tờ <span className="font-medium">Stundenaufzeichnung</span> sử dụng mẫu tiếng Đức.
          <span className="font-medium"> Xuất PDF</span> tải file trực tiếp về máy;
          <span className="font-medium"> In</span> mở hộp thoại máy in.
        </p>

        {selected && (
          <div className="rounded-lg border border-slate-300 shadow-sm bg-white overflow-x-auto">
            <StundenzettelPage schedule={schedule} employee={selected} />
          </div>
        )}
      </div>

      <div className="print-area">
        {(printList ?? []).map((employee) => (
          <StundenzettelPage key={employee.id} schedule={schedule} employee={employee} />
        ))}
      </div>

      <div ref={pdfStage} aria-hidden="true" className="pdf-stage no-print">
        {(pdfList ?? []).map((employee) => (
          <StundenzettelPage key={employee.id} schedule={schedule} employee={employee} />
        ))}
      </div>
    </>
  );
}
