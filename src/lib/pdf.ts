// ============================================================================
// PDF-Export – ECHTES Vektor-PDF (Text + Linien), nicht mehr als Screenshot.
//
// Frühere Versionen haben die HTML-Seite mit html2canvas "abfotografiert" und
// das Bild in die PDF geklebt. Das war fragil: ob eine Seite sauber wird, hing
// an Font-Laden, Stylesheet-Laden, Klon-Timing, Browser und Speicher – die
// erste Seite kam z. B. gelegentlich ganz ohne Styles heraus. Deshalb musste
// man auf jedem Gerät nachkontrollieren.
//
// Jetzt zeichnen wir die PDF direkt mit jsPDF + autoTable: reiner Text und
// echte Tabellenlinien. Das Ergebnis ist DETERMINISTISCH – auf jedem Handy,
// Browser und In-App-Webview identisch, die Linien können nie "verschwinden",
// die Datei ist winzig, und es gibt kein Timing/keine Schrift zum Abwarten.
//
// Schrift: die eingebaute Helvetica (Standard-14, kein Nachladen). Sie deckt
// Deutsch inkl. Umlaute/ß ab. Vietnamesische Namen werden auf ASCII übertragen
// (siehe T()) – bewusst ohne Diakritika, so gewünscht.
// ============================================================================

import { jsPDF } from "jspdf";
import type { Employee, Schedule, Shift } from "../types";
import {
  datesOfMonth,
  parseIsoDate,
  WEEKDAY_LABELS_DE,
  weekdayKeyOf,
} from "./demand";
import { minutesToDecimalHours, minutesToTime } from "./time";
import { MONTH_NAMES_DE } from "./dateFormat";
import { nrwHolidayNames } from "./holidays";
import { format } from "date-fns";

/** Dateiname säubern: Umlaute/Akzente weg, nur unbedenkliche Zeichen behalten. */
export function safeFileName(text: string): string {
  const plain = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Akzente entfernen: "Tuấn" -> "Tuan"
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
  return plain.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "Stundenzettel";
}

// ── Text für die eingebaute Schrift aufbereiten ────────────────────────────
// Helvetica kann Latin-1 (inkl. ä ö ü ß). Alles darüber (vietnamesische
// Diakritika, Typo-Anführungszeichen, Gedankenstrich) wird auf ein passendes
// ASCII/Latin-1-Zeichen abgebildet, damit nie ein Kästchen/"?" erscheint.
const PUNCT: Record<string, string> = {
  "–": "-", // – en dash
  "—": "-", // — em dash
  "‘": "'",
  "’": "'",
  "‚": ",",
  "“": '"',
  "”": '"',
  "„": '"',
  "…": "...",
  " ": " ", // geschütztes Leerzeichen
};

function T(input: string | undefined | null): string {
  if (!input) return "";
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (PUNCT[ch]) {
      out += PUNCT[ch];
    } else if (code <= 0xff) {
      // Latin-1: Deutsch inkl. Umlaute/ß bleibt erhalten.
      out += ch;
    } else if (ch === "đ" || ch === "Đ") {
      out += ch === "đ" ? "d" : "D";
    } else {
      // z. B. vietnamesische Vokale: zerlegen und Diakritika entfernen.
      const stripped = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += /^[\x20-\xff]*$/.test(stripped) ? stripped : "";
    }
  }
  return out;
}

// ── gemeinsame Farb-/Maß-Konstanten ────────────────────────────────────────
const INK: [number, number, number] = [15, 23, 42]; // slate-900
const MUTED: [number, number, number] = [100, 116, 139]; // slate-500
const LINE: [number, number, number] = [71, 85, 105]; // slate-600
const GRID: [number, number, number] = [148, 163, 184]; // slate-400
const HEAD_FILL: [number, number, number] = [241, 245, 249]; // slate-100
const SHADE_FILL: [number, number, number] = [248, 250, 252]; // slate-50
const DIVIDER: [number, number, number] = [203, 213, 225]; // slate-300

const MARGIN = 14; // mm

/** Beschäftigungsart auf Deutsch (dieser Laden hat dafür kein eigenes Modul). */
function employmentLabelDe(type: Employee["employmentType"]): string {
  return type === "VOLLZEIT" ? "Vollzeit" : type === "TEILZEIT" ? "Teilzeit" : "Minijob";
}

function monthLabelDe(year: number, month: number): string {
  return `${MONTH_NAMES_DE[month - 1]} ${year}`;
}

/** Kopfzeile (Titel links, Zeitraum rechts) + Trennlinie. Gibt neues Y zurück. */
function drawHeader(
  doc: jsPDF,
  title: string,
  schedule: Schedule,
  periodLabel: string,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  let y = MARGIN + 1;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(T(title), MARGIN, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...LINE);
  doc.text(T(periodLabel), pageW - MARGIN, y, { align: "right" });

  y += 4.5;
  doc.setFontSize(9);
  doc.setTextColor(...LINE);
  doc.text(T(schedule.companyName || "—"), MARGIN, y);
  if (schedule.address) {
    y += 3.6;
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(T(schedule.address), MARGIN, y);
  }

  y += 2.4;
  doc.setDrawColor(30, 41, 59); // slate-800
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  return y + 4;
}

