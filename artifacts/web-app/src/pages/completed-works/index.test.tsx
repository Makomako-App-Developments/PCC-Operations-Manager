import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompletedWorks, { CompletedWorkPdfLink, completedWorkSourceLabel } from "./index";

const fetchMock = vi.fn();

vi.mock("wouter", () => ({
  useSearch: () => "",
}));

vi.mock("@/components/authenticated-image", () => ({
  AuthenticatedImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
  AuthenticatedMediaLink: ({ children, src, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { src: string }) => (
    <a href={src} {...props}>{children}</a>
  ),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CompletedWorks />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/teams") {
      return { ok: true, json: async () => [] };
    }
    if (url.startsWith("/api/completed-works?")) {
      return {
        ok: true,
        json: async () => ({
          data: [
            { id: "routine-1", workSource: "routine_maintenance", jobType: "scheduled", completedAt: "2026-09-13T01:00:00.000Z", scheduledDate: "2026-09-13", assetName: "Routine Site", actualTimeMins: 20, pdfAvailable: true },
            { id: "reactive-1", workSource: "unscheduled", jobType: "reactive", completedAt: "2026-09-13T02:00:00.000Z", scheduledDate: "2026-09-13", assetName: "Reactive Site", issueType: "Broken branch", actualTimeMins: 15, pdfAvailable: true },
            { id: "infill-1", workSource: "infill_planting", jobType: "infill_planting", completedAt: "2026-09-13T03:00:00.000Z", scheduledDate: "2026-09-13", assetName: "Infill Site", actualTimeMins: null, pdfAvailable: true, photoEndpoint: "/api/infill-jobs/infill-1/photos" },
            { id: "mulch-1", workSource: "mulching", jobType: "mulching", completedAt: "2026-09-13T04:00:00.000Z", scheduledDate: "2026-09-13", assetName: "Mulch Site", mulchType: "Bark", volumeM3: "2.5", actualTimeMins: null, pdfAvailable: true },
            { id: "storm-1", workSource: "storm_patrol", completedAt: "2026-09-13T05:00:00.000Z", assetName: "Storm Site", stormName: "September Storm", workTypes: ["debris_clearance"], actualTimeMins: 10, pdfAvailable: true },
          ],
        }),
      };
    }
    if (url === "/api/infill-jobs/infill-1/photos") {
      return {
        ok: true,
        json: async () => ({
          data: [{
            id: "infill-photo-1",
            blobUrl: "/api/uploads/infill-complete.jpg",
            caption: "Completed infill planting",
            createdAt: "2026-09-13T03:01:00.000Z",
          }],
        }),
      };
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Completed Works sources", () => {
  it("loads all sources by default and renders every completed-work type", async () => {
    renderPage();

    expect(await screen.findByText("Routine Site")).toBeVisible();
    expect(screen.getByText("Routine Maintenance")).toBeVisible();
    expect(screen.getByText("Unscheduled Work")).toBeVisible();
    expect(screen.getByText("Infill Planting")).toBeVisible();
    expect(screen.getByText("Mulching")).toBeVisible();
    expect(screen.getByText("September Storm")).toBeVisible();

    await waitFor(() => {
      const completedWorksCall = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/completed-works?"));
      expect(completedWorksCall).toBeDefined();
      expect(String(completedWorksCall?.[0])).not.toContain("workSource=");
    });
  });

  it("uses clear, stable labels for each source", () => {
    expect(completedWorkSourceLabel({ workSource: "routine_maintenance", jobType: "scheduled" })).toBe("Routine Maintenance");
    expect(completedWorkSourceLabel({ workSource: "unscheduled", jobType: "reactive" })).toBe("Unscheduled Work");
    expect(completedWorkSourceLabel({ workSource: "infill_planting", jobType: "infill_planting" })).toBe("Infill Planting");
    expect(completedWorkSourceLabel({ workSource: "mulching", jobType: "mulching" })).toBe("Mulching");
    expect(completedWorkSourceLabel({ workSource: "storm_patrol", stormName: "September Storm" })).toBe("September Storm");
  });

  it("loads and renders persisted photos in infill completion details", async () => {
    renderPage();

    fireEvent.click(await screen.findByText("Infill Site"));

    expect(await screen.findByAltText("Completed infill planting")).toHaveAttribute(
      "src",
      "/api/uploads/infill-complete.jpg",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/infill-jobs/infill-1/photos",
      { credentials: "include" },
    );
  });

  it("removes an infill photo from Completed Works immediately after confirmation", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/infill-jobs/infill-1/photos/infill-photo-1" && init?.method === "DELETE") {
        return { ok: true, status: 204 };
      }
      if (url === "/api/teams") return { ok: true, json: async () => [] };
      if (url.startsWith("/api/completed-works?")) {
        return { ok: true, json: async () => ({ data: [{ id: "infill-1", workSource: "infill_planting", jobType: "infill_planting", completedAt: "2026-09-13T03:00:00.000Z", scheduledDate: "2026-09-13", assetName: "Infill Site", actualTimeMins: null, photoEndpoint: "/api/infill-jobs/infill-1/photos" }] }) };
      }
      if (url === "/api/infill-jobs/infill-1/photos") {
        return { ok: true, json: async () => ({ data: [{ id: "infill-photo-1", blobUrl: "/api/uploads/infill-complete.jpg", caption: "Completed infill planting", createdAt: "2026-09-13T03:01:00.000Z" }] }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    renderPage();
    fireEvent.click(await screen.findByText("Infill Site"));
    fireEvent.click(await screen.findByRole("button", { name: "Remove completion photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));

    await waitFor(() => expect(screen.queryByAltText("Completed infill planting")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/infill-jobs/infill-1/photos/infill-photo-1",
      { method: "DELETE", credentials: "include" },
    );
  });

  it.each([
    ["routine_maintenance", "/api/jobs/work-1/pdf"],
    ["unscheduled", "/api/jobs/work-1/pdf?source=unscheduled"],
    ["infill_planting", "/api/jobs/work-1/pdf?source=infill_planting"],
    ["mulching", "/api/jobs/work-1/pdf?source=mulching"],
    ["storm_patrol", "/api/jobs/work-1/pdf?source=storm_patrol"],
  ] as const)("builds the correct PDF URL for %s", (workSource, expectedHref) => {
    render(<CompletedWorkPdfLink jobId="work-1" workSource={workSource} />);
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", expectedHref);
  });
});