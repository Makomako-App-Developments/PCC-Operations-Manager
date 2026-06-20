import React, { useEffect, useRef } from "react";
import { View } from "react-native";

interface Props {
  html: string;
  height?: number;
  onAssetSelect?: (asset: { id: string; name: string }) => void;
}

export function AuditMap({ html, height = 190, onAssetSelect }: Props) {
  const onAssetSelectRef = useRef(onAssetSelect);
  onAssetSelectRef.current = onAssetSelect;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return;
      try {
        const msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (msg?.type === "selectAsset" && onAssetSelectRef.current) {
          onAssetSelectRef.current({ id: msg.id, name: msg.name });
        }
      } catch {}
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <View style={{ height, width: "100%" }}>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        style={{ height: "100%", width: "100%", border: "none" } as any}
        sandbox="allow-scripts"
      />
    </View>
  );
}
