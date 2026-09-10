import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { QueueReadState } from "@/lib/photoQueue";

type PhotoQueueStorageState = QueueReadState | "unknown";

export function PhotoQueueStorageWarning({ state }: { state: PhotoQueueStorageState }) {
  if (state !== "unavailable" && state !== "corrupt") return null;

  const unavailable = state === "unavailable";
  return (
    <View
      testID="photo-queue-storage-warning"
      accessibilityRole="alert"
      style={styles.container}
    >
      <Feather name="alert-triangle" size={16} color="#92400e" />
      <View style={styles.copy}>
        <Text style={styles.title}>Queued photos need attention</Text>
        <Text style={styles.message}>
          {unavailable
            ? "Queued photos are temporarily unavailable. They have not been deleted; try again when storage is available."
            : "Queued photos could not be read. They have not been deleted; do not clear app storage and try again later."}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    margin: 12,
    marginBottom: 0,
    padding: 10,
    borderWidth: 1,
    borderColor: "#f59e0b",
    borderRadius: 8,
    backgroundColor: "#fffbeb",
  },
  copy: { flex: 1, gap: 2 },
  title: {
    color: "#92400e",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  message: {
    color: "#92400e",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
  },
});