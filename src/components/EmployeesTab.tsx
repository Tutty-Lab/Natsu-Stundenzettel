import { useState } from "react";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import type { EmploymentType } from "../types";
import { splitTargetHours } from "../lib/splitTargetHours";
import { azubiMonthlyMinutes, azubiWeeklyHours, defaultAzubiConfig } from "../lib/azubi";

const inputClass =
  "rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

function splitInfo(targetHours: number, type: EmploymentType): { ok: boolean; text: string } {
  try {
    const parts = splitTargetHours(targetHours, type);
    return { ok: true, text: `${parts.length} ca` };
  } catch (error) {
    return { ok: false, text: error instanceof Error ? error.message : "không hợp lệ" };
  }
}

export function EmployeesTab({ store }: { store: UseScheduleReturn }) {
  const { schedule, addEmployee, updateEmployee, removeEmployee } = store;
  const [name, setName] = useState("");
  const [type, setType] = useState<EmploymentType>("VOLLZEIT");
  const [hours, setHours] = useState(176);
  const newAzubiHours = azubiMonthlyMinutes(defaultAzubiConfig()) / 60;

  return (
    <section className="rounded-lg bg-white border border-slate-200 p-4 sm:p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900 mb-4">Nhân viên</h2>

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 mb-5 rounded bg-slate-50 border border-slate-200 p-3">
        <label className="flex flex-col sm:flex-1 sm:min-w-[140px]">
          <span className="text-xs text-slate-600 mb-1">Tên</span>
          <input
            className={`${inputClass} w-full`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Tên nhân viên"
          />
        </label>
        <label className="flex flex-col sm:w-40">
          <span className="text-xs text-slate-600 mb-1">Hình thức làm việc</span>
          <select
            className={`${inputClass} w-full`}
            value={type}
            onChange={(event) => setType(event.target.value as EmploymentType)}
          >
            <option value="VOLLZEIT">Toàn thời gian</option>
            <option value="TEILZEIT">Bán thời gian</option>
            <option value="AZUBI">Azubi (học nghề)</option>
          </select>
        </label>
        {type === "AZUBI" ? (
          <div className="flex flex-col sm:w-36">
            <span className="text-xs text-slate-600 mb-1">Giờ định mức</span>
            <div className="rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700">
              <b>{newAzubiHours}h</b> · tự động
            </div>
          </div>
        ) : (
          <label className="flex flex-col sm:w-32">
            <span className="text-xs text-slate-600 mb-1">Giờ định mức</span>
            <input
              type="number"
              min={0}
              step={1}
              className={`${inputClass} w-full`}
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
            />
          </label>
        )}
        <button
          onClick={() => {
            addEmployee(name, type, type === "AZUBI" ? newAzubiHours : hours);
            setName("");
          }}
          className="rounded bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 active:bg-slate-800"
        >
          Thêm nhân viên
        </button>
      </div>

      {schedule.employees.length === 0 ? (
        <div className="py-6 text-center text-slate-400">
          Chưa có nhân viên. Thêm nhân viên ở khung phía trên.
        </div>
      ) : (
        <div className="space-y-2">
          {schedule.employees.map((employee) => {
            const isAzubi = employee.employmentType === "AZUBI";
            const info = isAzubi
              ? { ok: true, text: `${azubiWeeklyHours(employee.azubi)}h/tuần · tự động` }
              : splitInfo(employee.targetMinutes / 60, employee.employmentType);

            return (
              <div
                key={employee.id}
                className="rounded-lg border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-end gap-3"
              >
                <label className="flex flex-col sm:flex-1">
                  <span className="text-xs text-slate-500 mb-1 sm:hidden">Tên</span>
                  <input
                    className={`${inputClass} w-full`}
                    value={employee.name}
                    onChange={(event) =>
                      updateEmployee(employee.id, { name: event.target.value })
                    }
                  />
                </label>
                <label className="flex flex-col sm:w-40">
                  <span className="text-xs text-slate-500 mb-1 sm:hidden">Hình thức</span>
                  <select
                    className={`${inputClass} w-full`}
                    value={employee.employmentType}
                    onChange={(event) =>
                      updateEmployee(employee.id, {
                        employmentType: event.target.value as EmploymentType,
                      })
                    }
                  >
                    <option value="VOLLZEIT">Toàn thời gian</option>
                    <option value="TEILZEIT">Bán thời gian</option>
                    <option value="AZUBI">Azubi (học nghề)</option>
                  </select>
                </label>
                <label className="flex flex-col sm:w-32">
                  <span className="text-xs text-slate-500 mb-1 sm:hidden">Giờ định mức</span>
                  {isAzubi ? (
                    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700">
                      <b>{employee.targetMinutes / 60}h</b> · tự động
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className={`${inputClass} w-full`}
                        value={employee.targetMinutes / 60}
                        onChange={(event) =>
                          updateEmployee(employee.id, {
                            targetMinutes:
                              Math.max(0, Math.round(Number(event.target.value))) * 60,
                          })
                        }
                      />
                      <span className="text-slate-400">h</span>
                    </div>
                  )}
                </label>
                <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-end gap-1 sm:w-28">
                  <span className={`text-xs ${info.ok ? "text-slate-500" : "text-rose-600"}`}>
                    {info.text}
                  </span>
                  <button
                    onClick={() => removeEmployee(employee.id)}
                    className="text-rose-600 hover:text-rose-800 text-sm font-medium"
                  >
                    Xoá
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
