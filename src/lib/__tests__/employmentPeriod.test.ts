// ============================================================================
// Ngày vào làm / ngày thôi làm: vor dem Eintritt und nach dem Austritt wird
// nicht geplant, das Monats-Soll schrumpft auf den beschäftigten Teil.
// ============================================================================

import { describe, expect, it } from "vitest";
import { effectiveTargets, generateSchedule } from "../scheduler";
import { validateSchedule } from "../validation";
import { DEFAULT_WORK_HOURS } from "../workHours";
import { employmentPeriodLabel, isEmployeeActiveOn, prorateMinutes } from "../employmentPeriod";
import { datesOfMonth } from "../demand";
import type { Employee } from "../../types";

const vz = (id: string, extra: Partial<Employee> = {}): Employee => ({
  id, name: id, employmentType: "VOLLZEIT", targetMinutes: 176 * 60, ...extra,
});
const tz = (id: string, hours: number, extra: Partial<Employee> = {}): Employee => ({
  id, name: id, employmentType: "TEILZEIT", targetMinutes: hours * 60, ...extra,
});

describe("employmentPeriod", () => {
  it("erkennt beschäftigte Tage (Grenzen inklusiv)", () => {
    const e = vz("A", { startDate: "2026-10-10", endDate: "2026-10-20" });
    expect(isEmployeeActiveOn(e, "2026-10-09")).toBe(false);
    expect(isEmployeeActiveOn(e, "2026-10-10")).toBe(true);
    expect(isEmployeeActiveOn(e, "2026-10-20")).toBe(true);
    expect(isEmployeeActiveOn(e, "2026-10-21")).toBe(false);
  });

  it("kürzt das Soll anteilig nach Kalendertagen", () => {
    const dates = datesOfMonth(2026, 10); // 31 Tage
    const e = tz("B", 62, { startDate: "2026-10-17" }); // 15 von 31 Tagen
    expect(prorateMinutes(e.targetMinutes, e, dates)).toBe(30 * 60);
    expect(prorateMinutes(e.targetMinutes, tz("C", 62), dates)).toBe(62 * 60);
  });

  it("schreibt einen kurzen Text für die Liste", () => {
    expect(employmentPeriodLabel(vz("A", { startDate: "2026-10-16", endDate: "2026-11-30" }))).toBe(
      "vào 16/10/2026 · thôi làm 30/11/2026",
    );
  });
});

describe("Planer mit Ein- und Austritt", () => {
  const TEAM: Employee[] = [
    vz("VZ1"),
    vz("VZ2"),
    vz("VZ_NEU", { startDate: "2026-10-15" }),
    tz("TZ1", 40),
    tz("TZ_WEG", 40, { endDate: "2026-10-16" }),
    vz("MUSTER_NEU", {
      startDate: "2026-10-12",
      weekPattern: { days: 6, minHours: 6.5, maxHours: 7, weeklyHours: 40 },
    }),
  ];
  const input = { year: 2026, month: 10, workHours: DEFAULT_WORK_HOURS, employees: TEAM };
  const shifts = generateSchedule(input);
  const soll = effectiveTargets(input);

  it("plant niemanden vor dem Eintritt oder nach dem Austritt", () => {
    for (const s of shifts) {
      const e = TEAM.find((x) => x.id === s.employeeId)!;
      expect(isEmployeeActiveOn(e, s.date), `${e.id} ${s.date}`).toBe(true);
    }
  });

  it("kürzt das Soll und erreicht es genau", () => {
    expect(soll.get("VZ_NEU")).toBeLessThan(176 * 60);
    expect(soll.get("TZ_WEG")).toBeLessThan(40 * 60);
    // Muster mit Wochenvertrag ab Mo 12.10.: zwei volle Wochen (12.–18. und
    // 19.–25.) = 80 h, dazu Mo–Sa 26.–31.10. anteilig – fünf oder sechs
    // Arbeitstage, je nachdem ob der Ruhetag dort liegt.
    const muster = soll.get("MUSTER_NEU")! / 60;
    expect(muster).toBeGreaterThanOrEqual(80 + 33);
    expect(muster).toBeLessThanOrEqual(80 + 40);
    const employees = TEAM.map((e) => ({ ...e, targetMinutes: soll.get(e.id)! }));
    expect(validateSchedule(employees, shifts).errors).toEqual([]);
  });
});
