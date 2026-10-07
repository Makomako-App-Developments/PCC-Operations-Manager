import express from "express";
import request from "supertest";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createPhotoBackupRouter } from "./photo-backup";
function setup() {
  const deps = {
    enabled: () => true,
    verify: vi.fn(async (token: string) => { if (token !== "valid") throw Error("bad"); }),
    inventory: vi.fn(async () => ({ sourceId: "a".repeat(64), objects: [], nextPageToken: null })),
    read: vi.fn(() => Readable.from(Buffer.from("test-photo"))),
  };
  const app = express();
  app.use(express.json());
  app.use(createPhotoBackupRouter(deps as never));
  return { app, deps };
}
describe("read-only photo backup routes", () => {
  it("never touches storage for anonymous requests or user tokens", async () => {
    const { app, deps } = setup();
    expect((await request(app).post("/inventory")).status).toBe(401);
    expect((await request(app).post("/inventory").set("Authorization", "Bearer user")).status).toBe(401);
    expect(deps.inventory).not.toHaveBeenCalled();
    expect(deps.read).not.toHaveBeenCalled();
  });
  it("provides authenticated inventory with no cache", async () => {
    const { app } = setup();
    const response = await request(app).post("/inventory").set("Authorization", "Bearer valid").send({});
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.nextPageToken).toBeNull();
  });
  it("streams bytes using a validated generation pin", async () => {
    const { app, deps } = setup();
    const response = await request(app).post("/download").set("Authorization", "Bearer valid")
      .send({ name: "uploads/a.jpg", generation: "12" });
    expect(response.status).toBe(200);
    expect(response.body.toString()).toBe("test-photo");
    expect(deps.read).toHaveBeenCalledWith("uploads/a.jpg", "12");
  });
  it.each(["uploads/../secret", "../uploads/a.jpg", "public/a.jpg", "uploads/a\n.jpg"])(
    "rejects unsafe paths without storage access: %s", async name => {
      const { app, deps } = setup();
      expect((await request(app).post("/download").set("Authorization", "Bearer valid")
        .send({ name, generation: "12" })).status).toBe(400);
      expect(deps.read).not.toHaveBeenCalled();
    });
  it("fails an unreadable inventory instead of returning an empty success", async () => {
    const { app, deps } = setup();
    deps.inventory.mockRejectedValueOnce(Error("private-provider-details"));
    const response = await request(app).post("/inventory").set("Authorization", "Bearer valid");
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("private-provider-details");
  });
});
