import React, { useEffect, useRef } from "react";
import { View } from "react-native";

interface Props {
  html: string;
  onOpenAsset?: (asset: { id: string; name: string }) => void;
}

export function AssetMap({ html, onOpenAsset }: Props) {
  const onOpenAssetRef = useRef(onOpenAsset);
  onOpenAssetRef.current = onOpenAsset;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return;
      try {
        const msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (msg?.type === "openAsset" && msg.id && onOpenAssetRef.current) {
          onOpenAssetRef.current({ id: msg.id, name: msg.name });
        }
      } catch {}
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        style={{ flex: 1, width: "100%", height: "100%", border: "none" } as any}
        sandbox="allow-scripts"
      />
    </View>
  );
}
