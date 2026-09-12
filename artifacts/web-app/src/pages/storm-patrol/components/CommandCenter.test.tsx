import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommandCenter, { filterStormwaterAssets } from "./CommandCenter";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  cancelJob: vi.fn(),
  toast: vi.fn(),
  customFetch: vi.fn(),
  tileLayerHandlers: { current: undefined as any },
  tileLayerRenderCount: { current: 0 },
}));

const assets = [
  {
    id: "asset-high-hotspot",
    name: "Bodman SW grate",
    department: "stormwater",
    departmentDetails: {
      contractor: "Parks",
      assetType: "inlet",
      priority: "High",
      hotspot: "Yes",
    },
    streetAddress: "56 Bodmans Lane",
    lat: -41.13,
    lng: 174.83,
    isSchedulable: false,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "asset-high-standard",
    name: "Cannons Creek drain",
    department: "stormwater",
    departmentDetails: {
      contractor: "Parks",
      assetType: "outlet",
      priority: "High",
      hotspot: "No",
    },
    streetAddress: "1 Bedford Street",
    lat: -41.14,
    lng: 174.84,
    isSchedulable: false,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "asset-low-hotspot",
    name: "Titahi Bay catchpit",
    department: "stormwater",
    departmentDetails: {
      contractor: "Transport",
      assetType: "culvert",
      priority: "Low",
      hotspot: "Yes",
    },
    streetAddress: "16 Bay Drive",
    lat: -41.12,
    lng: 174.82,
    isSchedulable: false,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
] as const;

vi.mock("@workspace/api-client-react", () => ({
  useListTeams: () => ({ data: [{ id: "team-1", name: "Storm Team" }] }),
  useListAssets: () => ({ data: { data: assets, total: assets.length, page: 1, limit: 2000 } }),
  usePublishStormPatrolPackage: () => ({ mutateAsync: mocks.publish, isPending: false }),
  useCancelStormPatrolJob: () => ({ mutateAsync: mocks.cancelJob, isPending: false }),
  useCloseStormPatrolEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateStormPatrolAlert: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAcknowledgeStormPatrolAlert: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetryStormPatrolAlertEmail: () => ({ mutateAsync: vi.fn(), isPending: false }),
  getGetStormPatrolReportUrl: () => "/api/storm-patrol/report",
  getGetCurrentStormPatrolQueryKey: () => ["/api/storm-patrol/current"],
  getListStormPatrolEventsQueryKey: () => ["/api/storm-patrol/events"],
  customFetch: mocks.customFetch,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children, center, zoom, ...props }: any) => (
    <div
      data-testid="storm-map"
      data-center={JSON.stringify(center)}
      data-zoom={zoom}
      aria-label={props["aria-label"]}
    >
      {children}
    </div>
  ),
  TileLayer: ({ eventHandlers }: any) => {
    mocks.tileLayerHandlers.current = eventHandlers;
    mocks.tileLayerRenderCount.current += 1;
    return null;
  },
  CircleMarker: (props: any) => (
    <div
      data-testid="storm-marker"
      data-color={props.pathOptions?.color}
      data-fill-color={props.pathOptions?.fillColor}
      data-fill-opacity={props.pathOptions?.fillOpacity}
      data-radius={props.radius}
      data-center={JSON.stringify(props.center)}
    />
  ),
  Popup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMap: () => ({ fitBounds: vi.fn(), invalidateSize: vi.fn() }),
}));

function renderCommandCenter(
  jobs: any[] = [],
  observations: any[] = [],
  followUps: any[] = [],
  alerts: any[] = [],
  summary: Record<string, number> = {
    actualMinutes: jobs.reduce((total, job) => total + (job.actualTimeMins ?? 0), 0),
  },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CommandCenter
        data={{
          event: {
            id: "event-1",
            name: "Cyclone Test",
            status: "active",
            hourlyRateCents: 10000,
            activatedAt: "2026-09-07T07:00:00.000Z",
          },
          jobs,
          alerts,
          observations,
          followUps,
          summary,
        }}
      />
    </QueryClientProvider>,
  );
}

