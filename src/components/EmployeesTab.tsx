import { useState } from "react";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import type { EmploymentType } from "../types";
import { splitTargetHours } from "../lib/splitTargetHours";

const inputClass =
  "rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

/** Số ngày làm (= số ca) cho một mục tiêu, hoặc thông báo lỗi. */
function splitInfo(targetHours: number, type: EmploymentType): { ok: boolean; text: string } {
  try {
    const parts = splitTargetHours(targetHours, type);
    return { ok: true, text: `${parts.length} ca` };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : "không hợp lệ" };
  }
}

export function EmployeesTab({ store }: { store: UseScheduleReturn }) {
  const { schedule, addEmployee, updateEmployee, removeEmployee } = store;
  const [name, setName] = useState("");
  const [type, setType] = useState<EmploymentType>("VOLLZEIT");
  const [hours, setHours] = useState(176);

  return (
    <section className="rounded-lg bg-white border border-slate-200 p-4 sm:p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900 mb-4">Nhân viên</h2>

      {/* Thêm nhân viên mới */}
      <div className="flex flex-wrap items-end gap-3 mb-5 rounded bg-slate-50 border border-slate-200 p-3">
        <label className="flex flex-col grow min-w-[140px]">
          <span className="text-xs text-slate-600 mb-1">Tên</span>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên nhân viên"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-slate-600 mb-1">Hình thức làm việc</span>
          <select
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value as EmploymentType)}
          >
            <option value="VOLLZEIT">Toàn thời gian</option>
            <option value="TEILZEIT">Bán thời gian</option>
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-slate-600 mb-1">Giờ định mức</span>
          <input
            type="number"
            min={0}
            step={1}
            className={`${inputClass} w-28`}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
        </label>
        <button
          onClick={() => {
            addEmployee(name, type, hours);
            setName("");
          }}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 active:bg-slate-800"
        >
          Thêm nhân viên
        </button>
      </div>

      {/* Danh sách */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-3 font-medium">Tên</th>
              <th className="py-2 pr-3 font-medium">Hình thức</th>
              <th className="py-2 pr-3 font-medium">Giờ định mức</th>
              <th className="py-2 pr-3 font-medium">Phân bổ ca</th>
              <th className="py-2 pr-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {schedule.employees.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  Chưa có nhân viên. Thêm nhân viên ở khung phía trên.
                </td>
              </tr>
            )}
            {schedule.employees.map((emp) => {
              const info = splitInfo(emp.targetMinutes / 60, emp.employmentType);
              return (
                <tr key={emp.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">
                    <input
                      className={inputClass}
                      value={emp.name}
                      onChange={(e) => updateEmployee(emp.id, { name: e.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      className={inputClass}
                      value={emp.employmentType}
                      onChange={(e) =>
                        updateEmployee(emp.id, {
                          employmentType: e.target.value as EmploymentType,
                        })
                      }
                    >
                      <option value="VOLLZEIT">Toàn thời gian</option>
                      <option value="TEILZEIT">Bán thời gian</option>
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className={`${inputClass} w-24`}
                      value={emp.targetMinutes / 60}
                      onChange={(e) =>
                        updateEmployee(emp.id, {
                          targetMinutes: Math.max(0, Math.round(Number(e.target.value))) * 60,
                        })
                      }
                    />
                    <span className="ml-1 text-slate-400">h</span>
                  </td>
                  <td className={`py-2 pr-3 text-xs ${info.ok ? "text-slate-500" : "text-rose-600"}`}>
                    {info.text}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <button
                      onClick={() => removeEmployee(emp.id)}
                      className="text-rose-600 hover:text-rose-800 text-sm"
                    >
                      Xoá
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
