import { customFetch } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

interface LoginResponse {
  user: {
    id: string;
    name: string;
    initials: string;
    role: string;
    teamId: string | null;
  };
  accessToken: string;
}

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await customFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await login(result.accessToken, result.user);
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View
        style={[
          styles.inner,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0),
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0),
          },
        ]}
      >
        <View style={styles.hero}>
          <View
            style={[
              styles.logoMark,
              { backgroundColor: colors.primary, borderRadius: colors.radius * 2 },
            ]}
          >
            <Text style={styles.logoText}>PCC</Text>
          </View>
          <Text style={[styles.appTitle, { color: colors.navy }]}>
            GardenOps Field
          </Text>
          <Text style={[styles.appSubtitle, { color: colors.mutedForeground }]}>
            Porirua City Council
          </Text>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius * 2,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Sign in
          </Text>

          {error ? (
            <View
              style={[
                styles.errorBanner,
                { backgroundColor: "#fee2e2", borderRadius: colors.radius },
              ]}
            >
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Email
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.foreground,
                  borderRadius: colors.radius,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@poriruacity.govt.nz"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Password
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.foreground,
                  borderRadius: colors.radius,
                },
              ]}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.loginButton,
              {
                backgroundColor: loading ? colors.muted : colors.primary,
                borderRadius: colors.radius,
              },
            ]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          Porirua City Council · Parks & Gardens
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    gap: 24,
  },
  hero: {
    alignItems: "center",
    gap: 8,
  },
  logoMark: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  logoText: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: "#fff",
    letterSpacing: 1,
  },
  appTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
  },
  appSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  card: {
    borderWidth: 1,
    padding: 24,
    gap: 16,
  },
  cardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    marginBottom: 4,
  },
  errorBanner: {
    padding: 12,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#b91c1c",
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  loginButton: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  loginButtonText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  footer: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
  },
});
