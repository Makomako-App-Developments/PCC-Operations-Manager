import { beforeEach, describe, expect, it, vi } from "vitest";

const { addBreadcrumb } = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
}));

vi.mock("@sentry/react-native", () => ({
  addBreadcrumb,
}));
vi.mock("react-native", () => ({
  Platform: { OS: "web" },
}));

import {
  customFetch,
  setAuthTokenGetter,
  setRequestDiagnosticHandler,
} from "@workspace/api-client-react";
import { trackedFetch } from "../api";

function diagnosticJson(): string {
  return JSON.stringify(addBreadcrumb.mock.calls.at(-1)?.[0]?.data);
}

beforeEach(() => {
  vi.restoreAllMocks();
  addBreadcrumb.mockClear();
  setAuthTokenGetter(() => null);
  setRequestDiagnosticHandler(null);
});

describe("Field Ops request diagnostics", () => {
  it("does not include query strings, headers, bodies, or photo URLs", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    await trackedFetch(
      "/api/jobs/123e4567-e89b-12d3-a456-426614174000/photos?photoUrl=https%3A%2F%2Fprivate.example%2Fphoto.jpg",
      {
        method: "POST",
        headers: {
          authorization: "Bearer credential-that-must-not-leak",
          "x-user-note": "private note that must not leak",
        },
        body: JSON.stringify({
          note: "user-entered content that must not leak",
          photoUrl: "https://private.example/photo.jpg",
        }),
      },
    );

    const json = diagnosticJson();
    expect(json).toContain('"endpoint":"/api/jobs/:id/photos"');
    expect(json).toContain('"jobId":"123e4567-e89b-12d3-a456-426614174000"');
    expect(json).not.toContain("photoUrl");
    expect(json).not.toContain("private.example");
    expect(json).not.toContain("credential-that-must-not-leak");
    expect(json).not.toContain("private note that must not leak");
    expect(json).not.toContain("user-entered content that must not leak");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("photoUrl="),
      expect.anything(),
    );
  });

  it.each([
    ["HTTP 500", async () => new Response("server failure", { status: 500 }), "http_5xx"],
    ["HTTP 400", async () => new Response("bad request", { status: 400 }), "http_4xx"],
    ["network failure", async () => { throw new Error("socket disconnected"); }, "network"],
    ["timeout", async () => { throw new Error("request timed out"); }, "timeout"],
  ])("preserves safe fields for %s", async (_name, response, category) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(response as typeof fetch);

    if (category === "network" || category === "timeout") {
      await expect(
        trackedFetch("/api/jobs/123e4567-e89b-12d3-a456-426614174000", undefined, 2),
      ).rejects.toBeDefined();
    } else {
      const responseResult = await trackedFetch(
        "/api/jobs/123e4567-e89b-12d3-a456-426614174000",
        undefined,
        2,
      );
      expect(responseResult.status).toBe(Number(category === "http_5xx" ? 500 : 400));
    }

    const payload = addBreadcrumb.mock.calls.at(-1)?.[0]?.data;
    expect(payload).toMatchObject({
      method: "GET",
      endpoint: "/api/jobs/:id",
      jobId: "123e4567-e89b-12d3-a456-426614174000",
      retryCount: 2,
      failureCategory: category,
    });
    expect(Object.keys(payload)).toEqual(expect.arrayContaining([
      "method", "endpoint", "jobId", "durationMs", "retryCount", "failureCategory",
    ]));
  });

  it("records safe diagnostics when a successful JSON response cannot be parsed", async () => {
    const malformedBody =
      '{"photoUrl":"https://private.example/photo.jpg","note":"user-entered text"';
    const diagnostics: unknown[] = [];
    setRequestDiagnosticHandler(diagnostic => diagnostics.push(diagnostic));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(malformedBody, {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    await expect(
      customFetch(
        "/api/jobs/123e4567-e89b-12d3-a456-426614174000?photoUrl=https%3A%2F%2Fprivate.example%2Fphoto.jpg",
        { responseType: "json" },
      ),
    ).rejects.toMatchObject({ name: "ResponseParseError" });

    expect(diagnostics).toHaveLength(1);
    const payload = diagnostics[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      method: "GET",
      endpoint: "/api/jobs/:id",
      jobId: "123e4567-e89b-12d3-a456-426614174000",
      status: 200,
      retryCount: 0,
      failureCategory: "parse",
    });
    expect(payload.durationMs).toEqual(expect.any(Number));
    const json = JSON.stringify(payload);
    expect(json).not.toContain(malformedBody);
    expect(json).not.toContain("private.example");
    expect(json).not.toContain("user-entered text");
  });

  it("records safe diagnostics when an error response body cannot be read", async () => {
    const partialBody =
      '{"photoUrl":"https://private.example/photo.jpg","note":"user-entered text"';
    const diagnostics: unknown[] = [];
    setRequestDiagnosticHandler(diagnostic => diagnostics.push(diagnostic));
    const response = new Response(partialBody, {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    vi.spyOn(response, "text").mockRejectedValue(
      new Error("response body stream failed after reading private content"),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    await expect(
      customFetch(
        "/api/jobs/123e4567-e89b-12d3-a456-426614174000?photoUrl=https%3A%2F%2Fprivate.example%2Fphoto.jpg",
        { responseType: "json" },
        true,
      ),
    ).rejects.toThrow("response body stream failed");

    expect(diagnostics).toHaveLength(1);
    const payload = diagnostics[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      method: "GET",
      endpoint: "/api/jobs/:id",
      jobId: "123e4567-e89b-12d3-a456-426614174000",
      status: 500,
      retryCount: 1,
      failureCategory: "network",
    });
    expect(payload.durationMs).toEqual(expect.any(Number));
    const json = JSON.stringify(payload);
    expect(json).not.toContain(partialBody);
    expect(json).not.toContain("private.example");
    expect(json).not.toContain("user-entered text");
  });

  it("records a successful retry without exposing the failed request", async () => {
    const diagnostics: unknown[] = [];
    setRequestDiagnosticHandler(diagnostic => diagnostics.push(diagnostic));
    let attempts = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) return new Response("expired", { status: 401 });
      if (attempts === 2) return new Response(null, { status: 200 });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    setAuthTokenGetter(() => "opaque-token");
    await customFetch("/api/jobs/123e4567-e89b-12d3-a456-426614174000?note=private", {
      method: "GET",
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      endpoint: "/api/jobs/:id",
      jobId: "123e4567-e89b-12d3-a456-426614174000",
      status: 200,
      retryCount: 1,
    });
    const json = JSON.stringify(diagnostics[0]);
    expect(json).not.toContain("opaque-token");
    expect(json).not.toContain("private");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit" });
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toBeInstanceOf(Headers);
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Headers).get("authorization"))
      .toBe("Bearer opaque-token");
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      credentials: "include",
    });
    expect((fetchMock.mock.calls[2][1] as RequestInit).headers).not.toHaveProperty("authorization");
  });
});