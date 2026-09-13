import { customFetch } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Image,
  Platform,
  type ImageStyle,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";

export function AuthenticatedPhoto({
  uri,
  token,
  style,
  placeholderColor,
  iconColor,
}: {
  uri: string;
  token: string | null;
  style: StyleProp<ImageStyle>;
  placeholderColor: string;
  iconColor: string;
}) {
  const [webUri, setWebUri] = useState<string | null>(Platform.OS === "web" ? null : uri);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") {
      setWebUri(uri);
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setWebUri(null);
    setFailed(false);
    void customFetch<Blob>(uri, { responseType: "blob", signal: controller.signal })
      .then(blob => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setWebUri(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [uri]);

  if (failed) {
    return (
      <View
        accessibilityLabel="Photo unavailable"
        style={[
          style as StyleProp<ViewStyle>,
          { alignItems: "center", justifyContent: "center", backgroundColor: placeholderColor },
        ]}
      >
        <Feather name="image" size={20} color={iconColor} />
      </View>
    );
  }
  if (!webUri) {
    return (
      <View
        accessibilityLabel="Loading photo"
        style={[style as StyleProp<ViewStyle>, { backgroundColor: placeholderColor }]}
      />
    );
  }
  return (
    <Image
      source={{
        uri: webUri,
        ...(Platform.OS !== "web" && token
          ? { headers: { Authorization: `Bearer ${token}` } }
          : {}),
      }}
      style={style}
    />
  );
}