/** Zweispaltiger Info-Block; gibt das Y darunter zurück. */
function drawInfoBlock(
  doc: jsPDF,
  pairs: Array<[string, string | null]>, // null = Feld zum Ausfüllen von Hand
  startY: number,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const colX = [MARGIN, pageW / 2 + 4];
  const labelW = 32;
  let y = startY;
  doc.setFontSize(8);

  for (let i = 0; i < pairs.length; i += 2) {
    for (let c = 0; c < 2; c++) {
      const pair = pairs[i + c];
      if (!pair) continue;
      const [label, value] = pair;
      const x = colX[c];
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text(`${T(label)}:`, x, y);
      if (value === null) {
        // Leere Schreiblinie – wird auf dem Papier von Hand ergänzt.
        doc.setDrawColor(...GRID);
        doc.setLineWidth(0.2);
        doc.line(x + labelW, y, x + labelW + 45, y);
      } else {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...INK);
        doc.text(T(value), x + labelW, y);
      }
    }
    y += 5;
  }
  return y + 1;
}

/** Unterschriftszeilen am Seitenende. */
function drawSignatures(doc: jsPDF, labels: string[], y: number): void {
  const pageW = doc.internal.pageSize.getWidth();
  const gap = (pageW - 2 * MARGIN) / labels.length;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...LINE);
  labels.forEach((label, i) => {
    const x0 = MARGIN + i * gap;
    const x1 = x0 + gap - 10;
    doc.line(x0, y, x1, y);
    doc.text(T(label), x0, y + 4);
  });
}

// ── Stundenzettel ──────────────────────────────────────────────────────────

type DayRow = {
  shaded: boolean;
  shiftCount: number;
  cells: string[]; // [datum/wd, beginn, ende, pause, arbeitszeit, bemerkung]
};

function stundenzettelRowsFor(
  schedule: Schedule,
  employee: Employee,
  dates: string[],
): { rows: DayRow[]; totalMinutes: number } {
  const byDate = new Map<string, Shift[]>();
  for (const s of schedule.shifts) {
    if (s.employeeId !== employee.id) continue;
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }
  for (const list of byDate.values()) list.sort((a, b) => a.startMinutes - b.startMinutes);

  const holidayNames = nrwHolidayNames(schedule.year);
  const closedByDate = new Map(
    schedule.dateOverrides.filter((o) => o.closed).map((o) => [o.date, o] as const),
  );

  let totalMinutes = 0;
  const rows: DayRow[] = dates.map((d) => {
    const dienste = byDate.get(d) ?? [];
    totalMinutes += dienste.reduce((a, s) => a + s.paidMinutes, 0);
    const wd = WEEKDAY_LABELS_DE[weekdayKeyOf(parseIsoDate(d))];
    const holiday = holidayNames.get(d);
    const closed = closedByDate.get(d);
    const isWeekend = wd === "Samstag" || wd === "Sonntag";
    const shaded = Boolean(isWeekend || holiday || closed);
    const datum = `${format(parseIsoDate(d), "dd.MM.yyyy")}\n${wd}`;

    if (dienste.length === 0) {
      const bemerkung = closed
        ? closed.note || "Betriebsruhe"
        : holiday
          ? `Frei (Feiertag: ${holiday})`
          : "Frei";
      return { shaded, shiftCount: 0, cells: [datum, "", "", "", "0,00", bemerkung] };
    }

    const beginn = dienste.map((x) => minutesToTime(x.startMinutes)).join("\n");
    const ende = dienste.map((x) => minutesToTime(x.endMinutes)).join("\n");
    const pause = dienste.map((x) => `${x.pauseMinutes} Min`).join("\n");
    const arbeitszeit = dienste.map((x) => minutesToDecimalHours(x.paidMinutes)).join("\n");
    const bemerkung = holiday ? `Feiertag: ${holiday}` : "";
    return {
      shaded,
      shiftCount: dienste.length,
      cells: [datum, beginn, ende, pause, arbeitszeit, bemerkung],
    };
  });

  return { rows, totalMinutes };
}

// Spalten des Stundenzettels: x-Position, Breite, Ausrichtung. Rechte Kante 196.
const SZ_COLS: Array<{ x: number; w: number; align: "left" | "center" }> = [
  { x: 14, w: 30, align: "left" }, // Datum / Wochentag
  { x: 44, w: 26, align: "center" }, // Arbeitsbeginn
  { x: 70, w: 26, align: "center" }, // Arbeitsende
  { x: 96, w: 20, align: "center" }, // Pause
  { x: 116, w: 26, align: "center" }, // Arbeitszeit
  { x: 142, w: 54, align: "left" }, // Bemerkung
];
const SZ_LEFT = 14;
const SZ_RIGHT = 196;
const SZ_HEAD = ["Datum / Wochentag", "Arbeitsbeginn", "Arbeitsende", "Pause", "Arbeitszeit", "Bemerkung"];

/**
 * Zeichnet die Stundenzettel-Tabelle VON HAND (jsPDF-Primitive, ohne autoTable).
 *
 * Warum von Hand: die eingebundene autoTable-Version berechnet zwar alle Zeilen,
 * zeichnet im minifizierten Bundle aber nur einen Teil (ein ganzer Monat wurde
 * ab ~Tag 23 abgeschnitten). Selbst gezeichnet haben wir volle Kontrolle über die
 * Zeilenhöhe – ein ganzer Monat passt garantiert auf EINE Seite – und es gibt
 * keine Fremd-Bibliothek mehr, die Zeilen verschluckt.
 *
 * Tage mit ZWEI Diensten (mittags und abends): jeder Dienst bekommt einen
 * eigenen Streifen mit eigenem Innenabstand, getrennt durch eine feine Linie –
 * wie auf der Seite im Browser. Früher standen beide Dienste in der Höhe einer
 * normalen Zeile und die Trennlinie berührte die Schrift.
 *
 * `maxBottom`: bis hierhin darf die Tabelle reichen (darunter liegen Summe und
 * Unterschriften). Werden es durch viele geteilte Tage zu viele Millimeter,
 * schrumpfen Zeilen und Schrift gleichmäßig – die Seite bleibt EINE Seite.
 */
