import { useEffect, useState } from "react";
import { useSchedule, type UseScheduleReturn } from "./hooks/useSchedule";
import { SettingsTab } from "./components/SettingsTab";
import { EmployeesTab } from "./components/EmployeesTab";
import { ScheduleTab } from "./components/ScheduleTab";
import { StundenzettelTab } from "./components/StundenzettelTab";
import { DocsTab } from "./components/DocsTab";
import { Dashboard } from "./components/Dashboard";
import { LockScreen } from "./components/LockScreen";
import { SavedSchedulesPanel, savedRows } from "./components/SavedSchedules";
import { CreateScheduleDialog } from "./components/CreateScheduleDialog";
import { isAuthenticated, logout } from "./lib/auth";
import { monthLabel } from "./lib/shiftOps";
import { loadStoreId, saveStoreId } from "./lib/stores";

type TabId = "dienstplan" | "mitarbeiter" | "stundenzettel" | "wochenplan" | "einstellungen";

// Aufbau wie Thiên Long: Häufiges zuerst, Azubi steckt im Formular der Person,
// Tài liệu sitzt oben rechts im Kopf.
const TABS: { id: TabId; label: string }[] = [
  { id: "dienstplan", label: "Lịch làm việc" },
  { id: "mitarbeiter", label: "Nhân viên" },
  { id: "stundenzettel", label: "Bảng chấm công" },
  { id: "wochenplan", label: "Thời gian biểu" },
  { id: "einstellungen", label: "Cài đặt" },
];

const headerButton = "rounded px-2.5 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm";

export default function App() {
  const [unlocked, setUnlocked] = useState(() => isAuthenticated());

  if (!unlocked) return <LockScreen onUnlock={() => setUnlocked(true)} />;
  return <MainApp onLogout={() => setUnlocked(false)} />;
}

