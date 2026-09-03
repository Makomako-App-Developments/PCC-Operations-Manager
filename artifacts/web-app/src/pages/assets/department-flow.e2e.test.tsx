import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route, Switch } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { useState } from "react";

const mocks = vi.hoisted(() => ({
  currentAsset: null as Record<string, unknown> | null,
  fetch: vi.fn(),
  useListAssets: vi.fn(),
  useGetAsset: vi.fn(),
  useListTeams: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListAssets: mocks.useListAssets,
  useGetAsset: mocks.useGetAsset,
  useListTeams: mocks.useListTeams,
  useDeleteAsset: () => ({ mutate: vi.fn() }),
  getListAssetsQueryKey: (params: unknown) => ["/api/assets", params],
  getGetAssetQueryKey: (id: string) => ["/api/assets", id],
  getListTeamsQueryKey: () => ["/api/teams"],
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "manager-department-flow", role: "manager" },
    isLoading: false,
  }),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children, ...props }: { children: React.ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  CircleMarker: () => null,
  Polygon: () => null,
  Tooltip: () => null,
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn() }),
}));

vi.mock("@/components/BoundaryEditor", () => ({
  default: () => null,
}));

import Assets from "./index";
import AssetDetail from "./detail";
import NewAsset from "./new";
import { useAuth } from "@/lib/auth";

function SignedInManager({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading || user?.role !== "manager") return null;
  return <>{children}</>;
}

function useTestLocation() {
  return useState("/assets/new") as [string, (next: string) => void];
}

function useDetailLocation() {
  return useState("/assets/asset-department-flow") as [string, (next: string) => void];
}

function renderManagerFlow() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Router hook={useTestLocation}>
        <SignedInManager>
          <Switch>
            <Route path="/assets/new" component={NewAsset} />
            <Route path="/assets/:id" component={AssetDetail} />
            <Route path="/assets" component={Assets} />
          </Switch>
        </SignedInManager>
      </Router>
    </QueryClientProvider>,
  );
}

function renderAssetRegister() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Router hook={useTestLocation}>
        <SignedInManager><Assets /></SignedInManager>
      </Router>
    </QueryClientProvider>,
  );
}

function renderAssetDetails() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Router hook={useDetailLocation}>
        <SignedInManager>
          <Route path="/assets/:id" component={AssetDetail} />
        </SignedInManager>
      </Router>
    </QueryClientProvider>,
  );
}