async function chooseSelect(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

beforeEach(() => {
  const elementPrototype = HTMLElement.prototype as HTMLElement & {
    hasPointerCapture?: () => boolean;
    setPointerCapture?: () => void;
    releasePointerCapture?: () => void;
  };
  elementPrototype.hasPointerCapture = () => false;
  elementPrototype.setPointerCapture = () => {};
  elementPrototype.releasePointerCapture = () => {};
  elementPrototype.scrollIntoView = () => {};

  mocks.publish.mockReset();
  mocks.publish.mockResolvedValue({ package: {}, jobs: [] });
  mocks.cancelJob.mockReset().mockResolvedValue(undefined);
  mocks.toast.mockReset();
  mocks.customFetch.mockReset();
  mocks.tileLayerHandlers.current = undefined;
  mocks.tileLayerRenderCount.current = 0;
  mocks.customFetch.mockResolvedValue(new Blob(["photo"], { type: "image/jpeg" }));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:authenticated-photo") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.stubGlobal("crypto", { randomUUID: () => "package-key" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Storm Patrol work package asset filters", () => {
  it("labels the active alert section as Urgent Issues", () => {
    renderCommandCenter([], [], [], [{
      id: "alert-1",
      message: "Blocked drain",
      emailStatus: "sent",
      emailAttempts: 1,
      acknowledgedAt: null,
    }]);

    expect(screen.getByRole("heading", { name: "Urgent Issues" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Active Alerts" })).not.toBeInTheDocument();
  });

  it("shows the total actual minutes used by field workers", () => {
    renderCommandCenter([
      {
        id: "job-completed-one",
        eventId: "event-1",
        workPackageId: "package-1",
        phase: "pre",
        assetId: "asset-1",
        teamId: "team-1",
        status: "completed",
        assetName: "Completed Site One",
        actualTimeMins: 30,
      },
      {
        id: "job-completed-two",
        eventId: "event-1",
        workPackageId: "package-1",
        phase: "mid",
        assetId: "asset-2",
        teamId: "team-1",
        status: "completed",
        assetName: "Completed Site Two",
        actualTimeMins: 45,
      },
      {
        id: "job-without-time",
        eventId: "event-1",
        workPackageId: "package-1",
        phase: "post",
        assetId: "asset-3",
        teamId: "team-1",
        status: "pending",
        assetName: "Pending Site",
      },
    ]);

    expect(screen.getByText("Actual Minutes")).toBeVisible();
    expect(screen.getByText("75")).toBeVisible();
    expect(screen.queryByText("Escalations")).not.toBeInTheDocument();
  });

  it("uses the report-aligned actual-minutes summary when it is provided", () => {
    renderCommandCenter(
      [{ actualTimeMins: 30, status: "completed", assetName: "Completed Site" }],
      [],
      [],
      [],
      { actualMinutes: 75 },
    );

    expect(screen.getByText("75")).toBeVisible();
  });

  it("confirms and cancels only pending live jobs", async () => {
    const user = userEvent.setup();
    renderCommandCenter([
      {
        id: "job-pending",
        eventId: "event-1",
        workPackageId: "package-1",
        phase: "pre",
        assetId: "asset-1",
        teamId: "team-1",
        status: "pending",
        assetName: "Pending Site",
      },
      {
        id: "job-completed",
        eventId: "event-1",
        workPackageId: "package-1",
        phase: "pre",
        assetId: "asset-2",
        teamId: "team-1",
        status: "completed",
        assetName: "Completed Site",
      },
    ]);

    expect(screen.queryByRole("button", { name: "Cancel pending job for Completed Site" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel pending job for Pending Site" }));
    expect(screen.getByRole("heading", { name: "Cancel pending job?" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Cancel job" }));

    await waitFor(() => expect(mocks.cancelJob).toHaveBeenCalledWith({ id: "job-pending" }));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Pending job cancelled" }));
  });

  it("filters live operations by phase and sorts table columns in both directions", async () => {
    const user = userEvent.setup();
    renderCommandCenter([
      {
        id: "job-zulu",
        eventId: "event-1",
        workPackageId: "package-1",
        phase: "mid",
        assetId: "asset-1",
        teamId: "team-1",
        status: "completed",
        assetName: "Zulu Site",
        teamName: "Bravo Team",
        comments: "Second",
      },
      {
        id: "job-alpha",
        eventId: "event-1",
        workPackageId: "package-1",
        phase: "mid",
        assetId: "asset-2",
        teamId: "team-2",
        status: "pending",
        assetName: "Alpha Site",
        teamName: "Alpha Team",
        comments: "First",
      },
      {
        id: "job-pre",
        eventId: "event-1",
        workPackageId: "package-2",
        phase: "pre",
        assetId: "asset-3",
        teamId: "team-1",
        status: "completed",
        assetName: "Pre Site",
        teamName: "Alpha Team",
        comments: "Pre",
      },
    ]);

    await chooseSelect(user, "Filter live jobs by phase", "Mid");
    expect(screen.queryByText("Pre Site")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sort by Site" }));
    let rows = within(screen.getByText("Live Field Operations").closest("div[class*='rounded-2xl']")!).getAllByRole("row").slice(1);
    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringContaining("Alpha Site"),
      expect.stringContaining("Zulu Site"),
    ]);

    await user.click(screen.getByRole("button", { name: "Sort by Site" }));
    rows = within(screen.getByText("Live Field Operations").closest("div[class*='rounded-2xl']")!).getAllByRole("row").slice(1);
    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringContaining("Zulu Site"),
      expect.stringContaining("Alpha Site"),
    ]);
  });

  it("collapses the package creator when returning to an event with issued jobs", () => {
    renderCommandCenter([{
      id: "job-issued",
      eventId: "event-1",
      workPackageId: "package-1",
      phase: "pre",
      assetId: "asset-high-hotspot",
      teamId: "team-1",
      status: "issued",
      routeOrder: 1,
      assetName: "Bodman SW grate",
    }]);

    expect(screen.getByRole("button", { name: "Expand Create Work Package" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Assign to team" })).not.toBeInTheDocument();
    expect(screen.getByText("1 issued field job ready for live operations.")).toBeVisible();
  });

  it("marks same-phase allocated sites and makes them available again in another phase", async () => {
    const user = userEvent.setup();
    renderCommandCenter([{
      id: "job-issued",
      eventId: "event-1",
      workPackageId: "package-1",
      phase: "pre",
      assetId: "asset-high-hotspot",
      teamId: "team-1",
      status: "issued",
      routeOrder: 1,
      assetName: "Bodman SW grate",
    }]);

    await user.click(screen.getByRole("button", { name: "Expand Create Work Package" }));

    const allocatedCheckbox = screen.getByRole("checkbox", { name: "Select Bodman SW grate" });
    expect(allocatedCheckbox).toBeChecked();
    expect(allocatedCheckbox).toBeDisabled();
    expect(screen.getByText("ALLOCATED")).toBeVisible();
    expect(screen.getAllByTestId("storm-marker")[0]).toHaveAttribute("data-fill-color", "#2563eb");
    expect(screen.getAllByTestId("storm-marker")[0]).toHaveAttribute("data-fill-opacity", "1");

    await chooseSelect(user, "Response phase", "Mid-Storm Response");

    expect(screen.getByRole("checkbox", { name: "Select Bodman SW grate" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Bodman SW grate" })).toBeEnabled();
    expect(screen.queryByText("ALLOCATED")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("storm-marker")[0]).toHaveAttribute("data-fill-color", "transparent");
    expect(screen.getAllByTestId("storm-marker")[0]).toHaveAttribute("data-fill-opacity", "0");
  });

  it("shows scannable New Observation cards and opens the mapped details modal", async () => {
    const user = userEvent.setup();
    renderCommandCenter([], [{
      id: "observation-1",
      eventId: "event-1",
      description: "Pigs blocking the drain",
      notes: "Needs urgent clearance.",
      locationLat: -41.12345,
      locationLng: 174.98765,
      createdAt: "2026-09-10T04:30:00.000Z",
      reactiveJobId: "draft-job-1",
      photos: [{
        id: "photo-1",
        purpose: "observation",
        blobUrl: "/api/uploads/observation-1.jpg",
        caption: "Blocked inlet",
        createdAt: "2026-09-10T04:30:00.000Z",
      }],
    }], [{ id: "draft-job-1" }]);

    const card = screen.getByRole("button", { name: "Open New Observation: Pigs blocking the drain" });
    expect(within(card).getByText("10 Sep 2026")).toBeVisible();
    expect(within(card).getByText("Draft Unscheduled job created")).toBeVisible();
    expect(within(card).queryByText("View details")).not.toBeInTheDocument();

    await user.click(card);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("New Observation")).toBeVisible();
    const observationMap = within(dialog).getByLabelText("New Observation recorded location");
    expect(observationMap).toHaveAttribute("data-center", "[-41.12345,174.98765]");
    expect(observationMap).toHaveAttribute("data-zoom", "17");
    const observationMarker = within(observationMap).getByTestId("storm-marker");
    expect(observationMarker).toHaveAttribute("data-center", "[-41.12345,174.98765]");
    expect(observationMarker).toHaveAttribute("data-fill-color", "#00AECD");
    expect(within(dialog).getByText("Needs urgent clearance.")).toBeVisible();
    expect(within(dialog).getByText("-41.12345")).toBeVisible();
    expect(within(dialog).getByText("174.98765")).toBeVisible();
    await waitFor(() => expect(within(dialog).getByRole("img", { name: "Observation photo 1" })).toHaveAttribute("src", "blob:authenticated-photo"));
    expect(mocks.customFetch).toHaveBeenCalledWith("/api/uploads/observation-1.jpg", expect.objectContaining({ responseType: "blob" }));
    expect(within(dialog).getByText("Blocked inlet")).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Close New Observation" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps observation details available while map tiles fail and restores the map on recovery", async () => {
    const user = userEvent.setup();
    renderCommandCenter([], [{
      id: "observation-1",
      eventId: "event-1",
      description: "Blocked culvert",
      notes: "Water is rising.",
      locationLat: -41.12345,
      locationLng: 174.98765,
      createdAt: "2026-09-10T04:30:00.000Z",
      reactiveJobId: null,
      photos: [{
        id: "photo-1",
        blobUrl: "/api/uploads/observation-1.jpg",
        caption: "Culvert entrance",
      }],
    }]);

    await user.click(screen.getByRole("button", { name: "Open New Observation: Blocked culvert" }));
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("img", { name: "Observation photo 1" })).toBeVisible());

    vi.useFakeTimers();
    act(() => mocks.tileLayerHandlers.current.tileerror());

    expect(within(dialog).getByRole("status")).toHaveTextContent("Map tiles are unavailable");
    expect(within(dialog).getByText(/recorded coordinates are still available below/i)).toBeVisible();
    expect(within(dialog).getByText("Water is rising.")).toBeVisible();
    expect(within(dialog).getByText("-41.12345")).toBeVisible();
    expect(within(dialog).getByText("174.98765")).toBeVisible();
    expect(within(dialog).getByRole("img", { name: "Observation photo 1" })).toBeVisible();
    expect(within(dialog).getByText("Culvert entrance")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Close New Observation" })).toBeVisible();

    const failedRenderCount = mocks.tileLayerRenderCount.current;
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(mocks.tileLayerRenderCount.current).toBeGreaterThan(failedRenderCount);

    act(() => mocks.tileLayerHandlers.current.load());

    expect(within(dialog).queryByRole("status")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("New Observation recorded location")).toBeVisible();
    expect(within(dialog).getByTestId("storm-marker")).toBeVisible();
  });

  it("shows uploaded before and after photos in completed work", async () => {
    const user = userEvent.setup();
    renderCommandCenter([{
      id: "completed-job",
      eventId: "event-1",
      workPackageId: "package-1",
      phase: "mid",
      assetId: "asset-high-hotspot",
      teamId: "team-1",
      status: "completed",
      routeOrder: 1,
      assetName: "Thompson Grove",
      photos: [
        { id: "before-1", purpose: "before", blobUrl: "/api/uploads/before-1.jpg", caption: null },
        { id: "after-1", purpose: "after", blobUrl: "/api/uploads/after-1.jpg", caption: "Cleared" },
      ],
    }]);

    await user.click(screen.getByRole("row", { name: "Open completed work for Thompson Grove" }));

    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("img", { name: "Before photo 1" })).toHaveAttribute("src", "blob:authenticated-photo"));
    expect(within(dialog).getByRole("img", { name: "After photo 2" })).toHaveAttribute("src", "blob:authenticated-photo");
    expect(mocks.customFetch).toHaveBeenCalledWith("/api/uploads/before-1.jpg", expect.objectContaining({ responseType: "blob" }));
    expect(mocks.customFetch).toHaveBeenCalledWith("/api/uploads/after-1.jpg", expect.objectContaining({ responseType: "blob" }));
    expect(within(dialog).getByText("Cleared")).toBeVisible();
  });

  it("combines search, priority, and hotspot classifications", () => {
    expect(
      filterStormwaterAssets(assets as any, "bay", "Low", "Yes").map(asset => asset.id),
    ).toEqual(["asset-low-hotspot"]);
    expect(
      filterStormwaterAssets(assets as any, "", "High", "No").map(asset => asset.id),
    ).toEqual(["asset-high-standard"]);
  });

  it("shows selected sites as larger filled blue markers", async () => {
    const user = userEvent.setup();
    renderCommandCenter([], [{
      id: "observation-1",
      eventId: "event-1",
      description: "Pigs blocking the drain",
      notes: "Needs urgent clearance.",
      locationLat: -41.12345,
      locationLng: 174.98765,
      createdAt: "2026-09-10T04:30:00.000Z",
      reactiveJobId: null,
      photos: [{
        id: "photo-1",
        purpose: "observation",
        blobUrl: "/api/uploads/observation-1.jpg",
        caption: "Blocked inlet",
        createdAt: "2026-09-10T04:30:00.000Z",
      }],
    }]);

    await user.click(screen.getByRole("button", { name: "Open New Observation: Pigs blocking the drain" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Needs urgent clearance.")).toBeVisible();
    expect(within(dialog).getByText("-41.12345")).toBeVisible();
    expect(within(dialog).getByText("174.98765")).toBeVisible();
    await waitFor(() => expect(within(dialog).getByRole("img", { name: "Observation photo 1" })).toHaveAttribute("src", "blob:authenticated-photo"));
    expect(within(dialog).getByText("Blocked inlet")).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Close New Observation" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("combines search, priority, and hotspot classifications", () => {
    expect(
      filterStormwaterAssets(assets as any, "bay", "Low", "Yes").map(asset => asset.id),
    ).toEqual(["asset-low-hotspot"]);
    expect(
      filterStormwaterAssets(assets as any, "", "High", "No").map(asset => asset.id),
    ).toEqual(["asset-high-standard"]);
  });

  it("shows selected sites as larger filled blue markers", async () => {
    const user = userEvent.setup();
    renderCommandCenter();

    const markers = screen.getAllByTestId("storm-marker");
    expect(markers[0]).toHaveAttribute("data-color", "#ef4444");
    expect(markers[0]).toHaveAttribute("data-fill-opacity", "0");
    expect(markers[1]).toHaveAttribute("data-color", "#111827");
    expect(markers[1]).toHaveAttribute("data-fill-opacity", "0");

    await user.click(screen.getByRole("checkbox", { name: "Select Bodman SW grate" }));

    expect(screen.getAllByTestId("storm-marker")[0]).toHaveAttribute("data-color", "#2563eb");
    expect(screen.getAllByTestId("storm-marker")[0]).toHaveAttribute("data-fill-color", "#2563eb");
    expect(screen.getAllByTestId("storm-marker")[0]).toHaveAttribute("data-fill-opacity", "1");
    expect(screen.getAllByTestId("storm-marker")[0]).toHaveAttribute("data-radius", "8");
  });

  it("keeps the team menu above the Leaflet map layer", async () => {
    const user = userEvent.setup();
    renderCommandCenter();

    await user.click(screen.getByRole("combobox", { name: "Assign to team" }));

    const menu = await screen.findByRole("listbox");
    expect(menu).toHaveStyle({ zIndex: "1000" });
    expect(screen.getByRole("option", { name: "Storm Team" })).toBeVisible();
  });

  it("filters the list by priority and hotspot and resets an empty result", async () => {
    const user = userEvent.setup();
    renderCommandCenter();

    await chooseSelect(user, "Filter sites by priority", "High priority");
    expect(screen.getByText("Bodman SW grate")).toBeInTheDocument();
    expect(screen.getByText("Cannons Creek drain")).toBeInTheDocument();
    expect(screen.queryByText("Titahi Bay catchpit")).not.toBeInTheDocument();

    await chooseSelect(user, "Filter sites by hotspot", "Hotspots");
    expect(screen.getByText("Bodman SW grate")).toBeInTheDocument();
    expect(screen.queryByText("Cannons Creek drain")).not.toBeInTheDocument();
    expect(screen.getByTestId("asset-filter-count")).toHaveTextContent("Showing 1 of 3");

    await user.type(screen.getByRole("textbox", { name: "Search stormwater assets" }), "no match");
    expect(screen.getByText("No sites match these filters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select All Filtered" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByTestId("asset-filter-count")).toHaveTextContent("Showing 3 of 3");
    expect(screen.getByText("Titahi Bay catchpit")).toBeInTheDocument();
  });

  it("keeps hidden selections and publishes the selected asset IDs", async () => {
    const user = userEvent.setup();
    renderCommandCenter();

    await chooseSelect(user, "Filter sites by priority", "High priority");
    await chooseSelect(user, "Filter sites by hotspot", "Hotspots");
    await user.click(screen.getByRole("checkbox", { name: "Select Bodman SW grate" }));

    await chooseSelect(user, "Filter sites by hotspot", "Not hotspots");
    expect(screen.queryByText("Bodman SW grate")).not.toBeInTheDocument();
    expect(screen.getByText(/Selected:/).parentElement).toHaveTextContent("Selected: 1");

    await user.click(screen.getByRole("button", { name: "Select All Filtered" }));
    expect(screen.getByText(/Selected:/).parentElement).toHaveTextContent("Selected: 2");

    await chooseSelect(user, "Assign to team", "Storm Team");
    await user.click(screen.getByTestId("btn-publish-package"));

    await waitFor(() => {
      expect(mocks.publish).toHaveBeenCalledWith({
        id: "event-1",
        data: {
          phase: "pre",
          teamId: "team-1",
          assetIds: ["asset-high-hotspot", "asset-high-standard"],
          idempotencyKey: "package-key",
        },
      });
    });
    expect(screen.getByRole("button", { name: "Expand Create Work Package" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Response phase" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Create Work Package" }));
    expect(screen.getByRole("combobox", { name: "Response phase" })).toBeInTheDocument();
  });
});