function drawStundenzettelTable(
  doc: jsPDF,
  startY: number,
  rows: DayRow[],
  totalMinutes: number,
  maxBottom: number,
): void {
  const BASE_FS = 6.5; // Schriftgröße (pt)
  const BASE_LH = 2.5; // Höhe je Textzeile (mm)
  const BASE_PADV = 0.7; // Innenabstand oben/unten (mm)
  const MIN_FS = 5.5;

  doc.setFont("helvetica", "normal");

  // Zellinhalte in Zeilen zerlegen (Bemerkung ggf. auf Spaltenbreite umbrechen).
  // Die Umbruchbreite hängt an der Schrift – deshalb einmal je Schriftgröße.
  const zerlegen = (fs: number) => {
    doc.setFontSize(fs);
    return rows.map((r) =>
      r.cells.map((c, ci) => {
        const parts = T(c).split("\n");
        if (ci === 5 && T(c)) {
          return parts.flatMap((p) => (p ? (doc.splitTextToSize(p, SZ_COLS[ci].w - 3) as string[]) : [""]));
        }
        return parts;
      }),
    );
  };

  /** Zeilenhöhen für gegebene Maße: geteilte Tage bekommen je Dienst einen vollen Streifen. */
  const hoehen = (lines: string[][][], lh: number, padv: number) =>
    rows.map((r, ri) => {
      const maxLines = Math.max(1, ...lines[ri].map((l) => l.length));
      const normal = maxLines * lh + 2 * padv;
      return r.shiftCount >= 2 ? Math.max(normal, r.shiftCount * (lh + 2 * padv)) : normal;
    });

  // Erst in voller Größe rechnen; passt es nicht bis maxBottom, gleichmäßig verkleinern.
  let FS = BASE_FS;
  let LH = BASE_LH;
  let PADV = BASE_PADV;
  let bodyLines = zerlegen(FS);
  let rowH = hoehen(bodyLines, LH, PADV);
  const gesamt = (rh: number[], lh: number, padv: number) =>
    2 * (lh + 2 * padv) + rh.reduce((a, b) => a + b, 0);
  const verfuegbar = maxBottom - startY;
  const natuerlich = gesamt(rowH, LH, PADV);
  if (natuerlich > verfuegbar) {
    const s = verfuegbar / natuerlich;
    LH = BASE_LH * s;
    PADV = BASE_PADV * s;
    FS = Math.max(MIN_FS, BASE_FS * s);
    bodyLines = zerlegen(FS);
    rowH = hoehen(bodyLines, LH, PADV);
  }
  const headH = LH + 2 * PADV;
  const footH = LH + 2 * PADV;
  doc.setFontSize(FS);

  const drawCellText = (
    text: string,
    ci: number,
    yBaseline: number,
    style: "normal" | "bold",
    color: [number, number, number],
  ) => {
    if (!text) return;
    const col = SZ_COLS[ci];
    doc.setFont("helvetica", style);
    doc.setTextColor(...color);
    const tx = col.align === "center" ? col.x + col.w / 2 : col.x + 1.5;
    doc.text(text, tx, yBaseline, { align: col.align });
  };

  /** Grundlinie einer Textzeile, deren Mitte bei `mitte` liegen soll. */
  const grundlinie = (mitte: number) => mitte + LH * 0.22;

  /** Mehrere Zeilen als Block senkrecht mittig zwischen `oben` und `oben + hoehe`. */
  const block = (lines: string[], ci: number, oben: number, hoehe: number) => {
    const start = oben + (hoehe - lines.length * LH) / 2;
    lines.forEach((ln, j) => {
      const yBase = grundlinie(start + j * LH + LH / 2);
      if (ci === 0 && j === 0) drawCellText(ln, ci, yBase, "bold", INK);
      else if (ci === 0 || ci === 5) drawCellText(ln, ci, yBase, "normal", MUTED);
      else drawCellText(ln, ci, yBase, "normal", INK);
    });
  };

  // ---- Kopfzeile ----
  let y = startY;
  doc.setFillColor(...HEAD_FILL);
  doc.rect(SZ_LEFT, y, SZ_RIGHT - SZ_LEFT, headH, "F");
  SZ_HEAD.forEach((h, ci) => drawCellText(h, ci, grundlinie(y + headH / 2), "bold", INK));
  y += headH;

  // ---- Datenzeilen ----
  const rowTops: number[] = [];
  rows.forEach((r, ri) => {
    const h = rowH[ri];
    rowTops.push(y);
    if (r.shaded) {
      doc.setFillColor(...SHADE_FILL);
      doc.rect(SZ_LEFT, y, SZ_RIGHT - SZ_LEFT, h, "F");
    }
    const cells = bodyLines[ri];

    if (r.shiftCount >= 2) {
      // Jeder Dienst ein eigener Streifen; Datum/Wochentag über die ganze Zeile.
      const n = r.shiftCount;
      const streifen = h / n;
      // Bemerkung: eine Zeile gehört zum ersten Dienst (wie im Browser); ein
      // längerer Text steht mittig über der ganzen Zeile, dann ohne Linie dort.
      const bemerkungKurz = cells[5].filter(Boolean).length <= 1;
      doc.setDrawColor(...DIVIDER);
      doc.setLineWidth(0.2);
      for (let k = 1; k < n; k++) {
        const yy = y + streifen * k;
        doc.line(SZ_COLS[1].x, yy, bemerkungKurz ? SZ_RIGHT : SZ_COLS[5].x, yy);
      }
      block(cells[0], 0, y, h);
      for (let ci = 1; ci <= 4; ci++) {
        cells[ci].forEach((ln, j) => block([ln], ci, y + j * streifen, streifen));
      }
      if (bemerkungKurz) block(cells[5].filter(Boolean), 5, y, streifen);
      else block(cells[5], 5, y, h);
    } else {
      cells.forEach((lines, ci) => block(lines, ci, y, h));
    }
    y += h;
  });

  // ---- Fußzeile (Gesamtstunden) ----
  const footTop = y;
  doc.setFillColor(...HEAD_FILL);
  doc.rect(SZ_LEFT, y, SZ_RIGHT - SZ_LEFT, footH, "F");
  drawCellText("Gesamtstunden", 0, grundlinie(y + footH / 2), "bold", INK);
  drawCellText(minutesToDecimalHours(totalMinutes), 4, grundlinie(y + footH / 2), "bold", INK);
  y += footH;
  const tableBottom = y;

  // ---- Gitter (nach den Füllungen, damit die Linien oben liegen) ----
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.2);
  for (const hy of [startY, ...rowTops, footTop, tableBottom]) doc.line(SZ_LEFT, hy, SZ_RIGHT, hy);
  for (const vx of [SZ_LEFT, ...SZ_COLS.slice(1).map((c) => c.x), SZ_RIGHT]) {
    doc.line(vx, startY, vx, tableBottom);
  }
}

