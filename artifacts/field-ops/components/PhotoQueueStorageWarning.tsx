import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import type { QueueReadState } from "@/lib/photoQueue";

type PhotoQueueStorageState = QueueReadState | "unknown";

interface PhotoQueueStorageWarningProps {
  state: PhotoQueueStorageState;
  isRetrying: boolean;
  onRetry: () => void;
  legacyCount?: number;
  onClaimLegacy?: () => void;
}

export function PhotoQueueStorageWarning({
  state,
  isRetrying,
  onRetry,
  legacyCount = 0,
  onClaimLegacy,
}: PhotoQueueStorageWarningProps) {
  const hasLegacy = legacyCount > 0;
  if (state !== "unavailable" && state !== "corrupt" && !hasLegacy) return null;

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
          {hasLegacy
            ? `${legacyCount} queued photo${legacyCount === 1 ? "" : "s"} from an earlier version are paused. Resume only if they are yours.`
            : unavailable
            ? "Queued photos are temporarily unavailable. They have not been deleted; try again when storage is available."
            : "Queued photos could not be read. They have not been deleted; do not clear app storage and try again later."}
        </Text>
      </View>
      <Pressable
        testID="photo-queue-storage-retry"
        accessibilityRole="button"
        accessibilityLabel={hasLegacy ? "Resume my earlier queued photos" : "Retry reading queued photos"}
        disabled={isRetrying}
        onPress={hasLegacy ? onClaimLegacy : onRetry}
        style={({ pressed }) => [
          styles.retry,
          (pressed || isRetrying) && styles.retryDisabled,
        ]}
      >
        {isRetrying
          ? <ActivityIndicator testID="photo-queue-storage-retry-loading" size="small" color="#92400e" />
          : <Text style={styles.retryText}>{hasLegacy ? "Resume mine" : "Retry"}</Text>}
      </Pressable>
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
  retry: {
    minHeight: 32,
    minWidth: 54,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#92400e",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  retryDisabled: {
    opacity: 0.6,
  },
  retryText: {
    color: "#92400e",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
});
