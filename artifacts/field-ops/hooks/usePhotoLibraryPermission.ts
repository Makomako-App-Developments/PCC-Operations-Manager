import { Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

/**
 * Requests media library permission and returns true if granted.
 *
 * On Android, when the permission is denied (including permanently blocked),
 * shows a descriptive alert explaining why the app needs access and offers
 * a direct link to device Settings so the crew member can fix it themselves.
 *
 * On iOS the system already displays its own permission dialogue; we only
 * show a minimal fallback alert when the user has previously denied it
 * (iOS behaviour is intentionally left unchanged from before).
 */
export async function requestMediaLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (status === "granted") return true;

  if (Platform.OS === "android") {
    Alert.alert(
      "Photo library access required",
      "GardenOps needs access to your photo library to attach photos to jobs and reports.\n\nTap 'Open Settings', then enable 'Photos and videos' (Android 13+) or 'Storage' (Android 12).",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]
    );
  } else {
    Alert.alert("Permission needed", "Please allow photo library access in Settings.");
  }

  return false;
}
