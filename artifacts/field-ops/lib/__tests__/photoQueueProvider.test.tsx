import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readQueuedPhotos: vi.fn(),
  warningProps: null as null | {
    state: string;
    isRetrying: boolean;
    onRetry: () => void;
  },
}));

vi.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
  Platform: { OS: "web" },
}));

vi.mock("../photoQueue", () => ({
  attemptUpload: vi.fn(),
  QueueStorageReadError: class QueueStorageReadError extends Error {},
  readQueuedPhotos: mocks.readQueuedPhotos,
  removeFromQueue: vi.fn(),
}));

vi.mock("@/components/PhotoQueueStorageWarning", () => ({
  PhotoQueueStorageWarning: (props: typeof mocks.warningProps) => {
    mocks.warningProps = props;
    return null;
  },
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
    mocks.warningProps = null;
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

    expect(mocks.warningProps?.state).toBe("unavailable");

    act(() => mocks.warningProps?.onRetry());
    expect(mocks.warningProps?.isRetrying).toBe(true);
    expect(mocks.readQueuedPhotos).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRead?.({ state: "available", items: [] });
      await Promise.resolve();
    });

    expect(mocks.warningProps?.state).toBe("available");
    expect(mocks.warningProps?.isRetrying).toBe(false);
  });

  it("keeps the warning actionable after an unexpected read failure", async () => {
    mocks.readQueuedPhotos.mockRejectedValueOnce(new Error("read failed"));

    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <PhotoQueueProvider>
            <StorageFailureReporter />
          </PhotoQueueProvider>
        </QueryClientProvider>,
      );
    });

    await act(async () => {
      mocks.warningProps?.onRetry();
      await Promise.resolve();
    });

    expect(mocks.warningProps?.state).toBe("unavailable");
    expect(mocks.warningProps?.isRetrying).toBe(false);
  });
});