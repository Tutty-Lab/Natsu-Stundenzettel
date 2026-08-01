// ============================================================================
// Gesetzliche Feiertage in Nordrhein-Westfalen (NRW) – der Shop liegt in
// Gütersloh (33330), also NRW. Bewegliche Feiertage werden über die
// Osterformel (Gauß/Computus) berechnet.
// ============================================================================

import { addDays, format } from "date-fns";

/** Ostersonntag eines Jahres (Gauß'sche Osterformel, gregorianisch). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = März, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function iso(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * Alle gesetzlichen NRW-Feiertage eines Jahres als ISO-Set "yyyy-MM-dd".
 * Enthält die in NRW gültigen festen und beweglichen Feiertage.
 */
export function nrwHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const set = new Set<string>([
    iso(new Date(year, 0, 1)), // Neujahr
    iso(addDays(easter, -2)), // Karfreitag
    iso(addDays(easter, 1)), // Ostermontag
    iso(new Date(year, 4, 1)), // Tag der Arbeit (1. Mai)
    iso(addDays(easter, 39)), // Christi Himmelfahrt
    iso(addDays(easter, 50)), // Pfingstmontag
    iso(addDays(easter, 60)), // Fronleichnam (NRW)
    iso(new Date(year, 9, 3)), // Tag der Deutschen Einheit (3. Okt)
    iso(new Date(year, 10, 1)), // Allerheiligen (NRW, 1. Nov)
    iso(new Date(year, 11, 25)), // 1. Weihnachtstag
    iso(new Date(year, 11, 26)), // 2. Weihnachtstag
  ]);
  return set;
}

/** Deutsche Namen der NRW-Feiertage (für Anzeige/Bemerkung). */
export function nrwHolidayNames(year: number): Map<string, string> {
  const easter = easterSunday(year);
  const map = new Map<string, string>();
  map.set(iso(new Date(year, 0, 1)), "Neujahr");
  map.set(iso(addDays(easter, -2)), "Karfreitag");
  map.set(iso(addDays(easter, 1)), "Ostermontag");
  map.set(iso(new Date(year, 4, 1)), "Tag der Arbeit");
  map.set(iso(addDays(easter, 39)), "Christi Himmelfahrt");
  map.set(iso(addDays(easter, 50)), "Pfingstmontag");
  map.set(iso(addDays(easter, 60)), "Fronleichnam");
  map.set(iso(new Date(year, 9, 3)), "Tag der Deutschen Einheit");
  map.set(iso(new Date(year, 10, 1)), "Allerheiligen");
  map.set(iso(new Date(year, 11, 25)), "1. Weihnachtstag");
  map.set(iso(new Date(year, 11, 26)), "2. Weihnachtstag");
  return map;
}
