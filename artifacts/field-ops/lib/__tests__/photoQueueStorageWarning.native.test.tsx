import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

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
    Pressable: nativeElement("Pressable"),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: nativeElement("Text"),
    View: nativeElement("View"),
  };
});

import { PhotoQueueStorageWarning } from "@/components/PhotoQueueStorageWarning";

describe("PhotoQueueStorageWarning on native", () => {
  it("renders the retry control with native accessibility props and invokes it", () => {
    const onRetry = vi.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <PhotoQueueStorageWarning
          state="unavailable"
          isRetrying={false}
          onRetry={onRetry}
        />,
      );
    });

    expect(renderer.toJSON()).not.toBeNull();

    const warning = renderer.root.findByProps({
      testID: "photo-queue-storage-warning",
    });
    const retry = renderer.root.findByProps({
      testID: "photo-queue-storage-retry",
    });

    expect(warning.props.accessibilityRole).toBe("alert");
    expect(retry.props.accessibilityRole).toBe("button");
    expect(retry.props.accessibilityLabel).toBe("Retry reading queued photos");
    expect(retry.props.disabled).toBe(false);

    act(() => retry.props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables retry and shows the native loading indicator while retrying", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <PhotoQueueStorageWarning
          state="corrupt"
          isRetrying={false}
          onRetry={vi.fn()}
        />,
      );
    });

    act(() => {
      renderer.update(
        <PhotoQueueStorageWarning
          state="corrupt"
          isRetrying
          onRetry={vi.fn()}
        />,
      );
    });

    const retry = renderer.root.findByProps({
      testID: "photo-queue-storage-retry",
    });
    expect(retry.props.disabled).toBe(true);
    expect(retry.props.accessibilityRole).toBe("button");
    expect(retry.props.accessibilityLabel).toBe("Retry reading queued photos");
    expect(
      renderer.root.findByProps({
        testID: "photo-queue-storage-retry-loading",
      }).props.size,
    ).toBe("small");
  });
});