const horticultureAsset = {
  id: "asset-department-flow",
  name: "Harbour Edge Site",
  description: "Created by the manager flow",
  department: "horticulture",
  gardenType: "amenity",
  standard: "medium",
  areaM2: "180",
  serviceTimeMins: 45,
  frequency: "monthly",
  departmentDetails: null,
  siteType: "park",
  teamId: null,
  ward: null,
  suburb: "Porirua",
  streetAddress: null,
  notes: null,
};

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

  mocks.currentAsset = null;
  mocks.fetch.mockReset();
  mocks.useListTeams.mockReturnValue({ data: [] });
  mocks.useListAssets.mockImplementation((params: { department?: string }) => {
    const asset = mocks.currentAsset;
    const matchesDepartment =
      !params?.department || params.department === asset?.department;
    return {
      data: {
        data: asset && matchesDepartment ? [asset] : [],
        total: asset && matchesDepartment ? 1 : 0,
      },
      isLoading: false,
    };
  });
  mocks.useGetAsset.mockImplementation(() => ({
    data: mocks.currentAsset,
    isLoading: false,
  }));
  mocks.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === "/api/assets" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      mocks.currentAsset = { ...horticultureAsset, ...body };
      return { ok: true, json: async () => mocks.currentAsset };
    }

    if (url === `/api/assets/${horticultureAsset.id}` && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      Object.assign(mocks.currentAsset!, body);
      return { ok: true, json: async () => mocks.currentAsset };
    }

    if (url === `/api/assets/${horticultureAsset.id}/history`) {
      return {
        ok: true,
        json: async () => [
          {
            id: "history-department-change",
            action: "UPDATE",
            changedAt: "2026-09-02T10:00:00.000Z",
            changedByName: "Manager",
            changes: [
              {
                field: "department",
                label: "Department / Function",
                old: "horticulture",
                new: "litter",
              },
            ],
          },
        ],
      };
    }

    return { ok: true, json: async () => ({ data: [] }) };
  });
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("signed-in manager department flow", () => {
  it("creates, edits, filters, and audits an asset department in the browser UI", async () => {
    const user = userEvent.setup();
    renderManagerFlow();

    await waitFor(() => expect(screen.getByText("Parks & Horticulture")).toBeInTheDocument());
    await user.click(screen.getByText("Parks & Horticulture"));

    await waitFor(() => expect(screen.getByLabelText("Site Name")).toBeInTheDocument());
    await user.type(screen.getByLabelText("Site Name"), "Harbour Edge Site");

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Mowing" }));
    await user.click(screen.getAllByRole("combobox")[2]);
    await user.click(await screen.findByRole("option", { name: "Amenity turf" }));
    await user.clear(screen.getByLabelText("Mowing Area (m²)"));
    await user.type(screen.getByLabelText("Mowing Area (m²)"), "180");
    await user.click(screen.getByRole("button", { name: "Save Asset" }));

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/assets",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/assets",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual(
      expect.objectContaining({
        name: "Harbour Edge Site",
        department: "mowing",
        departmentDetails: { mowingType: "amenity_turf" },
        gardenType: null,
        standard: null,
      }),
    );

    cleanup();
    renderAssetRegister();
    await waitFor(() => expect(screen.getByText("Asset Register")).toBeInTheDocument());
    expect(screen.getByTestId(`row-asset-${horticultureAsset.id}`)).toHaveTextContent("Mowing");

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Mowing" }));
    await waitFor(() => {
      expect(screen.getByTestId(`row-asset-${horticultureAsset.id}`)).toHaveTextContent("Mowing");
    });

    await user.click(screen.getByRole("button", { name: "Clear Filters" }));
    fireEvent.click(screen.getByTestId(`row-asset-${horticultureAsset.id}`));
    cleanup();
    renderAssetDetails();
    await waitFor(() => expect(screen.getByText("Asset Register")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Edit" }));

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Litter" }));
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByRole("option", { name: "Litter bin" }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        `/api/assets/${horticultureAsset.id}`,
        expect.objectContaining({ method: "PATCH" }),
      );
    });
    const patchCall = mocks.fetch.mock.calls.find(
      ([url, init]) => url === `/api/assets/${horticultureAsset.id}` && init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.[1].body))).toEqual(
      expect.objectContaining({
        department: "litter",
        departmentDetails: { cleaningType: "litter_bin" },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Asset Edits" }));
    await waitFor(() =>
      expect(screen.getAllByText("Department / Function").length).toBeGreaterThan(1),
    );
    expect(document.body).toHaveTextContent("horticulture");
    expect(document.body).toHaveTextContent("litter");
  });

  it("creates, edits, and filters a stormwater asset", async () => {
    const user = userEvent.setup();
    renderManagerFlow();

    await waitFor(() => expect(screen.getByText("Stormwater")).toBeInTheDocument());
    await user.click(screen.getByText("Stormwater"));

    await waitFor(() => expect(screen.getByLabelText("Asset Name")).toBeInTheDocument());
    await user.type(screen.getByLabelText("Asset Name"), "Stormwater Drain 1");

    // Fill Stormwater specific fields
    await user.type(screen.getByLabelText("Global ID"), "SW-123");

    await user.click(screen.getAllByRole("combobox")[0]); // Asset Type
    await user.click(await screen.findByRole("option", { name: "Inlet" }));
    await user.click(screen.getByLabelText("Contractor"));
    await user.click(await screen.findByRole("option", { name: "Parks" }));
    await user.click(screen.getByLabelText("Priority"));
    await user.click(await screen.findByRole("option", { name: "High" }));
    await user.click(screen.getByLabelText("Hotspot"));
    await user.click(await screen.findByRole("option", { name: "Yes" }));

    await user.click(screen.getByRole("button", { name: "Save Asset" }));

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/assets",
        expect.objectContaining({ method: "POST" }),
      ),
    );

    const postCall = mocks.fetch.mock.calls.find(
      ([url, init]) => url === "/api/assets" && init?.method === "POST"
    );
    expect(postCall).toBeDefined();
    expect(JSON.parse(String(postCall?.[1].body))).toEqual(
      expect.objectContaining({
        name: "Stormwater Drain 1",
        department: "stormwater",
        globalId: "SW-123",
        isSchedulable: false,
        departmentDetails: expect.objectContaining({ assetType: "inlet" })
      }),
    );

    cleanup();
    renderAssetRegister();
    await waitFor(() => expect(screen.getByText("Asset Register")).toBeInTheDocument());

    // Test filter
    await user.click(screen.getAllByRole("combobox")[0]); // filter by department
    await user.click(await screen.findByRole("option", { name: "Stormwater" }));
    await waitFor(() => {
      expect(screen.getByTestId(`row-asset-${horticultureAsset.id}`)).toHaveTextContent("Stormwater");
    });

    cleanup();
    renderAssetDetails();
    await waitFor(() => expect(screen.getByText("Asset Register")).toBeInTheDocument());

    // Go to edit mode
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expect(screen.getByText("Global ID")).toBeInTheDocument());

    // Ensure standard fields are absent
    expect(screen.queryByText("Mowing Area (m²)")).not.toBeInTheDocument();

    const globalIdInput = screen.getByDisplayValue("SW-123");
    await user.clear(globalIdInput);
    await user.type(globalIdInput, "SW-999");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        `/api/assets/${horticultureAsset.id}`,
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    const patchCall = mocks.fetch.mock.calls.find(
      ([url, init]) => url === `/api/assets/${horticultureAsset.id}` && init?.method === "PATCH"
    );
    expect(JSON.parse(String(patchCall?.[1].body))).toEqual(
      expect.objectContaining({
        globalId: "SW-999"
      })
    );
  });
});