import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  StyleProp,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";

interface PhotoQueueActionsProps {
  containerStyle?: StyleProp<ViewStyle>;
  buttonStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  iconColor: string;
  isPending: boolean;
  onTakePhoto: () => void;
  onPickFromLibrary: () => void;
}

export function PhotoQueueActions({
  containerStyle,
  buttonStyle,
  textStyle,
  iconColor,
  isPending,
  onTakePhoto,
  onPickFromLibrary,
}: PhotoQueueActionsProps) {
  return (
    <View style={containerStyle}>
      <TouchableOpacity
        testID="photo-queue-camera-action"
        accessibilityRole="button"
        accessibilityLabel="Take a photo with the camera"
        style={buttonStyle}
        onPress={onTakePhoto}
        activeOpacity={0.8}
        disabled={isPending}
      >
        <Feather name="camera" size={15} color={iconColor} />
        <Text style={textStyle}>Camera</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="photo-queue-library-action"
        accessibilityRole="button"
        accessibilityLabel="Choose a photo from the library"
        style={buttonStyle}
        onPress={onPickFromLibrary}
        activeOpacity={0.8}
        disabled={isPending}
      >
        {isPending ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <>
            <Feather name="image" size={15} color={iconColor} />
            <Text style={textStyle}>Library</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}