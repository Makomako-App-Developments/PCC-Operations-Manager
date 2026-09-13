import ExcelJS from "exceljs";

type StormReportEvent = {
  name: string;
  activatedAt?: Date | string | null;
  hourlyRateCents: number;
};

type StormReportJob = {
  id: string;
  phase: string;
  status: string;
  assetName?: string | null;
  teamName?: string | null;
  workerName?: string | null;
  workTypes: string[];
  comments?: string | null;
  actualTimeMins?: number | null;
};

type StormReportSummary = {
  totalMinutes: number;
  totalHours: number;
  labourChargeCents: number;
};

const TEAL = "FF00AECD";
const NAVY = "FF103744";
const PALE_TEAL = "FFE8F7FA";
const PALE_GREY = "FFF3F6F7";
const WHITE = "FFFFFFFF";
const BORDER = "FFD4DEE2";

export function buildStormPatrolWorkbook(
  event: StormReportEvent,
  jobs: StormReportJob[],
  report: StormReportSummary,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PCC Gardens Manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Storm Patrol", {
    views: [{ state: "frozen", ySplit: 10 }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  sheet.mergeCells("A1:K1");
  const title = sheet.getCell("A1");
  title.value = "Storm Patrol Report";
  title.font = { bold: true, size: 18, color: { argb: WHITE } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  title.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 30;

  sheet.getCell("A2").value = "Storm event";
  sheet.getCell("B2").value = event.name;
  sheet.getCell("A3").value = "Hourly labour rate";
  sheet.getCell("B3").value = event.hourlyRateCents / 100;
  sheet.getCell("B3").numFmt = "$#,##0.00";
  if (event.activatedAt) {
    sheet.getCell("D2").value = "Activated";
    sheet.getCell("E2").value = new Date(event.activatedAt);
    sheet.getCell("E2").numFmt = "d mmm yyyy, hh:mm";
  }
  for (const cell of ["A2", "A3", "D2"]) {
    sheet.getCell(cell).font = { bold: true, color: { argb: NAVY } };
  }

  const summaryHeader = sheet.getRow(5);
  summaryHeader.values = ["Report metric", "Value"];
  const summaryRows: Array<[string, number, string]> = [
    ["Actual minutes total", report.totalMinutes, "0"],
    ["Total hours", report.totalHours, "0.00"],
    ["Labour charge", report.labourChargeCents / 100, "$#,##0.00"],
  ];
  summaryRows.forEach(([label, value, format], index) => {
    const row = sheet.getRow(6 + index);
    row.values = [label, value];
    row.getCell(1).font = { bold: true };
    row.getCell(2).numFmt = format;
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? PALE_TEAL : WHITE } };
  });

  const headers = [
    "Job ID",
    "Storm",
    "Phase",
    "Status",
    "Asset",
    "Team",
    "Worker",
    "Work types",
    "Comments",
    "Minutes",
    "Labour charge",
  ];
  const headerRowNumber = 10;
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.values = headers;
  headerRow.height = 22;

  for (const row of [summaryHeader, headerRow]) {
    row.font = { bold: true, color: { argb: WHITE } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    row.alignment = { vertical: "middle" };
  }

  jobs.forEach((job, index) => {
    const minutes = job.actualTimeMins ?? null;
    const row = sheet.addRow([
      job.id,
      event.name,
      job.phase,
      job.status,
      job.assetName ?? "",
      job.teamName ?? "",
      job.workerName ?? "",
      job.workTypes.join("; "),
      job.comments ?? "",
      minutes,
      minutes == null ? null : (minutes * event.hourlyRateCents) / 6000,
    ]);
    row.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: index % 2 === 0 ? WHITE : PALE_GREY },
    };
    row.getCell(10).numFmt = "0";
    row.getCell(11).numFmt = "$#,##0.00";
    row.alignment = { vertical: "top", wrapText: true };
  });

  const lastRow = Math.max(headerRowNumber, sheet.rowCount);
  sheet.autoFilter = { from: "A10", to: `K${lastRow}` };
  sheet.columns = [
    { width: 38 },
    { width: 22 },
    { width: 12 },
    { width: 16 },
    { width: 28 },
    { width: 22 },
    { width: 22 },
    { width: 30 },
    { width: 38 },
    { width: 12 },
    { width: 18 },
  ];

  for (let rowNumber = 5; rowNumber <= lastRow; rowNumber++) {
    if (rowNumber === 9) continue;
    const row = sheet.getRow(rowNumber);
    const finalColumn = rowNumber < headerRowNumber ? 2 : 11;
    for (let column = 1; column <= finalColumn; column++) {
      row.getCell(column).border = {
        top: { style: "thin", color: { argb: BORDER } },
        left: { style: "thin", color: { argb: BORDER } },
        bottom: { style: "thin", color: { argb: BORDER } },
        right: { style: "thin", color: { argb: BORDER } },
      };
    }
  }

  return workbook;
}