import React, { useCallback } from "react";
import { StyleSheet } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

interface Props {
  html: string;
  onOpenAsset?: (asset: { id: string; name: string }) => void;
}

export function AssetMap({ html, onOpenAsset }: Props) {
  const handleMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "openAsset" && msg.id && onOpenAsset) {
        onOpenAsset({ id: msg.id, name: msg.name });
      }
    } catch {}
  }, [onOpenAsset]);

  return (
    <WebView
      source={{ html }}
      style={styles.map}
      onMessage={handleMessage}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
    />
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