/** Zeichnet EINEN Stundenzettel auf die aktuelle Seite. */
function drawStundenzettel(
  doc: jsPDF,
  schedule: Schedule,
  employee: Employee,
  dates: string[],
  periodLabel: string,
): void {
  const startY = drawHeader(doc, "Stundenaufzeichnung", schedule, periodLabel);
  const infoY = drawInfoBlock(
    doc,
    [
      ["Firmenname", schedule.companyName || "—"],
      ["Beschäftigungsart", employmentLabelDe(employee.employmentType)],
      ["Mitarbeiter", employee.name],
      ["Monat", MONTH_NAMES_DE[schedule.month - 1]],
      ["Sollstunden", null], // von Hand einzutragen
      ["Jahr", String(schedule.year)],
    ],
    startY,
  );

  const { rows, totalMinutes } = stundenzettelRowsFor(schedule, employee, dates);

  // Unter der Tabelle liegen Summe (ab pageH − 30) und Unterschriften – die
  // Tabelle hört spätestens 5 mm darüber auf.
  drawStundenzettelTable(doc, infoY, rows, totalMinutes, doc.internal.pageSize.getHeight() - 35);

  // Zusammenfassung + Unterschriften: FESTE Positionen im reservierten Band am
  // Seitenende – unabhängig davon, wo die Tabelle endet (keine Kollision mehr).
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const summaryY = pageH - 30;
  const col3 = (pageW - 2 * MARGIN) / 3;

  const summary: Array<[string, string | null]> = [
    ["Gesamtstunden", `${minutesToDecimalHours(totalMinutes)} h`],
    ["Sollstunden", null],
    ["Differenz", null],
  ];
  summary.forEach(([label, value], i) => {
    const x = MARGIN + i * col3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(T(label), x, summaryY);
    if (value === null) {
      doc.setDrawColor(...GRID);
      doc.setLineWidth(0.2);
      doc.line(x, summaryY + 5, x + 26, summaryY + 5);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(T(value), x, summaryY + 5);
    }
  });

  drawSignatures(
    doc,
    ["Unterschrift Mitarbeiter", "Unterschrift Arbeitgeber", "Datum"],
    pageH - 14,
  );
}

/**
 * Baut die Stundenzettel-PDF: eine A4-Seite je Mitarbeiter.
 * `dates` fehlt => ganzer Monat; `periodLabel` fehlt => Monat/Jahr.
 *
 * async + kurzer Yield je Seite: der Fortschritt (X/N) kann gerendert werden
 * und der Haupt-Thread bleibt auch auf schwachen Handys frei. Die Ausgabe
 * selbst ist trotzdem rein deterministisch – der Yield ändert nichts am Inhalt.
 */
export async function buildStundenzettelPdf(
  schedule: Schedule,
  employees: Employee[],
  opts: { dates?: string[]; periodLabel?: string } = {},
  onProgress?: (current: number, total: number) => void,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const dates = opts.dates ?? datesOfMonth(schedule.year, schedule.month);
  const periodLabel = opts.periodLabel ?? monthLabelDe(schedule.year, schedule.month);

  for (let i = 0; i < employees.length; i++) {
    if (i > 0) doc.addPage();
    drawStundenzettel(doc, schedule, employees[i], dates, periodLabel);
    onProgress?.(i + 1, employees.length);
    if (employees.length > 1) await new Promise((r) => setTimeout(r, 0));
  }

  return doc;
}

