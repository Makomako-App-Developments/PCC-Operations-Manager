import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@expo/vector-icons", () => ({
  Feather: (props: Record<string, unknown>) => React.createElement("Icon", props),
}));

vi.mock("react-native", () => {
  const element = (type: string) =>
    ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement(type, props, children);
  return {
    ActivityIndicator: element("ActivityIndicator"),
    Modal: element("Modal"),
    Platform: { OS: "web" },
    Pressable: element("Pressable"),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: element("Text"),
    TouchableOpacity: element("TouchableOpacity"),
    View: element("View"),
  };
});

import { PhotoQueueActions } from "@/components/PhotoQueueActions";
import { PhotoRemoveButton } from "@/components/PhotoRemoveButton";
import { pickWebCameraPhoto } from "@/lib/webPhotoPicker";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("web PWA photo source picker", () => {
  it("removes a photo on Safari pointer-up without double-running the following press", () => {
    const onRemove = vi.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <PhotoRemoveButton
          accessibilityLabel="Remove before photo"
          onRemove={onRemove}
        />,
      );
    });
    const button = renderer.root.findByType("TouchableOpacity" as never);
    act(() => {
      button.props.onPointerUp({ stopPropagation: vi.fn() });
      button.props.onPress();
    });
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("shows one add action and routes camera, gallery, and cancel choices", () => {
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

    const add = renderer.root.findByProps({ testID: "photo-queue-add-action" });
    expect(renderer.root.findAllByProps({ testID: "photo-queue-camera-action" })).toHaveLength(0);
    act(() => add.props.onPress());
    act(() => renderer.root.findByProps({ testID: "photo-source-camera" }).props.onPress());
    expect(onTakePhoto).toHaveBeenCalledOnce();

    act(() => add.props.onPress());
    act(() => renderer.root.findByProps({ testID: "photo-source-library" }).props.onPress());
    expect(onPickFromLibrary).toHaveBeenCalledOnce();

    act(() => add.props.onPress());
    act(() => renderer.root.findByProps({ testID: "photo-source-cancel" }).props.onPress());
    expect(renderer.root.findAllByProps({ testID: "photo-source-cancel" })).toHaveLength(0);
  });

  it("creates an Android-compatible rear-camera file input and returns its File", async () => {
    const picker = pickWebCameraPhoto();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.accept).toBe("image/*");
    expect(input.getAttribute("capture")).toBe("environment");

    const file = new File(["camera-bytes"], "android-camera.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new Event("change"));
    const source = await picker;

    expect(source?.file).toBe(file);
    expect(source?.fileName).toBe("android-camera.jpg");
    expect(source?.mimeType).toBe("image/jpeg");
    expect(source?.fileSize).toBe(file.size);
    expect(document.body.contains(input)).toBe(false);
  });
});