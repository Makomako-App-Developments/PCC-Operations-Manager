import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readQueuedPhotos: vi.fn(),
}));

vi.mock("@expo/vector-icons", () => ({
  Feather: (props: Record<string, unknown>) => React.createElement("Icon", props),
}));

vi.mock("react-native", () => {
  const nativeElement = (type: string) =>
    ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement(type, props, children);

  return {
    ActivityIndicator: nativeElement("ActivityIndicator"),
    AppState: { addEventListener: () => ({ remove: vi.fn() }) },
    Platform: { OS: "ios" },
    Pressable: nativeElement("Pressable"),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: nativeElement("Text"),
    View: nativeElement("View"),
  };
});

vi.mock("@/lib/photoQueue", () => ({
  attemptUpload: vi.fn(),
  QueueStorageReadError: class QueueStorageReadError extends Error {},
  readQueuedPhotos: mocks.readQueuedPhotos,
  removeFromQueue: vi.fn(),
}));

import {
  PhotoQueueProvider,
  usePhotoQueueContext,
} from "@/context/PhotoQueueProvider";

function StorageFailureReporter() {
  const { reportStorageState } = usePhotoQueueContext();
  React.useEffect(() => reportStorageState("unavailable"), [reportStorageState]);
  return null;
}

function renderProvider() {
  return create(
    <QueryClientProvider client={new QueryClient()}>
      <PhotoQueueProvider>
        <StorageFailureReporter />
      </PhotoQueueProvider>
    </QueryClientProvider>,
  );
}

describe("PhotoQueueProvider storage retry on native", () => {
  let renderer!: ReactTestRenderer;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.readQueuedPhotos.mockReset();
  });

  afterEach(() => {
    act(() => renderer.unmount());
    vi.useRealTimers();
  });

  it("shows loading during a native retry and clears the warning when storage recovers", async () => {
    let resolveRetry: ((value: { state: "available"; items: [] }) => void) | undefined;
    mocks.readQueuedPhotos
      .mockResolvedValueOnce({ state: "unavailable", items: [] })
      .mockReturnValueOnce(new Promise(resolve => {
        resolveRetry = resolve;
      }));

    await act(async () => {
      renderer = renderProvider();
      await Promise.resolve();
    });
    mocks.readQueuedPhotos.mockClear();

    const retry = renderer.root.findByProps({
      testID: "photo-queue-storage-retry",
    });
    expect(renderer.root.findByProps({
      testID: "photo-queue-storage-warning",
    })).not.toBeNull();
    expect(retry.props.disabled).toBe(false);

    act(() => retry.props.onPress());

    expect(mocks.readQueuedPhotos).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({
      testID: "photo-queue-storage-retry",
    }).props.disabled).toBe(true);
    expect(renderer.root.findByProps({
      testID: "photo-queue-storage-retry-loading",
    })).not.toBeNull();

    await act(async () => {
      resolveRetry?.({ state: "available", items: [] });
      await Promise.resolve();
    });

    expect(renderer.root.findAllByProps({
      testID: "photo-queue-storage-warning",
    })).toHaveLength(0);
  });

  it("keeps the native retry actionable when the retried read rejects", async () => {
    mocks.readQueuedPhotos
      .mockResolvedValueOnce({ state: "unavailable", items: [] })
      .mockRejectedValueOnce(new Error("read failed"));

    await act(async () => {
      renderer = renderProvider();
      await Promise.resolve();
    });
    mocks.readQueuedPhotos.mockClear();

    const retry = renderer.root.findByProps({
      testID: "photo-queue-storage-retry",
    });

    await act(async () => {
      retry.props.onPress();
      await Promise.resolve();
    });

    expect(mocks.readQueuedPhotos).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({
      testID: "photo-queue-storage-warning",
    })).not.toBeNull();
    expect(renderer.root.findByProps({
      testID: "photo-queue-storage-retry",
    }).props.disabled).toBe(false);
    expect(renderer.root.findAllByProps({
      testID: "photo-queue-storage-retry-loading",
    })).toHaveLength(0);
  });
});