// ── Wochen-Dienstplan (nach Tag und Schicht, nicht je Person) ───────────────
// Der Aushang für die Woche: Spalten = Tage, Zeilen = Früh-/Mittel-/Spätschicht,
// in jeder Zelle wer wann arbeitet. Das ist der Zeitplan für das Team – den
// Stundenzettel je Person gibt es weiterhin für den Monat.

export type WochenSchicht = "EARLY" | "MID" | "LATE";
export const WOCHEN_SCHICHTEN: Array<{ key: WochenSchicht; label: string }> = [
  { key: "EARLY", label: "Frühschicht" },
  { key: "MID", label: "Mittelschicht" },
  { key: "LATE", label: "Spätschicht" },
];

export type WochenGruppe = { time: string; names: string[] };

export type WochenTag = {
  date: string;
  /** "Montag 06.10." */
  head: string;
  /** Feiertag / geschlossen – sonst leer. */
  note: string;
  closed: boolean;
  /**
   * Je Schicht die Leute, GEBÜNDELT nach Uhrzeit: "13:30-22:00" -> [A, B, C].
   * Früher stand die Uhrzeit hinter jedem Namen – zehnmal dieselbe Zeit in
   * einer Zelle, und lange Namen brachen mitten in der Uhrzeit um.
   */
  cells: Record<WochenSchicht, WochenGruppe[]>;
  /** Wie viele Personen an dem Tag arbeiten. */
  people: number;
  /** Je Dienst ein Balken für die Zeitleiste – nach Beginn, dann Name sortiert. */
  bars: WochenBalken[];
};

export type WochenBalken = {
  name: string;
  start: number;
  end: number;
  pause: number;
  schicht: WochenSchicht;
};

/**
 * Verteilt die Balken eines Tages auf Spuren: Dienste, die sich zeitlich nicht
 * überschneiden (10:30–14:30 und 18:00–22:00), teilen sich eine Zeile. Das
 * halbiert an vollen Tagen fast die Höhe. Mindestens 30 min Abstand, damit
 * zwei Balken nicht wie einer aussehen.
 */
export function wochenSpuren(bars: WochenBalken[]): WochenBalken[][] {
  const spuren: WochenBalken[][] = [];
  for (const b of [...bars].sort((x, y) => x.start - y.start || x.end - y.end)) {
    const frei = spuren.find((spur) => spur[spur.length - 1].end + 30 <= b.start);
    if (frei) frei.push(b);
    else spuren.push([b]);
  }
  return spuren;
}

/** Gemeinsamer Zeitbereich der Woche in ganzen Stunden (Minuten). */
export function wochenSpanne(tage: WochenTag[]): { from: number; to: number } {
  const bars = tage.flatMap((t) => t.bars);
  if (bars.length === 0) return { from: 10 * 60, to: 22 * 60 };
  return {
    from: Math.floor(Math.min(...bars.map((b) => b.start)) / 60) * 60,
    to: Math.ceil(Math.max(...bars.map((b) => b.end)) / 60) * 60,
  };
}

/** Schichtart eines Dienstes; CUSTOM wird nach der Anfangszeit eingeordnet. */
function wochenSchichtOf(shift: Shift): WochenSchicht {
  if (shift.shiftType === "EARLY" || shift.shiftType === "MID" || shift.shiftType === "LATE") return shift.shiftType;
  return shift.startMinutes < 11 * 60 ? "EARLY" : shift.startMinutes < 14 * 60 ? "MID" : "LATE";
}

/** Daten des Wochenplans – gemeinsam für PDF und Druckansicht. */
export function wochenplanFor(schedule: Schedule, dates: string[]): WochenTag[] {
  // Gleiche Namen (zwei Personen, die gleich heissen) bekommen eine Nummer –
  // sonst stünde derselbe Name zweimal in einer Zelle und sähe wie ein Fehler aus.
  const seen = new Map<string, number>();
  const names = new Map(
    schedule.employees.map((e) => {
      const n = (seen.get(e.name) ?? 0) + 1;
      seen.set(e.name, n);
      return [e.id, n > 1 ? `${e.name} (${n})` : e.name] as const;
    }),
  );
  const holidays = nrwHolidayNames(schedule.year);
  const closedByDate = new Map(schedule.dateOverrides.filter((o) => o.closed).map((o) => [o.date, o] as const));
  return dates.map((date) => {
    const onDay = schedule.shifts
      .filter((s) => s.date === date && names.has(s.employeeId))
      .sort((a, b) => a.startMinutes - b.startMinutes || names.get(a.employeeId)!.localeCompare(names.get(b.employeeId)!));
    const cells: Record<WochenSchicht, WochenGruppe[]> = { EARLY: [], MID: [], LATE: [] };
    for (const s of onDay) {
      const time = `${minutesToTime(s.startMinutes)}–${minutesToTime(s.endMinutes)}`;
      const list = cells[wochenSchichtOf(s)];
      const gruppe = list.find((g) => g.time === time);
      if (gruppe) gruppe.names.push(names.get(s.employeeId)!);
      else list.push({ time, names: [names.get(s.employeeId)!] });
    }
    const closed = closedByDate.get(date);
    const holiday = holidays.get(date);
    const d = parseIsoDate(date);
    return {
      date,
      head: `${WEEKDAY_LABELS_DE[weekdayKeyOf(d)]} ${format(d, "dd.MM.")}`,
      note: closed ? closed.note || "geschlossen" : holiday ?? "",
      closed: Boolean(closed) && onDay.length === 0,
      cells,
      people: new Set(onDay.map((s) => s.employeeId)).size,
      bars: onDay.map((s) => ({
        name: names.get(s.employeeId)!,
        start: s.startMinutes,
        end: s.endMinutes,
        pause: s.pauseMinutes,
        schicht: wochenSchichtOf(s),
      })),
    };
  });
}

