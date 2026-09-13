import sharp from "sharp";
import { describe, expect, it } from "vitest";
import PDFDocument from "pdfkit";
import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
}));

vi.mock("./objectStorage", () => ({
  downloadStoredReportPhoto: mocks.download,
}));

import { prepareStormPatrolReportPhoto, writeStormPatrolPdf } from "./storm-patrol-report-pdf";

describe("Storm Patrol report photos", () => {
  it("resizes large images and normalizes them to an embeddable JPEG", async () => {
    const source = await sharp({
      create: {
        width: 4200,
        height: 2800,
        channels: 4,
        background: { r: 0, g: 174, b: 205, alpha: 0.5 },
      },
    }).png().toBuffer();

    const result = await prepareStormPatrolReportPhoto(source);
    const metadata = await sharp(result).metadata();

    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(1400);
    expect(metadata.height).toBeLessThanOrEqual(1000);
    expect(result.byteLength).toBeLessThan(source.byteLength);
  });

  it("rejects unreadable image bytes so the appendix can render a placeholder", async () => {
    await expect(prepareStormPatrolReportPhoto(Buffer.from("not an image"))).rejects.toThrow();
  });

  it("finishes a photo PDF when one stored image is corrupt", async () => {
    const validPhoto = await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 3,
        background: { r: 0, g: 174, b: 205 },
      },
    }).jpeg().toBuffer();
    mocks.download.mockImplementation(async (url: string) => {
      if (url.endsWith("corrupt")) return Buffer.from("not an image");
      return validPhoto;
    });
    const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(Buffer.from(chunk)));
    const ended = new Promise<void>((resolve, reject) => {
      doc.on("end", resolve);
      doc.on("error", reject);
    });

    await writeStormPatrolPdf(doc, {
      event: { name: "Cyclone Test", status: "closed", hourlyRateCents: 10000 },
      jobs: [{
        id: "job-1",
        phase: "post",
        status: "completed",
        assetName: "Cannons Creek drain",
        photos: [
          { blobUrl: "/api/uploads/uploads/storm-patrol/valid", purpose: "before" },
          { blobUrl: "/api/uploads/uploads/storm-patrol/corrupt", purpose: "after" },
        ],
      }],
      observations: [],
      alerts: [],
      summary: {
        selectedCount: 1,
        checkedCount: 1,
        actualMinutes: 20,
        labourChargeCents: 3333,
        tooDangerousCount: 0,
      },
    }, { includePhotos: true });
    doc.end();
    await ended;

    const pdf = Buffer.concat(chunks);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(mocks.download).toHaveBeenCalledTimes(2);
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});