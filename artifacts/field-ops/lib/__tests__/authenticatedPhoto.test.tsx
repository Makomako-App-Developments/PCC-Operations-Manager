import { createRoot, type Root } from "react-dom/client";
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const customFetch = vi.hoisted(() => vi.fn());

vi.mock("@workspace/api-client-react", () => ({ customFetch }));
vi.mock("@expo/vector-icons", () => ({ Feather: () => null }));
vi.mock("react-native", async () => {
  const ReactModule = await import("react");
  return {
    Platform: { OS: "web" },
    View: ({ children, accessibilityLabel }: {
      children?: React.ReactNode;
      accessibilityLabel?: string;
    }) => ReactModule.createElement("div", { "aria-label": accessibilityLabel }, children),
    Image: ({ source }: { source: { uri: string } }) => ReactModule.createElement("img", { src: source.uri }),
  };
});

import { AuthenticatedPhoto } from "@/components/AuthenticatedPhoto";

describe("AuthenticatedPhoto on web", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    customFetch.mockReset();
    customFetch.mockResolvedValue(new Blob(["protected photo"], { type: "image/jpeg" }));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:authenticated-infill-photo"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("fetches a protected photo through the authenticated client and revokes its object URL", async () => {
    await act(async () => {
      root.render(
        <AuthenticatedPhoto
          uri="/api/uploads/uploads/infill-photo.jpg"
          token="field-token"
          style={{ width: 72, height: 72 }}
          placeholderColor="#fff"
          iconColor="#666"
        />,
      );
      await Promise.resolve();
    });

    expect(customFetch).toHaveBeenCalledWith(
      "/api/uploads/uploads/infill-photo.jpg",
      expect.objectContaining({ responseType: "blob", signal: expect.any(AbortSignal) }),
    );
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(container.innerHTML).toContain("blob:authenticated-infill-photo");

    act(() => root.unmount());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:authenticated-infill-photo");
    root = createRoot(container);
  });
});