/** Farbe je Schicht (Balken) – hell genug, dass schwarzer Text lesbar bleibt. */
export const WOCHEN_FARBEN: Record<WochenSchicht, { fill: [number, number, number]; edge: [number, number, number] }> = {
  EARLY: { fill: [254, 243, 199], edge: [217, 119, 6] }, // amber
  MID: { fill: [224, 242, 254], edge: [2, 132, 199] }, // sky
  LATE: { fill: [224, 231, 255], edge: [79, 70, 229] }, // indigo
};

/**
 * Wochen-Dienstplan als PDF: A4 hoch, ZEITLEISTE (hochkant passen doppelt so
 * viele Zeilen auf die Seite – in Natsu überlappen fast alle Dienste). Je Tag ein Block, je Dienst
 * ein Balken von Beginn bis Ende, Name und Uhrzeit im Balken. Die Achse
 * (Stunden) steht oben auf jeder Seite; passt ein Tag nicht mehr auf die
 * Seite, beginnt er auf der nächsten – ein Tag wird nie geteilt.
 */
export function buildWochenplanPdf(schedule: Schedule, weeks: WocheZumDruck[]): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  weeks.forEach((w, i) => {
    if (i > 0) doc.addPage();
    drawWochenplan(doc, schedule, w.dates, w.label);
  });
  return doc;
}

/** Eine Woche zum Drucken: Tage (nur im Monat) und Titel oben rechts. */
export type WocheZumDruck = { dates: string[]; label: string };

function drawWochenplan(doc: jsPDF, schedule: Schedule, dates: string[], periodLabel: string): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const tage = wochenplanFor(schedule, dates);
  const { from, to } = wochenSpanne(tage);

  const left = MARGIN;
  const right = pageW - MARGIN;
  const dayW = 28;
  const axisL = left + dayW;
  const axisR = right;
  const xOf = (minute: number) => axisL + ((minute - from) / (to - from)) * (axisR - axisL);
  const BAR = 4; // Balkenhöhe
  const GAP = 0.6;
  const DAY_PAD = 2.2;
  const bottomLimit = pageH - MARGIN - 4;

  /** Kopf + Stundenachse; gibt das Y unter der Achse zurück. */
  const pageTop = (first: boolean): number => {
    const y0 = drawHeader(doc, "Dienstplan", schedule, first ? periodLabel : `${periodLabel} (Forts.)`);
    // Legende rechts oben unter dem Kopf
    let lx = right;
    for (const s of [...WOCHEN_SCHICHTEN].reverse()) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      const w = doc.getTextWidth(T(s.label));
      lx -= w;
      doc.setTextColor(...LINE);
      doc.text(T(s.label), lx, y0 + 1);
      lx -= 4.2;
      doc.setFillColor(...WOCHEN_FARBEN[s.key].fill);
      doc.setDrawColor(...WOCHEN_FARBEN[s.key].edge);
      doc.setLineWidth(0.3);
      doc.rect(lx, y0 - 1.6, 3.2, 2.4, "FD");
      lx -= 4;
    }
    const y = y0 + 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    for (let m = from; m <= to; m += 60) {
      doc.text(minutesToTime(m), xOf(m), y, { align: m === to ? "right" : m === from ? "left" : "center" });
    }
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.4);
    doc.line(left, y + 1.5, right, y + 1.5);
    return y + 1.5;
  };

  /** Senkrechte Stundenlinien im Bereich y0..y1 (hinter den Balken). */
  const hourLines = (y0: number, y1: number) => {
    doc.setDrawColor(...DIVIDER);
    doc.setLineWidth(0.15);
    for (let m = from; m <= to; m += 60) doc.line(xOf(m), y0, xOf(m), y1);
  };

  let y = pageTop(true);
  tage.forEach((t) => {
    const spuren = wochenSpuren(t.bars);
    const rows = Math.max(1, spuren.length);
    const h = DAY_PAD * 2 + rows * BAR + (rows - 1) * GAP;
    if (y + h > bottomLimit) {
      doc.addPage();
      y = pageTop(false);
    }
    if (t.closed) {
      doc.setFillColor(...SHADE_FILL);
      doc.rect(left, y, right - left, h, "F");
    }
    hourLines(y, y + h);

    // Tag links
    const [wd, dm] = t.head.split(" ");
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(T(wd), left + 1, y + DAY_PAD + 3.4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`${T(dm)}  ·  ${t.people} Pers.`, left + 1, y + DAY_PAD + 7);
    if (t.note) doc.text(T(t.note), left + 1, y + DAY_PAD + 10.2, { maxWidth: dayW - 2 });

    if (t.bars.length === 0) {
      doc.setTextColor(...MUTED);
      doc.setFontSize(8);
      doc.text(t.closed ? "geschlossen" : "kein Dienst", axisL + 2, y + DAY_PAD + 3.4);
    }
    spuren.forEach((spur, k) => spur.forEach((b) => {
      const by = y + DAY_PAD + k * (BAR + GAP);
      const x0 = xOf(b.start);
      const x1 = xOf(b.end);
      const farbe = WOCHEN_FARBEN[b.schicht];
      doc.setFillColor(...farbe.fill);
      doc.rect(x0, by, x1 - x0, BAR, "F");
      doc.setFillColor(...farbe.edge);
      doc.rect(x0, by, 0.9, BAR, "F");
      const zeit = `${minutesToTime(b.start)}–${minutesToTime(b.end)}${b.pause ? `  P${b.pause}` : ""}`;
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      const nameW = doc.getTextWidth(T(b.name));
      doc.setFont("helvetica", "normal");
      const zeitW = doc.getTextWidth(T(zeit));
      const innen = x1 - x0 - 3;
      if (nameW + zeitW + 3 <= innen) {
        doc.setFont("helvetica", "bold");
        doc.text(T(b.name), x0 + 2, by + BAR * 0.72);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...LINE);
        doc.text(T(zeit), x1 - 1.2, by + BAR * 0.72, { align: "right" });
      } else {
        // Kurzer Balken: Name im Balken (gekürzt), Uhrzeit rechts daneben.
        doc.setFont("helvetica", "bold");
        doc.text(doc.splitTextToSize(T(b.name), Math.max(4, innen))[0] as string, x0 + 2, by + BAR * 0.72);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...LINE);
        const aussen = x1 + 1.2 + zeitW <= axisR;
        doc.text(T(zeit), aussen ? x1 + 1.2 : x0 - 1.2, by + BAR * 0.72, { align: aussen ? "left" : "right" });
      }
    }));

    y += h;
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.3);
    doc.line(left, y, right, y);
  });
}

