import React from "react";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

export default function IndexScreen() {
  const { isLoading } = useAuth();
  const colors = useColors();

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      {isLoading && <ActivityIndicator color={colors.primary} size="large" />}
    </View>
  );
}
