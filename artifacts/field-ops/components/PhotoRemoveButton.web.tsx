import React from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

export function PhotoRemoveButton({
  onRemove,
  accessibilityLabel,
  testID,
  style,
  iconSize = 12,
}: {
  onRemove: () => void;
  accessibilityLabel: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
}) {
  const flattened = StyleSheet.flatten(style) as React.CSSProperties;
  return (
    <button
      type="button"
      data-testid={testID}
      aria-label={accessibilityLabel}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onRemove();
      }}
      style={{
        ...flattened,
        display: "flex",
        padding: 0,
        cursor: "pointer",
        pointerEvents: "auto",
        touchAction: "manipulation",
        WebkitAppearance: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span aria-hidden style={{ color: "#fff", fontSize: iconSize, fontWeight: 700, lineHeight: 1 }}>
        ×
      </span>
    </button>
  );
}