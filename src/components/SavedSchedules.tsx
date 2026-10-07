import type { UseScheduleReturn } from "../hooks/useSchedule";
import type { SavedMonth } from "../lib/monthArchive";
import { minutesToShortHours } from "../lib/time";

/** Ein Monat mit den gespeicherten Plänen beider Filialen. */
type SavedRow = {
  key: string;
  year: number;
  month: number;
  current: boolean;
  perStore: { name: string; saved?: SavedMonth }[];
};

/** Monate aus allen Filialen zusammenführen (tháng/năm dùng chung), neueste zuerst. */
export function savedRows(stores: UseScheduleReturn[]): SavedRow[] {
  const keys = new Map<string, { year: number; month: number }>();
  for (const s of stores) for (const m of s.savedMonths) keys.set(m.key, { year: m.year, month: m.month });
  return [...keys]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, { year, month }]) => {
      const perStore = stores.map((s) => ({
        name: s.storeConfig.name,
        saved: s.savedMonths.find((m) => m.key === key),
      }));
      return {
        key,
        year,
        month,
        current: stores.some((s) => s.schedule.year === year && s.schedule.month === month),
        perStore,
      };
    });
}

/**
 * „Lịch đã lưu" – liegt außerhalb der Tabs neben „+ Tạo lịch" und zeigt beide
 * Filialen. „Mở" wechselt den Monat für BEIDE, weil Monat/Jahr gemeinsam sind.
 */
export function SavedSchedulesPanel({
  stores,
  onOpenMonth,
  onClose,
}: {
  stores: UseScheduleReturn[];
  onOpenMonth: (year: number, month: number) => void;
  onClose: () => void;
}) {
  const rows = savedRows(stores);
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-sm font-medium text-slate-800">Lịch đã lưu · cả 2 quán</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-lg leading-none"
          aria-label="Đóng"
        >
          ×
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-sm text-slate-500">
          Chưa có tháng nào. Tạo lịch cho một tháng, lịch sẽ tự được lưu khi bạn đổi sang tháng khác.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="font-medium text-slate-900 w-24 shrink-0">
                Tháng {r.month}/{r.year}
              </span>
              <span className="flex-1 min-w-0 space-y-0.5 text-slate-500">
                {r.perStore.map(({ name, saved }) => (
                  <span key={name} className="block truncate">
                    <span className="font-medium text-slate-700">{name}</span>:{" "}
                    {saved
                      ? `${saved.shiftCount} ca · ${minutesToShortHours(saved.totalMinutes)}${
                          saved.savedAt ? ` · lưu ${formatSavedAt(saved.savedAt)}` : ""
                        }`
                      : "chưa có lịch"}
                  </span>
                ))}
              </span>
              {r.current ? (
                <span className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-xs text-white">
                  Đang mở
                </span>
              ) : (
                <button
                  onClick={() => {
                    onOpenMonth(r.year, r.month);
                    onClose();
                    // Về đầu trang để thấy rõ đã chuyển tháng.
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="shrink-0 rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:border-slate-500"
                >
                  Mở
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** „24.09 14:30" */
function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
