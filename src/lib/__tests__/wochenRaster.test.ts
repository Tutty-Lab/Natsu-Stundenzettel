// ============================================================================
// Wochen-Dienstplan als Tabelle (Person × Tag): Daten und PDF.
// ============================================================================

import { describe, expect, it } from "vitest";
import { buildWochenRasterPdf, wochenRasterFor } from "../pdf";
import { DEFAULT_WORK_HOURS } from "../workHours";
import type { Schedule, Shift } from "../../types";

const shift = (id: string, employeeId: string, date: string, from: number, to: number, paid: number): Shift => ({
  id,
  employeeId,
  date,
  startMinutes: from * 60,
  endMinutes: to * 60,
  pauseMinutes: (to - from) * 60 - paid,
  paidMinutes: paid,
  shiftType: "CUSTOM",
  generated: true,
});

const WEEK = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];

const schedule: Schedule = {
  companyName: "NATSU Test",
  address: "",
  year: 2026,
  month: 10,
  workHours: DEFAULT_WORK_HOURS,
  dateOverrides: [],
  employees: [
    { id: "T", name: "Tom", employmentType: "TEILZEIT", targetMinutes: 40 * 60 },
    { id: "A", name: "Anna", employmentType: "VOLLZEIT", targetMinutes: 176 * 60 },
    { id: "W", name: "Weg", employmentType: "TEILZEIT", targetMinutes: 40 * 60, endDate: "2026-09-30" },
  ],
  shifts: [
    shift("1", "A", "2026-10-05", 10.5, 17.5, 390),
    shift("2", "T", "2026-10-05", 12, 15, 180),
    shift("3", "T", "2026-10-05", 17, 21, 240),
    shift("4", "A", "2026-10-12", 10.5, 17.5, 390), // nächste Woche
  ],
};

describe("wochenRasterFor", () => {
  const raster = wochenRasterFor(schedule, WEEK);

  it("listet Vollzeit vor Teilzeit und lässt Ausgeschiedene weg", () => {
    expect(raster.rows.map((r) => r.name)).toEqual(["Anna", "Tom"]);
  });

  it("schreibt geteilte Tage als zwei Einträge in eine Zelle", () => {
    const tom = raster.rows.find((r) => r.name === "Tom")!;
    expect(tom.cells[0]).toEqual(["12:00–15:00", "17:00–21:00"]);
    expect(tom.cells[1]).toEqual([]);
    expect(tom.paidMinutes).toBe(420);
  });

  it("zählt nur Dienste dieser Woche und Personen je Tag", () => {
    expect(raster.rows.find((r) => r.name === "Anna")!.paidMinutes).toBe(390);
    expect(raster.people).toEqual([2, 0, 0, 0, 0, 0, 0]);
    expect(raster.days[0]).toMatchObject({ wd: "Mo", dm: "05.10." });
  });

  it("baut je Woche eine Seite", () => {
    const doc = buildWochenRasterPdf(schedule, [
      { dates: WEEK, label: "Woche 1" },
      { dates: ["2026-10-12"], label: "Woche 2" },
    ]);
    expect(doc.getNumberOfPages()).toBe(2);
  });
});
