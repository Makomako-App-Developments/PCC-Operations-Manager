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
    StyleSheet: { create: (styles: unknown) => styles },
    Text: nativeElement("Text"),
    TouchableOpacity: nativeElement("TouchableOpacity"),
    View: nativeElement("View"),
  };
});

import { PhotoQueueActions } from "@/components/PhotoQueueActions";

describe("PhotoQueueActions on native", () => {
  it("exposes discoverable camera and library actions", () => {
    const onTakePhoto = vi.fn();
    const onPickFromLibrary = vi.fn();
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(
        <PhotoQueueActions
          iconColor="#123456"
          isPending={false}
          onTakePhoto={onTakePhoto}
          onPickFromLibrary={onPickFromLibrary}
        />,
      );
    });

    const camera = renderer.root.findByProps({
      testID: "photo-queue-camera-action",
    });
    const library = renderer.root.findByProps({
      testID: "photo-queue-library-action",
    });

    expect(camera.props.accessibilityRole).toBe("button");
    expect(camera.props.accessibilityLabel).toBe("Take a photo with the camera");
    expect(library.props.accessibilityRole).toBe("button");
    expect(library.props.accessibilityLabel).toBe("Choose a photo from the library");

    act(() => {
      camera.props.onPress();
      library.props.onPress();
    });
    expect(onTakePhoto).toHaveBeenCalledTimes(1);
    expect(onPickFromLibrary).toHaveBeenCalledTimes(1);
  });

  it("keeps both actions disabled while an upload is pending", () => {
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(
        <PhotoQueueActions
          iconColor="#123456"
          isPending
          onTakePhoto={vi.fn()}
          onPickFromLibrary={vi.fn()}
        />,
      );
    });

    expect(renderer.root.findByProps({
      testID: "photo-queue-camera-action",
    }).props.disabled).toBe(true);
    expect(renderer.root.findByProps({
      testID: "photo-queue-library-action",
    }).props.disabled).toBe(true);
  });
});