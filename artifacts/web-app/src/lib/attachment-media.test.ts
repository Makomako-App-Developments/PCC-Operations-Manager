import { describe, expect, it } from "vitest";
import { isImageAttachment } from "./attachment-media";

describe("isImageAttachment", () => {
  it("recognises images from media type without relying on a URL", () => {
    expect(isImageAttachment("image/jpeg")).toBe(true);
    expect(isImageAttachment(" IMAGE/WEBP ")).toBe(true);
  });

  it("previews an extensionless attachment when the API identifies it as an image", () => {
    const attachment = {
      blobUrl: "/api/uploads/uploads/field-opaque-object-id",
      contentType: "image/jpeg",
    };

    expect(isImageAttachment(attachment.contentType)).toBe(true);
  });

  it("keeps documents and unknown media types generic", () => {
    expect(isImageAttachment("application/pdf")).toBe(false);
    expect(isImageAttachment("application/octet-stream")).toBe(false);
    expect(isImageAttachment(null)).toBe(false);
  });
});