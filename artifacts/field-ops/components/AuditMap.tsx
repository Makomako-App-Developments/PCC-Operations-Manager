import React from "react";
import { StyleSheet } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

interface Props {
  html: string;
  height?: number;
  onAssetSelect?: (asset: { id: string; name: string }) => void;
}

export function AuditMap({ html, height = 190, onAssetSelect }: Props) {
  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "selectAsset" && onAssetSelect) {
        onAssetSelect({ id: msg.id, name: msg.name });
      }
    } catch {}
  };

  return (
    <WebView
      source={{ html }}
      style={[styles.map, { height }]}
      scrollEnabled={false}
      originWhitelist={["*"]}
      onMessage={handleMessage}
    />
  );
}

const styles = StyleSheet.create({
  map: { width: "100%" },
});
