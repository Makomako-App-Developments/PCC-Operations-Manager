import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readQueuedPhotos: vi.fn(),
  flushStormQueue: vi.fn(),
  authState: { user: { id: "user-one" }, isLoading: false },
}));

vi.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

vi.mock("react-native", async () => {
  const React = await import("react");
  const element = (tag: string) =>
    ({
      accessibilityLabel,
      accessibilityRole,
      children,
      disabled,
      onPress,
      style: _style,
      testID,
      ...props
    }: {
      accessibilityLabel?: string;
      accessibilityRole?: string;
      children?: React.ReactNode;
      disabled?: boolean;
      onPress?: () => void;
      style?: unknown | ((state: { pressed: boolean }) => unknown);
      testID?: string;
      [key: string]: unknown;
    }) => React.createElement(tag, {
      ...props,
      "aria-label": accessibilityLabel,
      "data-testid": testID,
      disabled,
      onClick: onPress,
      role: accessibilityRole,
    }, children);

  return {
    ActivityIndicator: element("span"),
    AppState: { addEventListener: () => ({ remove: vi.fn() }) },
    Platform: { OS: "web" },
    Pressable: element("button"),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: element("span"),
    View: element("div"),
  };
});

vi.mock("../photoQueue", () => ({
  flushQueuedPhoto: vi.fn(),
  QueueStorageReadError: class QueueStorageReadError extends Error {},
  readQueuedPhotos: mocks.readQueuedPhotos,
}));
vi.mock("@/context/auth", () => ({
  useAuth: () => mocks.authState,
}));
vi.mock("@/lib/stormPatrolQueue", () => ({
  flushStormQueue: mocks.flushStormQueue,
}));

import {
  PhotoQueueProvider,
  usePhotoQueueContext,
} from "@/context/PhotoQueueProvider";

let root: Root;
let container: HTMLDivElement;

function StorageFailureReporter() {
  const { reportStorageState } = usePhotoQueueContext();
  React.useEffect(() => reportStorageState("unavailable"), [reportStorageState]);
  return null;
}

describe("PhotoQueueProvider storage retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.readQueuedPhotos.mockReset();
    mocks.flushStormQueue.mockReset().mockResolvedValue([]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("re-reads without writing, shows loading, and clears the warning when storage recovers", async () => {
    let resolveRead: ((value: { state: "available"; items: [] }) => void) | undefined;
    mocks.readQueuedPhotos.mockReturnValue(new Promise(resolve => {
      resolveRead = resolve;
    }));

    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <PhotoQueueProvider>
            <StorageFailureReporter />
          </PhotoQueueProvider>
        </QueryClientProvider>,
      );
    });

    const warning = document.querySelector('[data-testid="photo-queue-storage-warning"]');
    const retry = document.querySelector(
      '[data-testid="photo-queue-storage-retry"]',
    ) as HTMLButtonElement;
    expect(warning).not.toBeNull();
    expect(warning?.getAttribute("role")).toBe("alert");
    expect(retry.getAttribute("role")).toBe("button");
    expect(retry.getAttribute("aria-label")).toBe("Retry reading queued photos");
    expect(retry.disabled).toBe(false);

    act(() => retry.click());
    expect(retry.disabled).toBe(true);
    expect(document.querySelector(
      '[data-testid="photo-queue-storage-retry-loading"]',
    )).not.toBeNull();
    expect(mocks.readQueuedPhotos).toHaveBeenCalledTimes(2);

    act(() => retry.click());
    expect(mocks.readQueuedPhotos).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveRead?.({ state: "available", items: [] });
      await Promise.resolve();
    });

    expect(document.querySelector(
      '[data-testid="photo-queue-storage-warning"]',
    )).toBeNull();
  });

  it("keeps the warning actionable after an unexpected read failure", async () => {
    mocks.readQueuedPhotos.mockRejectedValue(new Error("read failed"));

    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <PhotoQueueProvider>
            <StorageFailureReporter />
          </PhotoQueueProvider>
        </QueryClientProvider>,
      );
    });

    const retry = document.querySelector(
      '[data-testid="photo-queue-storage-retry"]',
    ) as HTMLButtonElement;

    await act(async () => {
      retry.click();
      await Promise.resolve();
    });

    const retryAfterFailure = document.querySelector(
      '[data-testid="photo-queue-storage-retry"]',
    ) as HTMLButtonElement;
    expect(document.querySelector(
      '[data-testid="photo-queue-storage-warning"]',
    )).not.toBeNull();
    expect(retryAfterFailure.disabled).toBe(false);
    expect(retryAfterFailure.textContent).toContain("Retry");
    expect(document.querySelector(
      '[data-testid="photo-queue-storage-retry-loading"]',
    )).toBeNull();
  });

  it("retries Storm Patrol globally on startup and browser reconnect", async () => {
    mocks.readQueuedPhotos.mockResolvedValue({ state: "empty", items: [] });

    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <PhotoQueueProvider><div /></PhotoQueueProvider>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
    expect(mocks.flushStormQueue).toHaveBeenCalledWith("user-one");

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    expect(mocks.flushStormQueue).toHaveBeenCalledTimes(2);
  });
});