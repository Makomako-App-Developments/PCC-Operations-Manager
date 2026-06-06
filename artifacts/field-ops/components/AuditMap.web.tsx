import React from "react";
import { View } from "react-native";

interface Props {
  html: string;
  height?: number;
}

export function AuditMap({ html, height = 190 }: Props) {
  return (
    <View style={{ height, width: "100%" }}>
      <iframe
        srcDoc={html}
        style={{ height: "100%", width: "100%", border: "none" } as any}
        sandbox="allow-scripts allow-same-origin"
      />
    </View>
  );
}
