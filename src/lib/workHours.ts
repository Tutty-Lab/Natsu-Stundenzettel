// ============================================================================
// Arbeitszeit-Fenster (giờ làm) je Wochentag + Feiertag. Das ist das Fenster,
// in dem Schichten geplant werden dürfen (Früh am Fenster-Beginn, Spät am
// Fenster-Ende). Feiertage (NRW) werden für Nachfrage & Spätquote wie Sonntag
// behandelt, verwenden aber ihr eigenes Zeitfenster.
// ============================================================================

import { parseIsoDate, weekdayKeyOf, type WeekdayKey } from "./demand";

export type DayWindow = { startMinutes: number; endMinutes: number };

export type WorkHoursConfig = {
  perWeekday: Record<WeekdayKey, DayWindow>;
  holiday: DayWindow;
};

/**
 * Ausnahme für ein konkretes Datum (überschreibt Wochentag/Feiertag).
 * closed = an diesem Tag wird nicht geplant (z.B. Betriebsruhe);
 * window = abweichende Arbeitszeiten (z.B. halber Tag).
 */
export type DateOverride = {
  date: string; // ISO yyyy-MM-dd
  closed: boolean;
  window?: DayWindow;
  note?: string;
};

export type OverrideMap = Record<string, DateOverride>;

export type ResolvedDay = { closed: boolean; window: DayWindow };

const w = (start: number, end: number): DayWindow => ({ startMinutes: start, endMinutes: end });

// Standard für den Shop in Gütersloh:
//   Mo–Sa 10:30–22:00, So 11:30–22:00, Feiertag 11:30–22:00
const WEEKDAY = w(10 * 60 + 30, 22 * 60); // 10:30–22:00
const SUNDAY = w(11 * 60 + 30, 22 * 60); // 11:30–22:00

export const DEFAULT_WORK_HOURS: WorkHoursConfig = {
  perWeekday: {
    monday: { ...WEEKDAY },
    tuesday: { ...WEEKDAY },
    wednesday: { ...WEEKDAY },
    thursday: { ...WEEKDAY },
    friday: { ...WEEKDAY },
    saturday: { ...WEEKDAY },
    sunday: { ...SUNDAY },
  },
  holiday: { ...SUNDAY },
};

/**
 * Für Nachfrage/Spätquote maßgeblicher Wochentag: Feiertage zählen wie Sonntag
 * (der Nutzer gruppiert „Sonntag & Feiertag").
 */
export function effectiveWeekdayKey(isoDate: string, holidays: Set<string>): WeekdayKey {
  if (holidays.has(isoDate)) return "sunday";
  return weekdayKeyOf(parseIsoDate(isoDate));
}

/** Arbeitszeit-Fenster für ein konkretes Datum (berücksichtigt Feiertage). */
export function resolveWorkWindow(
  config: WorkHoursConfig,
  isoDate: string,
  holidays: Set<string>,
): DayWindow {
  if (holidays.has(isoDate)) return config.holiday;
  return config.perWeekday[weekdayKeyOf(parseIsoDate(isoDate))];
}

/**
 * Vollständige Auflösung eines Tages inkl. Ausnahmen:
 * Ausnahme (closed/eigene Zeiten) > Feiertag > Wochentag.
 */
export function resolveDay(
  config: WorkHoursConfig,
  isoDate: string,
  holidays: Set<string>,
  overrides: OverrideMap = {},
): ResolvedDay {
  const ov = overrides[isoDate];
  if (ov?.closed) return { closed: true, window: { startMinutes: 0, endMinutes: 0 } };
  if (ov?.window) return { closed: false, window: ov.window };
  return { closed: false, window: resolveWorkWindow(config, isoDate, holidays) };
}

/** Tiefe Kopie mit Auffüllen fehlender Felder (für Migration alter Speicherstände). */
export function normalizeWorkHours(partial: Partial<WorkHoursConfig> | undefined): WorkHoursConfig {
  const base = DEFAULT_WORK_HOURS;
  const perWeekday = { ...base.perWeekday };
  if (partial?.perWeekday) {
    for (const key of Object.keys(perWeekday) as WeekdayKey[]) {
      const v = partial.perWeekday[key];
      if (v && typeof v.startMinutes === "number" && typeof v.endMinutes === "number") {
        perWeekday[key] = { startMinutes: v.startMinutes, endMinutes: v.endMinutes };
      }
    }
  }
  const holiday =
    partial?.holiday &&
    typeof partial.holiday.startMinutes === "number" &&
    typeof partial.holiday.endMinutes === "number"
      ? { ...partial.holiday }
      : { ...base.holiday };
  return { perWeekday, holiday };
}
