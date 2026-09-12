import { Feather } from "@expo/vector-icons";
import React, { useRef } from "react";
import {
  Platform,
  type StyleProp,
  TouchableOpacity,
  type ViewStyle,
} from "react-native";

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
  const pointerHandledAt = useRef(0);
  const handlePointerUp = Platform.OS === "web"
    ? (event: { stopPropagation?: () => void }) => {
        event.stopPropagation?.();
        pointerHandledAt.current = Date.now();
        onRemove();
      }
    : undefined;
  const handlePress = () => {
    // React Native Web may emit onPress immediately after pointerup. Safari
    // needs the direct pointer handler inside scroll views, but removal must
    // still run only once.
    if (Platform.OS === "web" && Date.now() - pointerHandledAt.current < 500) return;
    onRemove();
  };
  const webPointerProps = Platform.OS === "web"
    ? ({ onPointerUp: handlePointerUp } as Record<string, unknown>)
    : {};

  return (
    <TouchableOpacity
      {...webPointerProps}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={handlePress}
      style={style}
    >
      <Feather name="x" size={iconSize} color="#fff" />
    </TouchableOpacity>
  );
}