import { useEffect, useState } from "react";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import type { Employee } from "../types";
import { StundenzettelPage } from "./StundenzettelPage";
import { scheduleToCsv, downloadCsv } from "../lib/csv";

export function StundenzettelTab({ store }: { store: UseScheduleReturn }) {
  const { schedule } = store;
  const [selectedId, setSelectedId] = useState<string>(schedule.employees[0]?.id ?? "");
  const [printList, setPrintList] = useState<Employee[] | null>(null);

  const selected =
    schedule.employees.find((e) => e.id === selectedId) ?? schedule.employees[0] ?? null;

  // Sau khi đặt danh sách in, mở hộp thoại in của trình duyệt.
  useEffect(() => {
    if (printList) {
      const t = setTimeout(() => {
        window.print();
        setPrintList(null);
      }, 60);
      return () => clearTimeout(t);
    }
  }, [printList]);

  if (schedule.employees.length === 0) {
    return (
      <div className="no-print rounded bg-white border border-slate-200 p-6 text-center text-slate-400">
        Vui lòng thêm nhân viên và tạo lịch làm việc trước.
      </div>
    );
  }

  return (
    <>
      {/* Điều khiển (không in) */}
      <div className="no-print">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <label className="text-sm text-slate-600">Nhân viên:</label>
          <select
            className="rounded border border-slate-300 px-2 py-2 text-sm"
            value={selected?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {schedule.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => selected && setPrintList([selected])}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 active:bg-slate-800"
          >
            In bảng chấm công
          </button>
          <button
            onClick={() => setPrintList(schedule.employees)}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50"
          >
            In tất cả / lưu PDF
          </button>
          <button
            onClick={() =>
              downloadCsv(
                `Lich_lam_viec_${schedule.year}-${String(schedule.month).padStart(2, "0")}.csv`,
                scheduleToCsv(schedule),
              )
            }
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50"
          >
            Xuất lịch tháng (CSV)
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Tờ in <span className="font-medium">Stundenaufzeichnung</span> theo mẫu tiếng Đức (dùng nộp
          tại Đức). Mẹo: trong hộp thoại in chọn „Lưu thành PDF", lề „Chuẩn", tỉ lệ 100 %.
        </p>

        {/* Xem trước trên màn hình cho nhân viên đã chọn */}
        {selected && (
          <div className="rounded-lg border border-slate-300 shadow-sm bg-white overflow-x-auto">
            <StundenzettelPage schedule={schedule} employee={selected} />
          </div>
        )}
      </div>

      {/* Vùng in ẩn: mỗi nhân viên một trang */}
      <div className="print-area">
        {(printList ?? []).map((emp) => (
          <StundenzettelPage key={emp.id} schedule={schedule} employee={emp} />
        ))}
      </div>
    </>
  );
}
