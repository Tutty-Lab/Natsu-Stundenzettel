import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
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

  // Vùng in phải được render TRƯỚC khi gọi print, và print phải nằm trong cùng
  // thao tác chạm (mobile chặn print ngoài gesture). flushSync render đồng bộ.
  function doPrint(list: Employee[]) {
    if (list.length === 0) return;
    flushSync(() => setPrintList(list));
    window.print();
  }

  // Dọn vùng in ẩn sau khi in xong (nếu trình duyệt hỗ trợ).
  useEffect(() => {
    const clear = () => setPrintList(null);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, []);

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
            onClick={() => selected && doPrint([selected])}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 active:bg-slate-800"
          >
            In bảng chấm công
          </button>
          <button
            onClick={() => doPrint(schedule.employees)}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50"
          >
            In tất cả / lưu PDF
          </button>
          <button
            onClick={() => {
              void downloadCsv(
                `Lich_lam_viec_${schedule.year}-${String(schedule.month).padStart(2, "0")}.csv`,
                scheduleToCsv(schedule),
              );
            }}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50"
          >
            Xuất lịch tháng (CSV)
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Tờ in <span className="font-medium">Stundenaufzeichnung</span> theo mẫu tiếng Đức (dùng nộp
          tại Đức). Trên máy tính: hộp thoại in chọn „Lưu thành PDF", lề „Chuẩn", tỉ lệ 100 %.
          Trên điện thoại: chọn <span className="font-medium">In</span> rồi „Lưu thành PDF", còn CSV sẽ
          mở bảng <span className="font-medium">Chia sẻ</span> để lưu vào Tệp.
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