function MainApp({ onLogout }: { onLogout: () => void }) {
  // Beide Filialen gleichzeitig: „Tạo lịch" erzeugt beide, der Umschalter
  // NATSU | nava wechselt nur die Ansicht.
  const natsu = useSchedule("natsu");
  const nava = useSchedule("nava");
  const stores = [natsu, nava];
  const [activeId, setActiveId] = useState(() => loadStoreId());
  const store = stores.find((s) => s.storeId === activeId) ?? natsu;
  const [tab, setTab] = useState<TabId>("dienstplan");
  const [showDocs, setShowDocs] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [askCreate, setAskCreate] = useState(false);
  // Nach dem Monatswechsel erst erzeugen, wenn beide Filialen im Zielmonat sind.
  const [pendingCreate, setPendingCreate] = useState<{ year: number; month: number } | null>(null);
  const { schedule } = store;

  const selectStore = (id: string) => {
    setActiveId(id);
    saveStoreId(id);
  };

  // Tháng/năm dùng chung: beide Filialen immer im selben Monat halten (auch
  // wenn eine beim Laden aus der Datenbank einen anderen Monat mitbringt).
  useEffect(() => {
    for (const other of [natsu, nava]) {
      if (other.schedule.year !== schedule.year || other.schedule.month !== schedule.month) {
        other.updateMeta({ year: schedule.year, month: schedule.month });
      }
    }
    // updateMeta ist stabil; nur der Monat der aktiven Filiale zählt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule.year, schedule.month, natsu.schedule.month, nava.schedule.month, natsu.schedule.year, nava.schedule.year]);

  const setMonth = (year: number, month: number) => {
    for (const s of stores) s.updateMeta({ year, month });
  };

  useEffect(() => {
    if (!pendingCreate) return;
    const ready = stores.every(
      (s) => s.schedule.year === pendingCreate.year && s.schedule.month === pendingCreate.month,
    );
    if (!ready) return;
    setPendingCreate(null);
    for (const s of stores) if (s.schedule.employees.length > 0) s.generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCreate, natsu.schedule, nava.schedule]);

  const createFor = (year: number, month: number) => {
    setAskCreate(false);
    setShowDocs(false);
    setTab("dienstplan");
    setMonth(year, month);
    setPendingCreate({ year, month });
  };

  const remoteStatus = stores.some((s) => s.remoteStatus === "error")
    ? "error"
    : stores.some((s) => s.remoteStatus === "saving")
      ? "saving"
      : store.remoteStatus;

  return (
    <div className="min-h-screen">
      <header className="no-print bg-slate-900 text-white shadow sticky top-0 z-30">
        <div className="mx-auto max-w-[1500px] px-3 sm:px-4 py-2 sm:py-3">
          {/* Zeile 1: Titel + Knöpfe; Zeile 2: Monat/Jahr · Sync. */}
          <div className="flex items-center justify-between gap-2">
            <h1 className="truncate text-sm sm:text-lg font-semibold">
              <span className="sm:hidden">Lịch làm việc</span>
              <span className="hidden sm:inline">Lịch làm việc &amp; Bảng chấm công</span>
            </h1>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setShowDocs((v) => !v)}
                className={`${headerButton} ${
                  showDocs ? "bg-white text-slate-900" : "bg-slate-700 hover:bg-slate-600"
                }`}
              >
                Tài liệu
              </button>
              <button
                onClick={() => {
                  if (confirm(`Xoá toàn bộ dữ liệu của ${schedule.companyName}?`)) store.resetAll();
                }}
                className={`${headerButton} bg-slate-700 hover:bg-slate-600`}
              >
                Xoá dữ liệu
              </button>
              <button
                onClick={() => {
                  logout();
                  onLogout();
                }}
                className={`${headerButton} bg-slate-700 hover:bg-slate-600`}
              >
                Đăng xuất
              </button>
            </div>
          </div>
          <p className="mt-0.5 text-xs text-slate-300">
            {monthLabel(schedule.year, schedule.month)}
            {remoteStatus !== "off" && (
              <span className={remoteStatus === "error" ? "text-rose-300" : "text-slate-400"}>
                {" · "}
                {remoteStatus === "saving"
                  ? "đang đồng bộ…"
                  : remoteStatus === "error"
                    ? "lỗi đồng bộ — dữ liệu chỉ lưu trên máy này"
                    : "đã đồng bộ"}
              </span>
            )}
          </p>
        </div>
      </header>

      {showDocs ? (
        <main className="no-print mx-auto max-w-[1500px] px-3 sm:px-4 py-4">
          <button
            onClick={() => setShowDocs(false)}
            className="mb-3 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            ← Quay lại
          </button>
          <DocsTab />
        </main>
      ) : (
        <>
          <nav className="no-print mx-auto max-w-[1500px] px-3 sm:px-4 mt-4">
            <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              <button
                onClick={() => setAskCreate(true)}
                className="shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                + Tạo lịch làm việc
              </button>
              <button
                onClick={() => setShowSaved((v) => !v)}
                aria-expanded={showSaved}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium ${
                  showSaved
                    ? "border-slate-900 bg-slate-100 text-slate-900"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
                }`}
              >
                Lịch đã lưu ({savedRows(stores).length})
              </button>
              <span className="mx-1 hidden sm:inline h-6 w-px bg-slate-200" />
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 whitespace-nowrap px-3.5 py-2 text-sm font-medium rounded-full border ${
                    tab === t.id
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:border-slate-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </nav>

          {showSaved && (
            <div className="no-print mx-auto max-w-[1500px] px-3 sm:px-4 mt-3">
              <SavedSchedulesPanel stores={stores} onOpenMonth={setMonth} onClose={() => setShowSaved(false)} />
            </div>
          )}

          <div className="no-print mx-auto max-w-[1500px] px-3 sm:px-4 mt-3">
            <StoreSwitch stores={stores} activeId={store.storeId} onSelect={selectStore} />
          </div>

          <div className="no-print mx-auto max-w-[1500px] px-3 sm:px-4 pt-3">
            <Dashboard store={store} />
          </div>

          <main className="mx-auto max-w-[1500px] px-3 sm:px-4 py-4">
            {/* key: beim Umschalten der Filiale lokale Ansichtszustände frisch anlegen. */}
            <div className="no-print" key={store.storeId}>
              {tab === "einstellungen" && <SettingsTab store={store} />}
              {tab === "mitarbeiter" && <EmployeesTab store={store} />}
              {tab === "dienstplan" && <ScheduleTab store={store} />}
            </div>
            {/* Bảng chấm công chứa vùng in – luôn render khi tab active */}
            {tab === "stundenzettel" && <StundenzettelTab key={store.storeId} store={store} />}
            {/* Thời gian biểu: Dienstplan theo tuần cho cả quán, in mỗi tuần một trang. */}
            {tab === "wochenplan" && (
              <StundenzettelTab key={`${store.storeId}-week`} store={store} kind="week" />
            )}
          </main>
        </>
      )}

      {askCreate && (
        <CreateScheduleDialog
          stores={stores}
          initialYear={schedule.year}
          initialMonth={schedule.month}
          onClose={() => setAskCreate(false)}
          onCreate={createFor}
        />
      )}
    </div>
  );
}

/** Umschalter NATSU | nava – nur der Name, roter Punkt bei Fehlern im Plan. */
function StoreSwitch({
  stores,
  activeId,
  onSelect,
}: {
  stores: UseScheduleReturn[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="inline-grid gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm"
      style={{ gridTemplateColumns: `repeat(${stores.length}, minmax(0, 1fr))` }}
      role="tablist"
      aria-label="Chọn quán"
    >
      {stores.map((s) => {
        const on = s.storeId === activeId;
        const broken = !!s.genError || (s.schedule.shifts.length > 0 && !s.validation.valid);
        return (
          <button
            key={s.storeId}
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(s.storeId)}
            title={broken ? "Lịch có lỗi" : undefined}
            className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              on ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="truncate">{s.storeId === "natsu" ? "NATSU" : s.storeConfig.name}</span>
            {broken && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-label="có lỗi" />}
          </button>
        );
      })}
    </div>
  );
}
