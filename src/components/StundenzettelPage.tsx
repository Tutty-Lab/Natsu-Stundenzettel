import type { Employee, Schedule, Shift } from "../types";
import {
  datesOfMonth,
  parseIsoDate,
  WEEKDAY_LABELS_DE,
  weekdayKeyOf,
} from "../lib/demand";
import { minutesToDecimalHours, minutesToTime } from "../lib/time";
import { signedHours } from "../lib/dateFormat";
import { MONTH_NAMES_DE } from "../lib/dateFormat";
import { nrwHolidayNames } from "../lib/holidays";
import { azubiConfigOf, isAzubiSchoolDate } from "../lib/azubi";
import { format } from "date-fns";

// Deutscher Monats-Titel für das offizielle Dokument.
function monthLabelDe(year: number, month: number): string {
  return `${MONTH_NAMES_DE[month - 1]} ${year}`;
}

function employmentLabelDe(employee: Employee): string {
  if (employee.employmentType === "VOLLZEIT") return "Vollzeit";
  if (employee.employmentType === "TEILZEIT") return "Teilzeit";
  return azubiConfigOf(employee.azubi).inSchoolTerm
    ? "Ausbildung - Schule/Arbeit"
    : "Ausbildung - Arbeit";
}

/**
 * Ein A4-freundlicher Stundenzettel für einen Mitarbeiter.
 * Wird sowohl für die Bildschirm-Vorschau als auch für den Druck verwendet.
 */
