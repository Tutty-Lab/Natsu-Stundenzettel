// ============================================================================
// Persistenz via LocalStorage. Speichert Firma, Mitarbeiter, Monat, den
// generierten Plan sowie den ursprünglich generierten Plan (für "Zurücksetzen").
// ============================================================================

import type { Schedule, Shift } from "../types";

const LEGACY_STORAGE_KEY = "stundenzettel-app:v1";
const keyFor = (storeId: string) => `${LEGACY_STORAGE_KEY}:${storeId}`;

export type PersistedState = {
  schedule: Schedule;
  /** Snapshot des zuletzt generierten Plans (für Reset). */
  originalShifts: Shift[];
};

function parseState(raw: string | null): PersistedState | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as PersistedState;
  return parsed?.schedule ? parsed : null;
}

export function loadState(storeId: string): PersistedState | null {
  try {
    const current = parseState(localStorage.getItem(keyFor(storeId)));
    if (current) return current;

    // The former single-store app saved Natsu without a store suffix. Move that
    // cache once so the first multi-store release keeps all existing data.
    if (storeId === "natsu") {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      const legacy = parseState(legacyRaw);
      if (legacy && legacyRaw) {
        localStorage.setItem(keyFor(storeId), legacyRaw);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        return legacy;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function saveState(storeId: string, state: PersistedState): void {
  try {
    localStorage.setItem(keyFor(storeId), JSON.stringify(state));
  } catch {
    // Speicher voll / nicht verfügbar – im MVP still ignorieren.
  }
}

export function clearState(storeId: string): void {
  try {
    localStorage.removeItem(keyFor(storeId));
    if (storeId === "natsu") localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignorieren
  }
}
