import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type Status =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped"
  | "overdue"
  | "raised"
  | "assigned"
  | "cancelled";

const LABEL: Record<Status, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  skipped: "Skipped",
  overdue: "Overdue",
  raised: "Raised",
  assigned: "Assigned",
  cancelled: "Cancelled",
};

interface Props {
  status: Status;
  small?: boolean;
}

export function StatusBadge({ status, small }: Props) {
  const colors = useColors();

  const bg: Record<Status, string> = {
    pending: colors.muted,
    in_progress: "#dbeafe",
    completed: "#dcfce7",
    skipped: colors.muted,
    overdue: "#fee2e2",
    raised: "#fef9c3",
    assigned: "#dbeafe",
    cancelled: colors.muted,
  };

  const fg: Record<Status, string> = {
    pending: colors.mutedForeground,
    in_progress: "#1d4ed8",
    completed: "#15803d",
    skipped: colors.mutedForeground,
    overdue: "#b91c1c",
    raised: "#92400e",
    assigned: "#1d4ed8",
    cancelled: colors.mutedForeground,
  };

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bg[status] ?? colors.muted,
          paddingHorizontal: small ? 6 : 8,
          paddingVertical: small ? 2 : 3,
          borderRadius: small ? 4 : 6,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: fg[status] ?? colors.mutedForeground,
            fontSize: small ? 10 : 11,
          },
        ]}
      >
        {LABEL[status] ?? status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
  },
  text: {
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
});