export function StundenzettelPage({
  schedule,
  employee,
  dates,
  periodLabel,
}: {
  schedule: Schedule;
  employee: Employee;
  /** Nur diese Tage zeigen (Wochen-Stundenzettel); fehlend => ganzer Monat. */
  dates?: string[];
  /** Zeitraum-Text oben rechts; fehlend => Monat/Jahr. */
  periodLabel?: string;
}) {
  const rows = dates ?? datesOfMonth(schedule.year, schedule.month);
  const byDate = new Map<string, Shift>();
  for (const s of schedule.shifts) {
    if (s.employeeId === employee.id) byDate.set(s.date, s);
  }

  const totalMinutes = rows.reduce((a, d) => a + (byDate.get(d)?.paidMinutes ?? 0), 0);
  const diff = totalMinutes - employee.targetMinutes;
  const holidayNames = nrwHolidayNames(schedule.year);
  const closedByDate = new Map(
    schedule.dateOverrides.filter((o) => o.closed).map((o) => [o.date, o] as const),
  );

  return (
    <div className="stundenzettel-page mx-auto w-[210mm] max-w-[210mm] bg-white p-[14mm] text-[12px] text-slate-900">
      <div className="mb-3 flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">Stundenaufzeichnung</h2>
          <p className="break-words text-slate-600">{schedule.companyName || "—"}</p>
          {schedule.address && (
            <p className="break-words text-[11px] text-slate-500">{schedule.address}</p>
          )}
        </div>
        <div className="shrink-0 text-right text-slate-600">
          <div>{periodLabel ?? monthLabelDe(schedule.year, schedule.month)}</div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1">
        <Info label="Firmenname" value={schedule.companyName || "—"} />
        <Info
          label="Beschäftigungsart"
          value={employmentLabelDe(employee)}
        />
        <Info label="Mitarbeiter" value={employee.name} />
        <Info label="Monat" value={MONTH_NAMES_DE[schedule.month - 1]} />
        <Info
          label="Sollstunden"
          value={dates ? "—" : `${minutesToDecimalHours(employee.targetMinutes)} h`}
        />
        <Info label="Jahr" value={String(schedule.year)} />
      </div>

      <table className="w-full table-fixed border-collapse text-[10.5px] leading-tight">
        <colgroup>
          <col className="w-[16%]" />
          <col className="w-[15%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[9%]" />
          <col className="w-[12%]" />
          <col className="w-[20%]" />
        </colgroup>
        <thead>
          <tr className="bg-slate-100">
            <Th>Datum</Th>
            <Th>Wochentag</Th>
            <Th>Arbeitsbeginn</Th>
            <Th>Arbeitsende</Th>
            <Th>Pause</Th>
            <Th>Arbeitszeit</Th>
            <Th className="text-left">Bemerkung</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const s = byDate.get(d);
            const wd = WEEKDAY_LABELS_DE[weekdayKeyOf(parseIsoDate(d))];
            const holiday = holidayNames.get(d);
            const closed = closedByDate.get(d);
            const isWeekend = wd === "Samstag" || wd === "Sonntag";
            const isSchoolDay =
              employee.employmentType === "AZUBI" &&
              isAzubiSchoolDate(employee.azubi, d);
            let bemerkung: string;
            if (s) {
              bemerkung = holiday ? `Feiertag: ${holiday}` : "";
            } else if (closed) {
              bemerkung = closed.note || "Betriebsruhe";
            } else if (holiday) {
              bemerkung = `Frei (Feiertag: ${holiday})`;
            } else if (isSchoolDay) {
              bemerkung = "Berufsschule";
            } else {
              bemerkung = "Frei";
            }
            return (
              <tr key={d} className={isWeekend || holiday || closed ? "bg-slate-50" : ""}>
                <Td className="whitespace-nowrap">{format(parseIsoDate(d), "dd.MM.yyyy")}</Td>
                <Td className="whitespace-nowrap">{wd}</Td>
                <Td className="whitespace-nowrap text-center">
                  {s ? minutesToTime(s.startMinutes) : ""}
                </Td>
                <Td className="whitespace-nowrap text-center">
                  {s ? minutesToTime(s.endMinutes) : ""}
                </Td>
                <Td className="whitespace-nowrap text-center">
                  {s && s.pauseMinutes > 0 ? `${s.pauseMinutes} Min` : ""}
                </Td>
                <Td className="whitespace-nowrap text-center">
                  {s ? minutesToDecimalHours(s.paidMinutes) : "0,00"}
                </Td>
                <Td className="break-words text-left text-slate-500">{bemerkung}</Td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-semibold bg-slate-100">
            <Td className="text-left" colSpan={5}>
              Gesamtstunden
            </Td>
            <Td className="text-center">{minutesToDecimalHours(totalMinutes)}</Td>
            <Td />
          </tr>
        </tfoot>
      </table>

      <div className="mt-3 grid grid-cols-3 gap-4 text-[12px] break-inside-avoid">
        <div>
          <div className="text-slate-500">Gesamtstunden</div>
          <div className="font-semibold">{minutesToDecimalHours(totalMinutes)} h</div>
        </div>
        <div>
          <div className="text-slate-500">Sollstunden</div>
          {dates ? (
            <div className="font-semibold text-slate-400">—</div>
          ) : (
            <div className="font-semibold">{minutesToDecimalHours(employee.targetMinutes)} h</div>
          )}
        </div>
        <div>
          <div className="text-slate-500">Differenz</div>
          {dates ? (
            <div className="font-semibold text-slate-400">—</div>
          ) : (
            <div className={`font-semibold ${diff === 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {signedHours(diff)} h
            </div>
          )}
        </div>
      </div>

      <div className="mt-7 grid grid-cols-3 gap-8 text-[11px] break-inside-avoid">
        <Signature label="Unterschrift Mitarbeiter" />
        <Signature label="Unterschrift Arbeitgeber" />
        <Signature label="Datum" />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <span className="min-w-[105px] shrink-0 text-slate-500">{label}:</span>
      <span className="min-w-0 break-words font-medium">{value}</span>
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`break-words border border-slate-300 px-1 py-1 text-center font-semibold ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`border border-slate-300 px-1.5 py-[2px] ${className}`}>
      {children}
    </td>
  );
}

function Signature({ label }: { label: string }) {
  return (
    <div>
      <div className="mt-7 border-t border-slate-500 pt-1 text-slate-600">{label}</div>
    </div>
  );
}
