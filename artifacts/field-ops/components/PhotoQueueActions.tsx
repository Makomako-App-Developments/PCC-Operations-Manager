import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
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
  const [showSource, setShowSource] = React.useState(false);
  if (Platform.OS === "web") {
    return (
      <View style={containerStyle}>
        <TouchableOpacity
          testID="photo-queue-add-action"
          accessibilityRole="button"
          accessibilityLabel="Add a photo"
          style={buttonStyle}
          onPress={() => setShowSource(true)}
          activeOpacity={0.8}
          disabled={isPending}
        >
          {isPending ? <ActivityIndicator size="small" color={iconColor} /> : <Feather name="camera" size={15} color={iconColor} />}
          <Text style={textStyle}>Add photo</Text>
        </TouchableOpacity>
        <PhotoSourceModal
          visible={showSource}
          onCancel={() => setShowSource(false)}
          onTakePhoto={() => { setShowSource(false); onTakePhoto(); }}
          onPickFromLibrary={() => { setShowSource(false); onPickFromLibrary(); }}
        />
      </View>
    );
  }
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

export function PhotoSourceModal({
  visible,
  onTakePhoto,
  onPickFromLibrary,
  onCancel,
}: {
  visible: boolean;
  onTakePhoto: () => void;
  onPickFromLibrary: () => void;
  onCancel: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Add photo</Text>
          <TouchableOpacity testID="photo-source-camera" style={styles.action} onPress={onTakePhoto}>
            <Feather name="camera" size={20} color="#fff" />
            <Text style={styles.actionText}>Take photo</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="photo-source-library" style={styles.action} onPress={onPickFromLibrary}>
            <Feather name="image" size={20} color="#fff" />
            <Text style={styles.actionText}>Choose from gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="photo-source-cancel" style={styles.cancel} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.55)", padding: 16 },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 18, gap: 12 },
  title: { color: "#0f2936", fontSize: 20, fontWeight: "700" },
  action: { minHeight: 52, borderRadius: 12, backgroundColor: "#08afc5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  actionText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  cancel: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  cancelText: { color: "#334155", fontSize: 14, fontWeight: "600" },
});