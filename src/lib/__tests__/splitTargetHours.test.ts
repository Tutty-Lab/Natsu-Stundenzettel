import { describe, expect, it } from "vitest";
import { splitTargetHours } from "../splitTargetHours";

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

describe("splitTargetHours – Vollzeit", () => {
  it("summiert immer exakt auf das Ziel", () => {
    for (let h = 4; h <= 200; h++) {
      const parts = splitTargetHours(h, "VOLLZEIT");
      expect(sum(parts)).toBe(h);
      for (const p of parts) expect(p).toBeGreaterThanOrEqual(4);
      for (const p of parts) expect(p).toBeLessThanOrEqual(8);
    }
  });

  it("bevorzugt 8-h-Schichten (Beispiele aus der Spezifikation)", () => {
    expect(splitTargetHours(176, "VOLLZEIT")).toEqual(Array(22).fill(8));
    // 180 = 22×8 + 4
    expect(splitTargetHours(180, "VOLLZEIT").filter((x) => x === 8).length).toBe(22);
    expect(sum(splitTargetHours(180, "VOLLZEIT"))).toBe(180);
    // 179 = 21×8 + 7 + 4
    const s179 = splitTargetHours(179, "VOLLZEIT");
    expect(s179.filter((x) => x === 8).length).toBe(21);
    expect(sum(s179)).toBe(179);
    // 178 = 21×8 + 6 + 4
    const s178 = splitTargetHours(178, "VOLLZEIT");
    expect(s178.filter((x) => x === 8).length).toBe(21);
    expect(sum(s178)).toBe(178);
  });
});

describe("splitTargetHours – Teilzeit", () => {
  it("summiert exakt und vermeidet 7/8-h-Schichten wo möglich", () => {
    for (const h of [40, 55, 79, 80]) {
      const parts = splitTargetHours(h, "TEILZEIT");
      expect(sum(parts)).toBe(h);
      // keine 7/8-h-Schichten bei diesen Zielen
      expect(parts.every((p) => p <= 6)).toBe(true);
    }
  });

  it("adds about two shorter visits compared with the former 5h baseline", () => {
    expect(splitTargetHours(40, "TEILZEIT")).toEqual(Array(10).fill(4));
    expect(splitTargetHours(55, "TEILZEIT")).toHaveLength(13);
    expect(splitTargetHours(79, "TEILZEIT")).toHaveLength(18);
    expect(splitTargetHours(80, "TEILZEIT")).toHaveLength(18);

    for (const hours of [55, 79, 80]) {
      const parts = splitTargetHours(hours, "TEILZEIT");
      expect(sum(parts)).toBe(hours);
      expect(parts.filter((part) => part === 4).length).toBeGreaterThan(parts.length / 2);
    }
  });
});

describe("splitTargetHours – Fehlerfälle", () => {
  it("wirft bei nicht darstellbaren Zielen", () => {
    expect(() => splitTargetHours(1, "VOLLZEIT")).toThrow();
    expect(() => splitTargetHours(3, "TEILZEIT")).toThrow();
  });
  it("0 => leere Liste", () => {
    expect(splitTargetHours(0, "VOLLZEIT")).toEqual([]);
  });
});
