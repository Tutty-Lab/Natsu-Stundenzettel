import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSampleSchedule } from "../sampleData";
import { clearState, loadState, saveState, type PersistedState } from "../storage";
import { DEFAULT_STORE_ID, STORES, loadStoreId, saveStoreId, storeById } from "../stores";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function state(companyName: string): PersistedState {
  return {
    schedule: { ...createSampleSchedule(), companyName },
    originalShifts: [],
  };
}

describe("multi-store configuration", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defines Natsu and Nava with stable IDs", () => {
    expect(STORES.map((store) => store.id)).toEqual(["natsu", "nava"]);
    expect(storeById("natsu")).toMatchObject({
      name: "NATSU Vietnamese & Japanese cuisine",
      address: "Berliner Str. 61, 33330 Gütersloh",
    });
    expect(storeById("nava")).toMatchObject({
      name: "nava",
      address: "Marienplatz 16, 33098 Paderborn",
    });
  });

  it("keeps each store cache separate", () => {
    saveState("natsu", state("Natsu data"));
    saveState("nava", state("Nava data"));

    expect(loadState("natsu")?.schedule.companyName).toBe("Natsu data");
    expect(loadState("nava")?.schedule.companyName).toBe("Nava data");

    clearState("nava");
    expect(loadState("nava")).toBeNull();
    expect(loadState("natsu")?.schedule.companyName).toBe("Natsu data");
  });

  it("migrates the former single-store cache only to Natsu", () => {
    localStorage.setItem("stundenzettel-app:v1", JSON.stringify(state("Legacy Natsu")));

    expect(loadState("nava")).toBeNull();
    expect(loadState("natsu")?.schedule.companyName).toBe("Legacy Natsu");
    expect(localStorage.getItem("stundenzettel-app:v1")).toBeNull();
    expect(localStorage.getItem("stundenzettel-app:v1:natsu")).not.toBeNull();
  });

  it("persists a valid store selection and falls back for unknown IDs", () => {
    expect(loadStoreId()).toBe(DEFAULT_STORE_ID);
    saveStoreId("nava");
    expect(loadStoreId()).toBe("nava");
    expect(storeById("unknown").id).toBe(DEFAULT_STORE_ID);
  });
});
