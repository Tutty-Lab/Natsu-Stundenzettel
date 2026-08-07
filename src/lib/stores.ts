// ============================================================================
// Fixed store definitions. Each store has its own local cache and Supabase row.
// The IDs are persistent database keys and must not be renamed after launch.
// ============================================================================

export type StoreConfig = {
  id: string;
  name: string;
  address: string;
};

export const STORES: StoreConfig[] = [
  {
    id: "natsu",
    name: "NATSU Vietnamese & Japanese cuisine",
    address: "Berliner Str. 61, 33330 Gütersloh",
  },
  {
    id: "nava",
    name: "nava",
    address: "Marienplatz 16, 33098 Paderborn",
  },
];

export const DEFAULT_STORE_ID = "natsu";

const STORE_KEY = "stundenzettel-app:store";

export function loadStoreId(): string {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved && STORES.some((store) => store.id === saved)) return saved;
  } catch {
    // Fall back to the default store when browser storage is unavailable.
  }
  return DEFAULT_STORE_ID;
}

export function saveStoreId(id: string): void {
  try {
    localStorage.setItem(STORE_KEY, storeById(id).id);
  } catch {
    // The app remains usable without persistent store selection.
  }
}

export function storeById(id: string): StoreConfig {
  return STORES.find((store) => store.id === id) ?? STORES[0];
}
