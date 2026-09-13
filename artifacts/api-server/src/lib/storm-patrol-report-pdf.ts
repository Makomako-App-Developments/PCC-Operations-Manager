import path from "node:path";

const NAVY = "#103746";
const TEAL = "#00AECD";
const PALE_TEAL = "#E8F7F8";
const INK = "#17313B";
const MUTED = "#64757C";
const LINE = "#D8E3E6";
const ROW_ALT = "#F5F9FA";
const WHITE = "#FFFFFF";

const LOGO_PATH = process.cwd().endsWith("api-server")
  ? path.resolve("src/assets/porirua-city-logo.png")
  : path.resolve("artifacts/api-server/src/assets/porirua-city-logo.png");

type ReportDetails = {
  event: {
    name: string;
    status: string;
    activatedAt?: Date | string | null;
    closedAt?: Date | string | null;
    hourlyRateCents: number;
  };
  jobs: Array<any>;
  observations: Array<any>;
  alerts: Array<any>;
  summary: {
    selectedCount: number;
    checkedCount: number;
    actualMinutes: number;
    labourChargeCents: number;
    tooDangerousCount: number;
  };
};

const phaseLabels: Record<string, string> = {
  pre: "Pre-Storm Preparation",
  mid: "Mid-Storm Response",
  post: "Post-Storm Recovery",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  issued: "Issued",
  in_progress: "In progress",
  completed: "Completed",
  too_dangerous: "Too dangerous",
  cancelled: "Cancelled",
};

function formatDate(value: Date | string | null | undefined, includeTime = false) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Pacific/Auckland",
  });
}

function safeText(value: unknown, fallback = "—") {
  const text = value == null ? "" : String(value).trim();
  return text || fallback;
}

function humanize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

