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

/**
 * Requests camera permission and returns true if granted.
 *
 * On Android, when the permission is denied (including permanently blocked),
 * shows a descriptive alert explaining why the app needs access and offers
 * a direct link to device Settings so the crew member can fix it themselves.
 *
 * On iOS the system already displays its own permission dialogue; we only
 * show a minimal fallback alert when the user has previously denied it
 * (iOS behaviour is intentionally left unchanged from before).
 */
export async function requestCameraPermission(): Promise<boolean> {
  try {
    // Android 16 can leave requestCameraPermissionsAsync unresolved after an
    // Android security update when permission is already granted. Reading the
    // current state first lets existing users proceed straight to the camera.
    let permission = await ImagePicker.getCameraPermissionsAsync();

    if (permission.granted) return true;

    if (permission.canAskAgain) {
      permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.granted) return true;
    }

    if (Platform.OS === "android") {
      Alert.alert(
        "Camera access required",
        "GardenOps needs access to your camera to take photos for jobs and reports.\n\nTap 'Open Settings', then enable 'Camera' permission for GardenOps.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => { void Linking.openSettings(); } },
        ],
      );
    } else {
      Alert.alert("Permission needed", "Please allow camera access in Settings.");
    }
  } catch {
    Alert.alert(
      "Camera unavailable",
      "GardenOps could not open the camera. Please close and reopen the app, then try again. You can still attach a photo from your library.",
    );
  }

  return false;
}
