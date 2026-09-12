import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleAttachments } from "./schedule";
import { ReactiveJobAttachments } from "./reactive-jobs";
import { CompletedWorkPdfLink, CompletedWorkPhotos } from "./completed-works";

const mocks = vi.hoisted(() => ({
  customFetch: vi.fn(),
}));

vi.mock("@workspace/api-client-react", async importOriginal => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return { ...actual, customFetch: mocks.customFetch };
});

beforeEach(() => {
  mocks.customFetch.mockReset();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:authenticated-attachment"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(window, "open").mockReturnValue({
    location: { replace: vi.fn() },
    close: vi.fn(),
  } as unknown as Window);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const attachments = [
  {
    id: "photo-1",
    blobUrl: "/api/uploads/protected-photo.jpg",
    contentType: "image/jpeg",
    caption: "Protected photo",
  },
  {
    id: "document-1",
    blobUrl: "/api/uploads/protected-document.pdf",
    contentType: "application/pdf",
    caption: "Protected document",
  },
];

async function expectAuthenticatedClicks() {
  await screen.findByRole("img", { name: "Protected photo" });
  mocks.customFetch.mockClear();

  fireEvent.click(screen.getByRole("button", { name: "Protected photo" }));
  fireEvent.click(screen.getByRole("button", { name: "Protected document" }));

  await waitFor(() => {
    expect(mocks.customFetch).toHaveBeenCalledWith(
      "/api/uploads/protected-photo.jpg",
      expect.objectContaining({ responseType: "blob" }),
    );
    expect(mocks.customFetch).toHaveBeenCalledWith(
      "/api/uploads/protected-document.pdf",
      expect.objectContaining({ responseType: "blob" }),
    );
  });
  expect(document.querySelector('a[href^="/api/uploads/"]')).toBeNull();
}

describe("protected page attachments", () => {
  it("uses authenticated blob fetching for schedule photos and documents", async () => {
    mocks.customFetch.mockResolvedValue(new Blob(["attachment"]));
    render(<ScheduleAttachments attachments={attachments} />);
    await expectAuthenticatedClicks();
  });

  it("uses authenticated blob fetching for reactive job photos and documents", async () => {
    mocks.customFetch.mockResolvedValue(new Blob(["attachment"]));
    render(<ReactiveJobAttachments attachments={attachments} />);
    await expectAuthenticatedClicks();
  });

  it("uses authenticated blob fetching for completed work photos and documents", async () => {
    mocks.customFetch.mockResolvedValue(new Blob(["photo"], { type: "image/jpeg" }));
    render(
      <>
        <CompletedWorkPhotos
          photos={[{
            id: "photo-1",
            blobUrl: "/api/uploads/protected-photo.jpg",
            caption: "Protected photo",
            createdAt: "2026-09-12T00:00:00.000Z",
          }]}
        />
        <CompletedWorkPdfLink jobId="job-1" />
      </>,
    );
    await screen.findByRole("img", { name: "Protected photo" });
    mocks.customFetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Protected photo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => {
      expect(mocks.customFetch).toHaveBeenCalledWith(
        "/api/uploads/protected-photo.jpg",
        expect.objectContaining({ responseType: "blob" }),
      );
      expect(mocks.customFetch).toHaveBeenCalledWith(
        "/api/jobs/job-1/pdf",
        expect.objectContaining({ responseType: "blob" }),
      );
    });
    expect(document.querySelector('a[href^="/api/uploads/"]')).toBeNull();
    expect(document.querySelector('a[href="/api/jobs/job-1/pdf"]')).toBeNull();
  });

  it("uses authenticated blob fetching for the completed-work table PDF without opening the row", async () => {
    const openRow = vi.fn();
    mocks.customFetch.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    render(
      <div onClick={openRow}>
        <CompletedWorkPdfLink jobId="table-job-1" compact onClick={event => event.stopPropagation()} />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    await waitFor(() => expect(mocks.customFetch).toHaveBeenCalledWith(
      "/api/jobs/table-job-1/pdf",
      expect.objectContaining({ responseType: "blob" }),
    ));
    expect(openRow).not.toHaveBeenCalled();
    expect(document.querySelector('a[href="/api/jobs/table-job-1/pdf"]')).toBeNull();
  });

  it.each([
    ["schedule", () => <ScheduleAttachments attachments={[attachments[1]]} />],
    ["reactive jobs", () => <ReactiveJobAttachments attachments={[attachments[1]]} />],
    ["completed works", () => <CompletedWorkPhotos photos={[{
      id: "photo-1",
      blobUrl: "/api/uploads/protected-photo.jpg",
      caption: "Protected photo",
      createdAt: "2026-09-12T00:00:00.000Z",
    }]} />],
  ])("keeps the %s failure state visible when token refresh fails", async (_name, view) => {
    mocks.customFetch.mockRejectedValue(new Error("Unauthorized"));
    render(view());

    const control = screen.getByRole("button");
    fireEvent.click(control);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      _name === "completed works" ? "Photo unavailable" : "Attachment unavailable",
    );
  });
});