export async function writeStormPatrolPdf(doc: any, details: ReportDetails) {
  const { event, jobs, observations, alerts, summary } = details;
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 42;

  function drawPageHeader(firstPage = false) {
    if (firstPage) {
      doc.rect(0, 0, pageWidth, 112).fill(NAVY);
      try {
        doc.image(LOGO_PATH, pageWidth - 170, 22, { fit: [134, 70], align: "right", valign: "center" });
      } catch {
        doc.font("Helvetica-Bold").fontSize(12).fillColor(WHITE)
          .text("PORIRUA CITY COUNCIL", pageWidth - 210, 42, { width: 174, align: "right" });
      }
      doc.font("Helvetica-Bold").fontSize(24).fillColor(WHITE).text("Storm Patrol Report", margin, 27);
      doc.font("Helvetica").fontSize(12).fillColor("#A9D8DD").text(event.name, margin, 62, { width: 520 });
      doc.fontSize(8).fillColor("#87B8BE").text("GARDENS MANAGER  /  OPERATIONAL EVENT RECORD", margin, 86);
      doc.y = 132;
      return;
    }
    doc.rect(0, 0, pageWidth, 34).fill(NAVY);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE).text("STORM PATROL", margin, 12);
    doc.font("Helvetica").fontSize(8).fillColor("#B7D7DA").text(event.name, margin + 92, 12);
    doc.y = 49;
  }

  function addPage() {
    doc.addPage();
    drawPageHeader(false);
  }

  function ensureSpace(height: number) {
    if (doc.y + height > bottomLimit) addPage();
  }

  function sectionTitle(title: string, subtitle?: string) {
    ensureSpace(subtitle ? 48 : 34);
    const y = doc.y;
    doc.rect(margin, y, 4, subtitle ? 34 : 22).fill(TEAL);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(title, margin + 13, y + 1);
    if (subtitle) doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(subtitle, margin + 13, y + 19);
    doc.y = y + (subtitle ? 43 : 31);
  }

  function summaryCard(x: number, y: number, width: number, label: string, value: string, accent = TEAL) {
    doc.roundedRect(x, y, width, 56, 5).fillAndStroke(WHITE, LINE);
    doc.rect(x, y, 4, 56).fill(accent);
    doc.font("Helvetica-Bold").fontSize(17).fillColor(INK).text(value, x + 14, y + 10, { width: width - 22 });
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x + 14, y + 35, { width: width - 22 });
  }

  function tableHeader(columns: Array<{ label: string; width: number }>) {
    const y = doc.y;
    doc.rect(margin, y, contentWidth, 23).fill(NAVY);
    let x = margin;
    for (const column of columns) {
      doc.font("Helvetica-Bold").fontSize(7).fillColor(WHITE)
        .text(column.label.toUpperCase(), x + 6, y + 8, { width: column.width - 12 });
      x += column.width;
    }
    doc.y = y + 23;
  }

  function tableRow(
    values: string[],
    columns: Array<{ label: string; width: number }>,
    index: number,
    options: { minHeight?: number } = {},
  ) {
    const heights = values.map((value, columnIndex) =>
      doc.font("Helvetica").fontSize(7.5).heightOfString(value, { width: columns[columnIndex].width - 12 }),
    );
    const height = Math.max(options.minHeight ?? 27, Math.max(...heights) + 12);
    ensureSpace(height + 23);
    const y = doc.y;
    if (index % 2 === 1) doc.rect(margin, y, contentWidth, height).fill(ROW_ALT);
    doc.moveTo(margin, y + height).lineTo(margin + contentWidth, y + height).strokeColor(LINE).lineWidth(0.5).stroke();
    let x = margin;
    values.forEach((value, columnIndex) => {
      doc.font("Helvetica").fontSize(7.5).fillColor(INK)
        .text(value, x + 6, y + 7, { width: columns[columnIndex].width - 12, height: height - 10, ellipsis: true });
      x += columns[columnIndex].width;
    });
    doc.y = y + height;
  }

  drawPageHeader(true);

  const detailsY = doc.y;
  const eventFields = [
    ["EVENT STATUS", statusLabels[event.status] ?? event.status],
    ["ACTIVATED", formatDate(event.activatedAt, true)],
    ["CLOSED", formatDate(event.closedAt, true)],
    ["HOURLY RATE", `$${(event.hourlyRateCents / 100).toFixed(2)} / hr`],
  ];
  const fieldWidth = contentWidth / eventFields.length;
  eventFields.forEach(([label, value], index) => {
    const x = margin + index * fieldWidth;
    doc.font("Helvetica-Bold").fontSize(7).fillColor(MUTED).text(label, x, detailsY);
    doc.font("Helvetica").fontSize(9).fillColor(INK).text(value, x, detailsY + 13, { width: fieldWidth - 12 });
  });
  doc.y = detailsY + 42;

  const cardGap = 9;
  const cardWidth = (contentWidth - cardGap * 4) / 5;
  const cardsY = doc.y;
  const completedPercent = summary.selectedCount > 0
    ? `${Math.round((summary.checkedCount / summary.selectedCount) * 100)}%`
    : "0%";
  [
    ["TOTAL JOBS", String(summary.selectedCount), TEAL],
    ["CHECKED", `${summary.checkedCount}  (${completedPercent})`, "#18A77A"],
    ["ACTUAL TIME", `${summary.actualMinutes} min`, "#6175C1"],
    ["LABOUR CHARGE", `$${(summary.labourChargeCents / 100).toFixed(2)}`, "#C47A24"],
    ["TOO DANGEROUS", String(summary.tooDangerousCount), "#C84F4F"],
  ].forEach(([label, value, accent], index) =>
    summaryCard(margin + index * (cardWidth + cardGap), cardsY, cardWidth, label, value, accent),
  );
  doc.y = cardsY + 75;

  const jobColumns = [
    { label: "Site", width: 152 },
    { label: "Description / Location", width: 145 },
    { label: "Status", width: 70 },
    { label: "Team", width: 82 },
    { label: "Worker", width: 82 },
    { label: "Work completed", width: 184 },
    { label: "Minutes", width: 54 },
  ];

  for (const phase of ["pre", "mid", "post"]) {
    const phaseJobs = jobs.filter(job => job.phase === phase);
    ensureSpace(phaseJobs.length > 0 ? 108 : 70);
    sectionTitle(phaseLabels[phase], `${phaseJobs.length} job${phaseJobs.length === 1 ? "" : "s"}`);
    if (phaseJobs.length === 0) {
      doc.roundedRect(margin, doc.y, contentWidth, 30, 4).fill(PALE_TEAL);
      doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED).text("No jobs were recorded for this phase.", margin + 10, doc.y + 10);
      doc.y += 40;
      continue;
    }
    tableHeader(jobColumns);
    phaseJobs.forEach((job, index) => {
      if (doc.y + 60 > bottomLimit) {
        addPage();
        sectionTitle(phaseLabels[phase], "continued");
        tableHeader(jobColumns);
      }
      tableRow([
        safeText(job.assetName, "Unknown site"),
        [job.assetDescription, job.streetAddress, job.suburb].filter(Boolean).join("\n") || "—",
        statusLabels[job.status] ?? safeText(job.status),
        safeText(job.teamName, "Unassigned"),
        safeText(job.workerName, "Unclaimed"),
        [job.workTypes?.map((workType: string) => humanize(workType)).join(", "), job.comments].filter(Boolean).join("\n") || "No work details recorded",
        job.actualTimeMins == null ? "—" : String(job.actualTimeMins),
      ], jobColumns, index);
    });
    doc.y += 13;
  }

  if (observations.length > 0) {
    const observationColumns = [
      { label: "Recorded", width: 94 },
      { label: "Observed by", width: 105 },
      { label: "Observation", width: 250 },
      { label: "Notes", width: 250 },
      { label: "Photos", width: 70 },
    ];
    ensureSpace(110);
    sectionTitle("New Observations", `${observations.length} field observation${observations.length === 1 ? "" : "s"}`);
    tableHeader(observationColumns);
    observations.forEach((observation, index) => {
      tableRow([
        formatDate(observation.createdAt, true),
        safeText(observation.observerName, "Unknown"),
        safeText(observation.description),
        safeText(observation.notes),
        String(observation.photos?.length ?? 0),
      ], observationColumns, index);
    });
    doc.y += 13;
  }

  if (alerts.length > 0) {
    const alertColumns = [
      { label: "Raised", width: 94 },
      { label: "Site", width: 155 },
      { label: "Urgent issue", width: 260 },
      { label: "Worker / Team", width: 145 },
      { label: "Delivery", width: 115 },
    ];
    ensureSpace(110);
    sectionTitle("Urgent Issues", `${alerts.length} issue${alerts.length === 1 ? "" : "s"} reported`);
    tableHeader(alertColumns);
    alerts.forEach((alert, index) => {
      tableRow([
        formatDate(alert.createdAt, true),
        [alert.assetName, alert.streetAddress, alert.suburb].filter(Boolean).join("\n") || "Unknown site",
        safeText(alert.message),
        [alert.workerName, alert.teamName].filter(Boolean).join("\n") || "Unassigned",
        [
          alert.acknowledgedAt ? "Acknowledged" : "Unacknowledged",
          alert.emailStatus ? `Email: ${alert.emailStatus}` : null,
          alert.photoUrl ? "Photo attached" : null,
        ].filter(Boolean).join("\n"),
      ], alertColumns, index);
    });
  }

  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex++) {
    doc.switchToPage(pageIndex);
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(
        `Generated ${formatDate(new Date(), true)}  •  Porirua City Council Gardens Manager`,
        margin,
        pageHeight - 25,
        { width: contentWidth - 90 },
      );
    doc.font("Helvetica-Bold").fillColor(INK)
      .text(`Page ${pageIndex + 1} of ${range.count}`, pageWidth - margin - 90, pageHeight - 25, { width: 90, align: "right" });
    doc.page.margins.bottom = originalBottomMargin;
  }
}