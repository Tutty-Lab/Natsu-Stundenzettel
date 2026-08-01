import { useState } from "react";
import { useSchedule } from "./hooks/useSchedule";
import { SettingsTab } from "./components/SettingsTab";
import { EmployeesTab } from "./components/EmployeesTab";
import { ScheduleTab } from "./components/ScheduleTab";
import { StundenzettelTab } from "./components/StundenzettelTab";
import { DocsTab } from "./components/DocsTab";
import { Dashboard } from "./components/Dashboard";
import { monthLabel } from "./lib/shiftOps";

type TabId = "einstellungen" | "mitarbeiter" | "dienstplan" | "stundenzettel" | "docs";

const TABS: { id: TabId; label: string }[] = [
  { id: "einstellungen", label: "Cài đặt" },
  { id: "mitarbeiter", label: "Nhân viên" },
  { id: "dienstplan", label: "Lịch làm việc" },
  { id: "stundenzettel", label: "Bảng chấm công" },
  { id: "docs", label: "Tài liệu" },
];

export default function App() {
  const store = useSchedule();
  const [tab, setTab] = useState<TabId>("einstellungen");

  return (
    <div className="min-h-screen">
      <header className="no-print bg-slate-900 text-white shadow sticky top-0 z-30">
        <div className="mx-auto max-w-[1500px] px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-base sm:text-lg font-semibold">Lịch làm việc &amp; Bảng chấm công</h1>
            <p className="text-xs text-slate-300">
              {store.schedule.companyName || "Chưa có tên cửa hàng"} · {monthLabel(store.schedule.year, store.schedule.month)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={store.saveNow}
              className="rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600"
            >
              Lưu dữ liệu
            </button>
            <button
              onClick={() => {
                if (confirm("Xoá toàn bộ dữ liệu?")) store.resetAll();
              }}
              className="rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600"
            >
              Xoá dữ liệu
            </button>
          </div>
        </div>
      </header>

      <div className="no-print mx-auto max-w-[1500px] px-3 sm:px-4 pt-4">
        <Dashboard store={store} />
      </div>

      <nav className="no-print mx-auto max-w-[1500px] px-3 sm:px-4 mt-4">
        <div className="flex gap-1 border-b border-slate-300 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium rounded-t ${
                tab === t.id
                  ? "bg-white text-slate-900 border border-b-white border-slate-300"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-[1500px] px-3 sm:px-4 py-4">
        <div className="no-print">
          {tab === "einstellungen" && <SettingsTab store={store} />}
          {tab === "mitarbeiter" && <EmployeesTab store={store} />}
          {tab === "dienstplan" && <ScheduleTab store={store} />}
          {tab === "docs" && <DocsTab />}
        </div>
        {/* Bảng chấm công chứa vùng in – luôn render khi tab active */}
        {tab === "stundenzettel" && <StundenzettelTab store={store} />}
      </main>
    </div>
  );
}
