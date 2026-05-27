import { Feather } from "@expo/vector-icons";
import { useGetScheduleWeek } from "@workspace/api-client-react";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { JobCard } from "@/components/JobCard";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

const TODAY = new Date().toISOString().split("T")[0]!;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function formatDate(date: Date) {
  return `${DAY_NAMES[date.getDay()]}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data, isLoading, refetch, isRefetching } = useGetScheduleWeek(
    {
      week: TODAY,
      ...(user?.teamId ? { teamId: user.teamId } : {}),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: !!user } as any },
  );

  const todayJobs = useMemo(() => {
    if (!data?.days) return [];
    const day = data.days.find((d) => d.date === TODAY);
    return day?.jobs ?? [];
  }, [data]);

  const pendingJobs = todayJobs.filter(
    (j) => j.status === "pending" || j.status === "in_progress" || j.status === "paused" || j.status === "overdue",
  );
  const doneJobs = todayJobs.filter(
    (j) => j.status === "completed" || j.status === "skipped",
  );

  const topPad =
    insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 84);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.navy,
            paddingTop: topPad + 16,
          },
        ]}
      >
        <Text style={styles.greeting}>
          {getGreeting()}, {user?.name?.split(" ")[0] ?? "there"}
        </Text>
        <Text style={styles.dateLabel}>{formatDate(new Date())}</Text>

        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{pendingJobs.length}</Text>
            <Text style={styles.statLabel}>Remaining</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: "rgba(255,255,255,0.2)" }]} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{doneJobs.length}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: "rgba(255,255,255,0.2)" }]} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{todayJobs.length}</Text>
            <Text style={styles.statLabel}>Total Today</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomPad },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator
            style={{ marginTop: 48 }}
            color={colors.primary}
            size="large"
          />
        ) : todayJobs.length === 0 ? (
          <EmptyState
            icon="check-circle"
            title="No jobs scheduled today"
            subtitle="Enjoy the day or check with your supervisor."
          />
        ) : (
          <>
            {pendingJobs.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Feather name="clock" size={14} color={colors.primary} />
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    Up Next
                  </Text>
                  <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
                    {pendingJobs.length}
                  </Text>
                </View>
                {pendingJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    id={job.id}
                    assetName={job.assetName}
                    assetDesc={(job as any).assetDesc}
                    gardenType={job.gardenType}
                    suburb={(job as any).suburb}
                    streetAddress={(job as any).streetAddress}
                    lat={(job as any).lat}
                    lng={(job as any).lng}
                    serviceTimeMins={job.serviceTimeMins}
                    status={job.status}
                    scheduledDate={job.scheduledDate}
                    isAllTeams={(job as any).isAllTeams ?? false}
                  />
                ))}
              </View>
            )}
            {doneJobs.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Feather name="check-circle" size={14} color={colors.success} />
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    Completed
                  </Text>
                  <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
                    {doneJobs.length}
                  </Text>
                </View>
                {doneJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    id={job.id}
                    assetName={job.assetName}
                    assetDesc={(job as any).assetDesc}
                    gardenType={job.gardenType}
                    suburb={(job as any).suburb}
                    streetAddress={(job as any).streetAddress}
                    lat={(job as any).lat}
                    lng={(job as any).lng}
                    serviceTimeMins={job.serviceTimeMins}
                    status={job.status}
                    scheduledDate={job.scheduledDate}
                    isAllTeams={(job as any).isAllTeams ?? false}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  greeting: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 2,
  },
  dateLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: "#ffffff",
    marginBottom: 16,
  },
  statRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 14,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: "#ffffff",
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    marginVertical: 4,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    flex: 1,
  },
  sectionCount: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
});
