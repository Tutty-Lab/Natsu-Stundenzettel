import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AzubiTab } from "../../components/AzubiTab";
import { StundenzettelPage } from "../../components/StundenzettelPage";
import { StundenzettelTab } from "../../components/StundenzettelTab";
import type { UseScheduleReturn } from "../../hooks/useSchedule";
import type { AzubiConfig, Employee, Schedule } from "../../types";
import { withAutomaticAzubiTarget } from "../azubi";
import { DEFAULT_WORK_HOURS } from "../workHours";

function renderAzubi(azubi: AzubiConfig): string {
  const employee: Employee = withAutomaticAzubiTarget({
    id: "AZ-PRINT",
    name: "Azubi Test",
    employmentType: "AZUBI",
    targetMinutes: 0,
    azubi,
  });
  const schedule: Schedule = {
    companyName: "NATSU Test",
    address: "Teststrasse 1",
    year: 2026,
    month: 8,
    workHours: DEFAULT_WORK_HOURS,
    dateOverrides: [],
    employees: [employee],
    shifts: [],
  };

  return renderToStaticMarkup(
    createElement(StundenzettelPage, { schedule, employee }),
  );
}

describe("Stundenaufzeichnung fuer Natsu/Nava Azubi", () => {
  it("prints school and work during the school term", () => {
    const html = renderAzubi({
      inSchoolTerm: true,
      schoolDays: ["monday", "wednesday"],
    });

    expect(html).toContain("Ausbildung - Schule/Arbeit");
    expect(html.match(/Berufsschule/g)).toHaveLength(9);
    expect(html).not.toContain("Ausbildung - kein Einsatz");
  });

  it("prints work only outside the school term", () => {
    const html = renderAzubi({
      inSchoolTerm: false,
      schoolDays: ["monday", "wednesday"],
    });

    expect(html).toContain("Ausbildung - Arbeit");
    expect(html).not.toContain("Berufsschule");
    expect(html).not.toContain("Ausbildung - kein Einsatz");
  });

  it("keeps the A4 table compact and hides empty pause labels", () => {
    const employee: Employee = {
      id: "TZ-PRINT",
      name: "Teilzeit Print",
      employmentType: "TEILZEIT",
      targetMinutes: 4 * 60,
    };
    const schedule: Schedule = {
      companyName: "NATSU Vietnamese and Japanese cuisine",
      address: "Berliner Str. 61, 33330 Guetersloh",
      year: 2026,
      month: 8,
      workHours: DEFAULT_WORK_HOURS,
      dateOverrides: [],
      employees: [employee],
      shifts: [
        {
          id: "MID-1",
          employeeId: employee.id,
          date: "2026-08-03",
          startMinutes: 15 * 60 + 30,
          endMinutes: 19 * 60 + 30,
          pauseMinutes: 0,
          paidMinutes: 4 * 60,
          shiftType: "MID",
          generated: true,
        },
      ],
    };

    const html = renderToStaticMarkup(
      createElement(StundenzettelPage, { schedule, employee }),
    );

    expect(html).toContain("w-[210mm]");
    expect(html).toContain("table-fixed");
    expect(html).toContain("<colgroup>");
    expect(html).toContain("15:30");
    expect(html).not.toContain("0 Min");
  });
});

describe("Natsu/Nava Azubi settings", () => {
  it("shows an editable weekly-hours input and warns above the term limit", () => {
    const employee: Employee = withAutomaticAzubiTarget({
      id: "AZ-SETTINGS",
      name: "Azubi Settings",
      employmentType: "AZUBI",
      targetMinutes: 0,
      azubi: {
        inSchoolTerm: true,
        schoolDays: ["monday", "tuesday"],
        weeklyHoursInTerm: 25,
        weeklyHoursOutOfTerm: 35,
      },
    });
    const schedule: Schedule = {
      companyName: "NATSU Test",
      address: "Teststrasse 1",
      year: 2026,
      month: 8,
      workHours: DEFAULT_WORK_HOURS,
      dateOverrides: [],
      employees: [employee],
      shifts: [],
    };
    const store = {
      schedule,
      updateEmployee: () => undefined,
    } as unknown as UseScheduleReturn;

    const html = renderToStaticMarkup(createElement(AzubiTab, { store }));

    expect(html).toContain("Giờ làm mỗi tuần");
    expect(html).toContain('value="25"');
    expect(html).toContain("Tối đa 24h/tuần");
    expect(html).toContain("Đang vượt mức tối đa 24h/tuần");
  });
});

describe("Natsu/Nava timesheet actions", () => {
  it("bietet Drucken und PDF je Auswahl an, ohne CSV", () => {
    const employee: Employee = withAutomaticAzubiTarget({
      id: "AZ-ACTIONS",
      name: "Azubi Actions",
      employmentType: "AZUBI",
      targetMinutes: 0,
      azubi: {
        inSchoolTerm: true,
        schoolDays: ["monday", "tuesday"],
      },
    });
    const schedule: Schedule = {
      companyName: "NATSU Test",
      address: "Teststrasse 1",
      year: 2026,
      month: 8,
      workHours: DEFAULT_WORK_HOURS,
      dateOverrides: [],
      employees: [employee],
      shifts: [],
    };
    const store = { schedule } as unknown as UseScheduleReturn;

    const html = renderToStaticMarkup(createElement(StundenzettelTab, { store }));

    // Seit der Umstellung auf die Auswahl „Cho ai/Nội dung" gibt es je einen
    // Knopf; wer gemeint ist, steht im Auswahlfeld darüber.
    expect(html).toContain("Xuất PDF");
    expect(html).toContain("In");
    expect(html).toContain("Tất cả (cả quán)");
    expect(html).not.toContain("CSV");
  });
});
