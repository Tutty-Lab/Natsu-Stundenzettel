import { describe, expect, it } from "vitest";
import {
  calculatePaidMinutes,
  calculatePause,
  minutesToDecimalHours,
  minutesToTime,
  presenceFromPaid,
  timeToMinutes,
} from "../time";

describe("timeToMinutes / minutesToTime", () => {
  it("konvertiert Uhrzeiten in Minuten", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("13:30")).toBe(810);
    expect(timeToMinutes("22:00")).toBe(1320);
  });

  it("ist invers zu minutesToTime", () => {
    for (const t of ["10:00", "13:30", "17:45", "22:00"]) {
      expect(minutesToTime(timeToMinutes(t))).toBe(t);
    }
  });

  it("wirft bei ungültigem Format", () => {
    expect(() => timeToMinutes("25:00")).toThrow();
    expect(() => timeToMinutes("abc")).toThrow();
  });
});

describe("calculatePause", () => {
  it("0 Minuten bis einschließlich 6 h", () => {
    expect(calculatePause(4 * 60)).toBe(0);
    expect(calculatePause(6 * 60)).toBe(0);
  });
  it("30 Minuten über 6 h", () => {
    expect(calculatePause(6 * 60 + 1)).toBe(30);
    expect(calculatePause(7 * 60)).toBe(30);
    expect(calculatePause(8 * 60)).toBe(30);
  });
});

describe("calculatePaidMinutes / presenceFromPaid", () => {
  it("berechnet bezahlte Minuten aus Beginn/Ende/Pause", () => {
    // 13:30-22:00, Pause 30 => 8 h
    expect(calculatePaidMinutes(810, 1320, 30)).toBe(480);
    // 18:00-22:00, Pause 0 => 4 h
    expect(calculatePaidMinutes(1080, 1320, 0)).toBe(240);
  });
  it("presence = paid + pause", () => {
    expect(presenceFromPaid(480)).toBe(510); // 8h + 30
    expect(presenceFromPaid(240)).toBe(240); // 4h + 0
    expect(presenceFromPaid(360)).toBe(360); // 6h + 0
    expect(presenceFromPaid(420)).toBe(450); // 7h + 30
  });
});

describe("minutesToDecimalHours", () => {
  it("formatiert deutsch mit Komma", () => {
    expect(minutesToDecimalHours(480)).toBe("8,00");
    expect(minutesToDecimalHours(450)).toBe("7,50");
  });
});
