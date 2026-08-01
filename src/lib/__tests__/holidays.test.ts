import { describe, expect, it } from "vitest";
import { easterSunday, nrwHolidays } from "../holidays";
import { generateSchedule } from "../scheduler";
import { validateSchedule } from "../validation";
import { DEFAULT_WORK_HOURS } from "../workHours";
import { SAMPLE_EMPLOYEES } from "../sampleData";
import { format } from "date-fns";

describe("Feiertage (NRW)", () => {
  it("berechnet Ostersonntag korrekt", () => {
    expect(format(easterSunday(2026), "yyyy-MM-dd")).toBe("2026-04-05");
    expect(format(easterSunday(2024), "yyyy-MM-dd")).toBe("2024-03-31");
  });

  it("enthält die festen und beweglichen NRW-Feiertage 2026", () => {
    const h = nrwHolidays(2026);
    expect(h.has("2026-01-01")).toBe(true); // Neujahr
    expect(h.has("2026-04-03")).toBe(true); // Karfreitag
    expect(h.has("2026-04-06")).toBe(true); // Ostermontag
    expect(h.has("2026-05-01")).toBe(true); // Tag der Arbeit
    expect(h.has("2026-06-04")).toBe(true); // Fronleichnam
    expect(h.has("2026-10-03")).toBe(true); // Deutsche Einheit
    expect(h.has("2026-11-01")).toBe(true); // Allerheiligen
    expect(h.has("2026-12-25")).toBe(true);
    expect(h.has("2026-12-26")).toBe(true);
    expect(h.size).toBe(11);
  });
});

describe("Scheduler mit Feiertagen (Dezember 2026)", () => {
  it("bleibt gültig und trifft jedes Soll exakt", () => {
    const shifts = generateSchedule({
      year: 2026,
      month: 12, // enthält 1. und 2. Weihnachtstag
      workHours: DEFAULT_WORK_HOURS,
      employees: SAMPLE_EMPLOYEES,
    });
    const result = validateSchedule(SAMPLE_EMPLOYEES, shifts);
    expect(result.valid).toBe(true);
    const total = shifts.reduce((s, x) => s + x.paidMinutes, 0);
    expect(total).toBe(1022 * 60);
  });

  it("plant Schichten an Feiertagen im 11:30–22:00-Fenster", () => {
    const shifts = generateSchedule({
      year: 2026,
      month: 12,
      workHours: DEFAULT_WORK_HOURS,
      employees: SAMPLE_EMPLOYEES,
    });
    // 25.12. ist Feiertag -> Fenster wie Sonntag: frühester Beginn 11:30 (690).
    const xmas = shifts.filter((s) => s.date === "2026-12-25");
    for (const s of xmas) {
      expect(s.startMinutes).toBeGreaterThanOrEqual(11 * 60 + 30);
      expect(s.endMinutes).toBeLessThanOrEqual(22 * 60);
    }
  });
});
