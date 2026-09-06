import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommandCenter, { filterStormwaterAssets } from "./CommandCenter";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  toast: vi.fn(),
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
  useCloseStormPatrolEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateStormPatrolAlert: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAcknowledgeStormPatrolAlert: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetryStormPatrolAlertEmail: () => ({ mutateAsync: vi.fn(), isPending: false }),
  getGetStormPatrolReportUrl: () => "/api/storm-patrol/report",
  getGetCurrentStormPatrolQueryKey: () => ["/api/storm-patrol/current"],
  getListStormPatrolEventsQueryKey: () => ["/api/storm-patrol/events"],
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="storm-map">{children}</div>,
  TileLayer: () => null,
  CircleMarker: (props: any) => (
    <div
      data-testid="storm-marker"
      data-color={props.color}
      data-fill-color={props.fillColor}
      data-fill-opacity={props.fillOpacity}
      data-radius={props.radius}
      data-weight={props.weight}
    />
  ),
  Popup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMap: () => ({ fitBounds: vi.fn() }),
}));

function renderCommandCenter() {
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
          jobs: [],
          alerts: [],
          observations: [],
          followUps: [],
          summary: {},
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
  mocks.toast.mockReset();
  vi.stubGlobal("crypto", { randomUUID: () => "package-key" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Storm Patrol work package asset filters", () => {
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

  it("filters the list by priority and hotspot and resets an empty result", async () => {
    const user = userEvent.setup();
    renderCommandCenter();

    await chooseSelect(user, "Filter sites by priority", "High priority");
    expect(document.querySelector("[data-radix-select-content]")).toHaveClass("z-[1000]");
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