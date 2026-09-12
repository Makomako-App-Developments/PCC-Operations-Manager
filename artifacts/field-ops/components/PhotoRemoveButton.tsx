import { Feather } from "@expo/vector-icons";
import React from "react";
import {
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
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={onRemove}
      style={style}
    >
      <Feather name="x" size={iconSize} color="#fff" />
    </TouchableOpacity>
  );
}