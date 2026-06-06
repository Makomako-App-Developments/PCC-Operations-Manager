import React from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

interface Props {
  html: string;
  height?: number;
}

export function AuditMap({ html, height = 190 }: Props) {
  return (
    <WebView
      source={{ html }}
      style={[styles.map, { height }]}
      scrollEnabled={false}
      originWhitelist={["*"]}
    />
  );
}

const styles = StyleSheet.create({
  map: { width: "100%" },
});