// ── Wochen-Dienstplan als TABELLE (Person × Tag) ────────────────────────────
// Die klassische Form zum Aushängen: je Person eine Zeile, je Tag eine Spalte,
// in der Zelle die Uhrzeit(en). Rechts die bezahlten Stunden der Woche.

export type RasterZeile = {
  name: string;
  typ: string;
  /** Je Tag die Dienste als „10:30–17:30" (geteilter Tag = zwei Einträge). */
  cells: string[][];
  /** Bezahlte Minuten in dieser Woche. */
  paidMinutes: number;
};

export type WochenRaster = {
  /** Kopf je Tag: „Mo" und „05.10.". */
  days: Array<{ date: string; wd: string; dm: string; note: string }>;
  rows: RasterZeile[];
  /** Personen je Tag. */
  people: number[];
};

const TYP_KURZ: Record<Employee["employmentType"], string> = {
  VOLLZEIT: "VZ",
  TEILZEIT: "TZ",
  AZUBI: "Azubi",
};
const TYP_ORDER: Employee["employmentType"][] = ["VOLLZEIT", "TEILZEIT", "AZUBI"];

/** Daten der Wochentabelle – gemeinsam für PDF und Druckansicht. */
export function wochenRasterFor(schedule: Schedule, dates: string[]): WochenRaster {
  const holidays = nrwHolidayNames(schedule.year);
  const closedByDate = new Map(schedule.dateOverrides.filter((o) => o.closed).map((o) => [o.date, o] as const));
  const inWeek = new Set(dates);
  const shifts = schedule.shifts.filter((s) => inWeek.has(s.date));
  const first = dates[0] ?? "";
  const last = dates[dates.length - 1] ?? "";

  const days = dates.map((date) => {
    const d = parseIsoDate(date);
    const closed = closedByDate.get(date);
    return {
      date,
      wd: WEEKDAY_LABELS_DE[weekdayKeyOf(d)].slice(0, 2),
      dm: format(d, "dd.MM."),
      note: closed ? closed.note || "geschlossen" : holidays.get(date) ?? "",
    };
  });

  // Wer in dieser Woche beschäftigt ist oder Dienste hat, steht in der Tabelle.
  const employees = schedule.employees
    .filter(
      (e) =>
        shifts.some((s) => s.employeeId === e.id) ||
        ((!e.startDate || e.startDate <= last) && (!e.endDate || e.endDate >= first)),
    )
    .sort(
      (a, b) =>
        TYP_ORDER.indexOf(a.employmentType) - TYP_ORDER.indexOf(b.employmentType) ||
        a.name.localeCompare(b.name),
    );

  const rows = employees.map((e) => {
    const own = shifts.filter((s) => s.employeeId === e.id);
    return {
      name: e.name,
      typ: TYP_KURZ[e.employmentType],
      cells: dates.map((date) =>
        own
          .filter((s) => s.date === date)
          .sort((a, b) => a.startMinutes - b.startMinutes)
          .map((s) => `${minutesToTime(s.startMinutes)}–${minutesToTime(s.endMinutes)}`),
      ),
      paidMinutes: own.reduce((sum, s) => sum + s.paidMinutes, 0),
    };
  });

  const people = dates.map((date) => new Set(shifts.filter((s) => s.date === date).map((s) => s.employeeId)).size);
  return { days, rows, people };
}

/** Wochentabelle(n) als PDF: A4 quer, je Woche eine Seite (bei Bedarf mehr). */
export function buildWochenRasterPdf(schedule: Schedule, weeks: WocheZumDruck[]): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
  weeks.forEach((w, i) => {
    if (i > 0) doc.addPage();
    drawWochenRaster(doc, schedule, w.dates, w.label);
  });
  return doc;
}

