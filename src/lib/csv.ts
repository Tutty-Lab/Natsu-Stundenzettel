// ============================================================================
// CSV-Export des Monatsplans (semikolon-getrennt, deutsches Excel-Format).
// ============================================================================

import type { Schedule } from "../types";
import { datesOfMonth, parseIsoDate, WEEKDAY_SHORT_VI, weekdayKeyOf } from "./demand";
import { minutesToDecimalHours, minutesToTime } from "./time";
import { format } from "date-fns";

function csvEscape(value: string): string {
  if (/[";\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Eine Zeile je Schicht mit Mitarbeiter, Datum, Zeiten, Pause, Arbeitszeit. */
export function scheduleToCsv(schedule: Schedule): string {
  const header = [
    "Nhân viên",
    "Hình thức",
    "Ngày",
    "Thứ",
    "Giờ vào",
    "Giờ ra",
    "Nghỉ (phút)",
    "Giờ công (h)",
  ];

  const rows: string[][] = [];
  const dates = datesOfMonth(schedule.year, schedule.month);
  const empById = new Map(schedule.employees.map((e) => [e.id, e] as const));

  const shiftsByEmployee = new Map<string, typeof schedule.shifts>();
  for (const s of schedule.shifts) {
    if (!shiftsByEmployee.has(s.employeeId)) shiftsByEmployee.set(s.employeeId, []);
    shiftsByEmployee.get(s.employeeId)!.push(s);
  }

  for (const emp of schedule.employees) {
    const byDate = new Map(
      (shiftsByEmployee.get(emp.id) ?? []).map((s) => [s.date, s] as const),
    );
    for (const date of dates) {
      const s = byDate.get(date);
      const weekday = WEEKDAY_SHORT_VI[weekdayKeyOf(parseIsoDate(date))];
      const datum = format(parseIsoDate(date), "dd.MM.yyyy");
      const artLabel =
        emp.employmentType === "VOLLZEIT"
          ? "Toàn thời gian"
          : emp.employmentType === "AZUBI"
            ? "Azubi (học nghề)"
            : "Bán thời gian";
      if (s) {
        rows.push([
          emp.name,
          artLabel,
          datum,
          weekday,
          minutesToTime(s.startMinutes),
          minutesToTime(s.endMinutes),
          String(s.pauseMinutes),
          minutesToDecimalHours(s.paidMinutes),
        ]);
      } else {
        rows.push([emp.name, artLabel, datum, weekday, "", "", "", "Nghỉ"]);
      }
    }
    // Dòng tổng mỗi nhân viên
    const total = (shiftsByEmployee.get(emp.id) ?? []).reduce((a, s) => a + s.paidMinutes, 0);
    rows.push([emp.name, "", "", "", "", "", "Tổng", minutesToDecimalHours(total)]);
  }

  void empById;
  const lines = [header, ...rows].map((cols) => cols.map(csvEscape).join(";"));
  return lines.join("\r\n");
}

/**
 * Speichert/teilt die CSV. Auf Handys (v.a. iOS) ist der `download`-Trick
 * unzuverlässig, daher zuerst der native Teilen-Dialog (Web Share mit Datei),
 * sonst der klassische Download-Link.
 */
export async function downloadCsv(filename: string, csv: string): Promise<void> {
  // BOM für korrekte Umlaute in Excel.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });

  // 1) Web Share (mobil): speichern in „Dateien" / weiterleiten.
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  if (typeof File !== "undefined" && nav.canShare) {
    const file = new File([blob], filename, { type: "text/csv" });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: filename });
        return;
      } catch (err) {
        // Abbruch durch den Nutzer -> nichts weiter tun.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // sonst: unten Fallback.
      }
    }
  }

  // 2) Fallback: klassischer Download-Link.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
