import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { usePathname } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";

export function BugReportButton() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!user) return null;

  const deviceInfo = {
    platform: Platform.OS,
    version: Platform.Version,
    appVersion: Constants.expoConfig?.version ?? "unknown",
    expoSdkVersion: Constants.expoConfig?.sdkVersion ?? "unknown",
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      await fetch(getApiUrl("/api/bug-reports"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          description: description.trim(),
          route: pathname,
          deviceInfo,
          username: user.name,
          userRole: user.role,
          appVersion: deviceInfo.appVersion,
          occurredAt: new Date().toISOString(),
        }),
      });
      setSubmitted(true);
      setDescription("");
      setTimeout(() => {
        setSubmitted(false);
        setOpen(false);
      }, 2500);
    } catch {
      Alert.alert(
        "Couldn't send report",
        "Please try again when you have a connection.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setDescription("");
    setSubmitted(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            bottom: insets.bottom + (Platform.OS === "web" ? 84 : 84) + 16,
          },
        ]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        accessibilityLabel="Report a problem"
      >
        <Feather name="alert-octagon" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>

      {open && (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={handleClose}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <View
                style={[
                  styles.header,
                  {
                    backgroundColor: colors.card,
                    borderBottomColor: colors.border,
                    paddingTop: insets.top + 16,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colors.foreground }]}>
                    Report a Problem
                  </Text>
                  <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                    Help us fix it — describe what happened
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleClose}
                  style={{ padding: 4 }}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={22} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.body}
                keyboardShouldPersistTaps="handled"
              >
                {submitted ? (
                  <View style={[styles.successBox, { backgroundColor: "#dcfce7", borderRadius: colors.radius }]}>
                    <Feather name="check-circle" size={28} color="#16a34a" />
                    <Text style={styles.successText}>
                      Thanks — we've got your report!
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>
                      What were you doing when this happened?
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          color: colors.foreground,
                          borderColor: description.trim()
                            ? colors.primary
                            : colors.border,
                          backgroundColor: colors.card,
                          borderRadius: colors.radius,
                        },
                      ]}
                      value={description}
                      onChangeText={setDescription}
                      placeholder="e.g. I tapped the camera button and nothing happened…"
                      placeholderTextColor={colors.mutedForeground}
                      multiline
                      numberOfLines={5}
                      textAlignVertical="top"
                      autoFocus
                    />

                    <View
                      style={[
                        styles.metaCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          borderRadius: colors.radius,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.metaTitle, { color: colors.mutedForeground }]}
                      >
                        Sent automatically with your report
                      </Text>
                      <MetaRow icon="user" label="User" value={user.name} colors={colors} />
                      <MetaRow icon="map-pin" label="Screen" value={pathname} colors={colors} />
                      <MetaRow icon="smartphone" label="Device" value={`${Platform.OS} ${Platform.Version}`} colors={colors} />
                      <MetaRow icon="clock" label="Time" value={new Date().toLocaleTimeString()} colors={colors} />
                    </View>
                  </>
                )}
              </ScrollView>

              {!submitted && (
                <View
                  style={[
                    styles.footer,
                    {
                      backgroundColor: colors.card,
                      borderTopColor: colors.border,
                      paddingBottom: insets.bottom + 16,
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.cancelBtn,
                      { borderColor: colors.border, borderRadius: colors.radius },
                    ]}
                    onPress={handleClose}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.submitBtn,
                      {
                        backgroundColor: description.trim()
                          ? colors.primary
                          : colors.muted,
                        borderRadius: colors.radius,
                        opacity: submitting ? 0.7 : 1,
                      },
                    ]}
                    onPress={handleSubmit}
                    disabled={!description.trim() || submitting}
                    activeOpacity={0.85}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Feather name="send" size={15} color="#fff" />
                        <Text style={styles.submitText}>Send Report</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </>
  );
}

function MetaRow({
  icon,
  label,
  value,
  colors,
}: {
  icon: string;
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={styles.metaRow}>
      <Feather name={icon as any} size={12} color={colors.mutedForeground} />
      <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: colors.foreground }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    zIndex: 50,
  },
  modal: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 20, marginBottom: 2 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 13 },
  body: { padding: 20, gap: 14 },
  label: { fontFamily: "Inter_500Medium", fontSize: 13 },
  input: {
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 120,
  },
  metaCard: {
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  metaTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaLabel: { fontFamily: "Inter_400Regular", fontSize: 12, width: 52 },
  metaValue: { fontFamily: "Inter_500Medium", fontSize: 12, flex: 1 },
  successBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 16,
    marginTop: 40,
  },
  successText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#16a34a",
    textAlign: "center",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderWidth: 1,
  },
  cancelText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  submitBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
  },
  submitText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },
});