function drawWochenRaster(doc: jsPDF, schedule: Schedule, dates: string[], periodLabel: string): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const raster = wochenRasterFor(schedule, dates);
  const left = MARGIN;
  const right = pageW - MARGIN;
  const nameW = 52;
  const typW = 12;
  const sumW = 18;
  // Die Tabelle füllt immer die ganze Breite – auch kurze Wochen am Monatsrand.
  const dayW = (right - left - nameW - typW - sumW) / Math.max(1, dates.length);
  const tableR = right;
  const xDay = (i: number) => left + nameW + typW + i * dayW;
  const bottomLimit = pageH - MARGIN;

  const head = (first: boolean): number => {
    let y = drawHeader(doc, "Dienstplan", schedule, first ? periodLabel : `${periodLabel} (Forts.)`);
    const h = raster.days.some((d) => d.note) ? 11 : 8;
    doc.setFillColor(...HEAD_FILL);
    doc.rect(left, y, tableR - left, h, "F");
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Name", left + 1.5, y + 5);
    doc.text("Art", left + nameW + 1.5, y + 5);
    doc.text("Std.", tableR - 1.5, y + 5, { align: "right" });
    raster.days.forEach((d, i) => {
      const cx = xDay(i) + dayW / 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...INK);
      doc.text(`${d.wd} ${d.dm}`, cx, y + 5, { align: "center" });
      if (d.note) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(180, 83, 9); // amber-700
        doc.text(doc.splitTextToSize(T(d.note), dayW - 2)[0] as string, cx, y + 8.8, { align: "center" });
      }
    });
    y += h;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.4);
    doc.line(left, y, tableR, y);
    return y;
  };

  const vLines = (y0: number, y1: number) => {
    doc.setDrawColor(...DIVIDER);
    doc.setLineWidth(0.2);
    for (let i = 0; i <= dates.length; i++) doc.line(xDay(i), y0, xDay(i), y1);
    doc.line(left + nameW, y0, left + nameW, y1);
  };

  let y = head(true);
  let pageTop = y;
  // Eine Woche soll auf EINE Seite passen: Zeilen bei Bedarf enger setzen
  // (bis 2,9 mm je Textzeile). Reicht das nicht, geht es auf Seite 2 weiter.
  const totalLines = raster.rows.reduce((sum, r) => sum + Math.max(1, ...r.cells.map((c) => c.length)), 0);
  const avail = bottomLimit - 8 - y;
  let PAD = 2.4;
  let LINE_H = 3.6;
  if (raster.rows.length * PAD + totalLines * LINE_H > avail) {
    PAD = 1.4;
    LINE_H = Math.min(3.6, Math.max(2.9, (avail - raster.rows.length * PAD) / Math.max(1, totalLines)));
  }
  const FONT = LINE_H < 3.3 ? 7.5 : 8.5;
  const frame = (y1: number) => {
    vLines(pageTop, y1);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.4);
    doc.rect(left, pageTop, tableR - left, y1 - pageTop);
  };
  raster.rows.forEach((r, idx) => {
    const lines = Math.max(1, ...r.cells.map((c) => c.length));
    const h = PAD + lines * LINE_H;
    if (y + h > bottomLimit - 8) {
      frame(y);
      doc.addPage();
      y = head(false);
      pageTop = y;
    }
    if (idx % 2 === 1) {
      doc.setFillColor(...SHADE_FILL);
      doc.rect(left, y, tableR - left, h, "F");
    }
    const baseY = y + PAD / 2 + LINE_H * 0.8;
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT);
    doc.text(doc.splitTextToSize(T(r.name), nameW - 3)[0] as string, left + 1.5, baseY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...LINE);
    doc.text(r.typ, left + nameW + 1.5, baseY);
    r.cells.forEach((cell, i) => {
      const cx = xDay(i) + dayW / 2;
      if (cell.length === 0) {
        doc.setTextColor(...DIVIDER);
        doc.text("-", cx, baseY, { align: "center" });
        return;
      }
      doc.setTextColor(...INK);
      cell.forEach((t, k) => doc.text(T(t), cx, baseY + k * LINE_H, { align: "center" }));
    });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(minutesToDecimalHours(r.paidMinutes), tableR - 1.5, baseY, { align: "right" });
    y += h;
    // Trennlinie, dicker beim Wechsel der Beschäftigungsart.
    const next = raster.rows[idx + 1];
    doc.setDrawColor(...(next && next.typ !== r.typ ? LINE : DIVIDER));
    doc.setLineWidth(next && next.typ !== r.typ ? 0.35 : 0.15);
    doc.line(left, y, tableR, y);
  });

  // Fußzeile: Personen je Tag.
  doc.setFillColor(...HEAD_FILL);
  doc.rect(left, y, tableR - left, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...LINE);
  doc.text("Personen", left + 1.5, y + 4.2);
  raster.people.forEach((n, i) => doc.text(String(n), xDay(i) + dayW / 2, y + 4.2, { align: "center" }));
  frame(y + 6);
}

// ── Datei ausliefern ─────────────────────────────────────────────────────────

/**
 * PDF-Blob direkt als Datei herunterladen. MIME application/octet-stream +
 * .pdf-Name => auch iOS Safari / In-App-Browser speichern die Datei, statt sie
 * in einen neuen Tab zu öffnen und dort hängen zu bleiben.
 */
export function deliver(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const octet = new Blob([blob], { type: "application/octet-stream" });
  const url = URL.createObjectURL(octet);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (document.body.contains(a)) document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** jsPDF-Dokument als Datei speichern. */
export function savePdf(doc: jsPDF, filename: string): void {
  deliver(doc.output("blob"), filename);
}

/** Alter Name des Downloads – bleibt als Alias erhalten. */
export const downloadPdfBlob = deliver;
