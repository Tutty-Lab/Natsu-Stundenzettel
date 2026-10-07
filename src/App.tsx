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
import { isAuthenticated, logout } from "./lib/auth";
import { MONTH_NAMES_VI } from "./lib/dateFormat";
import { monthLabel } from "./lib/shiftOps";
import { loadStoreId, saveStoreId } from "./lib/stores";

/** Jahre für die Auswahl oben: Vorjahr bis fünf Jahre voraus. */
const YEARS = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 1 + i);

type TabId = "dienstplan" | "mitarbeiter" | "stundenzettel" | "einstellungen";

// Aufbau wie Thiên Long: Häufiges zuerst, Azubi steckt im Formular der Person,
// Tài liệu sitzt oben rechts im Kopf.
const TABS: { id: TabId; label: string }[] = [
  { id: "dienstplan", label: "Lịch làm việc" },
  { id: "mitarbeiter", label: "Nhân viên" },
  { id: "stundenzettel", label: "Bảng chấm công" },
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

  const create = () => {
    const withPlan = stores.filter((s) => s.schedule.shifts.length > 0);
    if (
      withPlan.length > 0 &&
      !confirm(
        `Tạo lại lịch ${monthLabel(schedule.year, schedule.month)} cho cả 2 quán? Lịch hiện tại sẽ bị thay, kể cả những ca đã sửa tay.`,
      )
    ) {
      return;
    }
    setShowDocs(false);
    setTab("dienstplan");
    for (const s of stores) if (s.schedule.employees.length > 0) s.generate();
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
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-300">
            <span>NATSU &amp; nava</span>
            <span className="text-slate-500">·</span>
            {/* Tháng/năm đang làm việc – đổi ở đây cho mọi tab và cả 2 quán. */}
            <span className="inline-flex items-center gap-1" aria-label="Chọn tháng và năm">
              <select
                aria-label="Tháng"
                value={schedule.month}
                onChange={(e) => setMonth(schedule.year, Number(e.target.value))}
                className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-xs text-white"
              >
                {MONTH_NAMES_VI.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Năm"
                value={schedule.year}
                onChange={(e) => setMonth(Number(e.target.value), schedule.month)}
                className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-xs text-white"
              >
                {(YEARS.includes(schedule.year) ? YEARS : [schedule.year, ...YEARS]).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </span>
            {remoteStatus !== "off" && (
              <span className={remoteStatus === "error" ? "text-rose-300" : "text-slate-400"}>
                ·{" "}
                {remoteStatus === "saving"
                  ? "đang đồng bộ…"
                  : remoteStatus === "error"
                    ? "lỗi đồng bộ — dữ liệu chỉ lưu trên máy này"
                    : "đã đồng bộ"}
              </span>
            )}
          </div>
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
                onClick={create}
                disabled={stores.every((s) => s.schedule.employees.length === 0)}
                className="shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
              >
                + Tạo lịch làm việc <span className="font-normal opacity-80">(2 quán)</span>
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
            {(tab === "dienstplan" || tab === "stundenzettel") && (
              <div className="no-print mb-3 text-right text-sm text-slate-500">
                {store.storeConfig.name} · {monthLabel(schedule.year, schedule.month)}
              </div>
            )}
            {/* key: beim Umschalten der Filiale lokale Ansichtszustände frisch anlegen. */}
            <div className="no-print" key={store.storeId}>
              {tab === "einstellungen" && <SettingsTab store={store} />}
              {tab === "mitarbeiter" && <EmployeesTab store={store} />}
              {tab === "dienstplan" && <ScheduleTab store={store} />}
            </div>
            {/* Bảng chấm công chứa vùng in – luôn render khi tab active */}
            {tab === "stundenzettel" && <StundenzettelTab key={store.storeId} store={store} />}
          </main>
        </>
      )}
    </div>
  );
}

/** Umschalter NATSU | nava mit Kurzstatus je Filiale (Lịch, Nhân viên, Bảng chấm công, Cài đặt). */
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
      className="grid gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
      style={{ gridTemplateColumns: `repeat(${stores.length}, minmax(0, 1fr))` }}
      role="tablist"
      aria-label="Chọn quán"
    >
      {stores.map((s) => {
        const on = s.storeId === activeId;
        const status =
          s.genError
            ? { text: "lỗi tạo lịch", tone: "text-rose-600" }
            : s.schedule.shifts.length === 0
              ? { text: s.schedule.employees.length === 0 ? "chưa có nhân viên" : "chưa tạo lịch", tone: "text-slate-400" }
              : s.validation.valid
                ? { text: "✓ hợp lệ", tone: "text-emerald-600" }
                : { text: `${s.validation.errors.length} lỗi`, tone: "text-rose-600" };
        return (
          <button
            key={s.storeId}
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(s.storeId)}
            className={`min-w-0 rounded-lg px-3 py-2 text-left transition-colors ${
              on ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span className="block truncate text-sm font-semibold">{s.storeConfig.name}</span>
            <span className={`block truncate text-xs ${on ? "text-slate-300" : "text-slate-500"}`}>
              {s.schedule.employees.length} nhân viên ·{" "}
              <span className={on ? "" : status.tone}>{status.text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
