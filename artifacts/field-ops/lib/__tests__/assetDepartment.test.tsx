import { createRoot, type Root } from "react-dom/client";
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useGetAsset: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetAsset: mocks.useGetAsset,
}));

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "asset-field-department" }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

vi.mock("react-native", async () => {
  const React = await import("react");
  const element = (tag: string) =>
    ({
      children,
      style: _style,
      onPress: _onPress,
      activeOpacity: _activeOpacity,
      ...props
    }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement(tag, props, children);
  return {
    ActivityIndicator: element("span"),
    Platform: { OS: "web" },
    ScrollView: element("div"),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: element("span"),
    TouchableOpacity: element("button"),
    View: element("div"),
    useWindowDimensions: () => ({ height: 900, width: 400 }),
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@/components/BoundaryMap", () => ({
  BoundaryMap: () => null,
}));

vi.mock("@/context/auth", () => ({
  useAuth: () => ({ user: { role: "field_worker" } }),
}));

vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#fff",
    border: "#ddd",
    foreground: "#111",
    mutedForeground: "#666",
    primary: "#00AECD",
    radius: 8,
  }),
}));

vi.mock("@/lib/lastAsset", () => ({
  setLastAssetId: vi.fn(),
}));

vi.mock("@/lib/jobDetailCache", () => ({
  loadCachedAsset: vi.fn().mockResolvedValue(undefined),
  saveCachedAsset: vi.fn().mockResolvedValue(undefined),
}));

import AssetDetailScreen from "../../app/asset/[id]";

const fieldAsset = {
  id: "asset-field-department",
  name: "Harbour Edge Site",
  description: "Created by the manager flow",
  department: "litter",
  departmentDetails: { cleaningType: "litter_bin" },
  areaM2: "180",
  serviceTimeMins: 45,
  frequency: "monthly",
  siteType: "park",
  standard: null,
  gardenType: null,
  lat: null,
  lng: null,
  boundary: null,
};

let root: Root | undefined;

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  mocks.useGetAsset.mockReturnValue({
    data: fieldAsset,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("signed-in Field Ops department display", () => {
  it("shows the saved department and specification read-only to a field worker", async () => {
    await act(async () => {
      root = createRoot(document.getElementById("root")!);
      root.render(<AssetDetailScreen />);
    });

    const rendered = document.body.textContent ?? "";
    expect(rendered).toContain("Department / Function");
    expect(rendered).toContain("Litter");
    expect(rendered).toContain("Litter bin");
    expect(rendered).not.toContain("Edit");
  });
});