import { Feather } from "@expo/vector-icons";
import { useGetScheduleWeek } from "@workspace/api-client-react";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
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

// ─── Date helpers ─────────────────────────────────────────────────────────────

function shiftDate(base: string, n: number): string {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0]!;
}

const TODAY = new Date().toISOString().split("T")[0]!;
const DAY1  = shiftDate(TODAY, 1);
const DAY2  = shiftDate(TODAY, 2);

const DAY_NAMES   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

function formatDateFull(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function dayLabel(dateStr: string) {
  if (dateStr === TODAY) return "Today";
  if (dateStr === DAY1)  return `Tomorrow — ${formatDateFull(DAY1)}`;
  return formatDateFull(dateStr);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Collapsible day section ──────────────────────────────────────────────────

type Job = ReturnType<typeof useMemo<any[], any>> extends (infer T)[] ? T : any;

function DaySection({
  date,
  jobs,
  defaultExpanded,
}: {
  date: string;
  jobs: Job[];
  defaultExpanded: boolean;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isToday = date === TODAY;

  const pendingJobs = jobs.filter(
    (j) => j.status === "pending" || j.status === "in_progress" || j.status === "paused" || j.status === "overdue",
  );
  const doneJobs = jobs.filter(
    (j) => j.status === "completed" || j.status === "skipped",
  );

  return (
    <View style={[styles.daySection, { borderColor: colors.border, borderRadius: colors.radius }]}>
      <Pressable
        style={[styles.daySectionHeader, { backgroundColor: colors.card, borderRadius: expanded ? 0 : colors.radius, borderTopLeftRadius: colors.radius, borderTopRightRadius: colors.radius }]}
        onPress={() => setExpanded((e) => !e)}
        android_ripple={{ color: "rgba(0,0,0,0.05)" }}
      >
        <View style={[styles.dayDot, { backgroundColor: isToday ? colors.primary : colors.mutedForeground }]} />
        <Text style={[styles.dayLabel, { color: colors.foreground }]} numberOfLines={1}>
          {dayLabel(date)}
        </Text>
        <View style={styles.dayCounts}>
          {doneJobs.length > 0 && (
            <Text style={[styles.dayDoneCount, { color: colors.success }]}>
              {doneJobs.length} done
            </Text>
          )}
          <Text style={[styles.dayJobCount, { color: colors.mutedForeground }]}>
            {jobs.length} job{jobs.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.mutedForeground}
        />
      </Pressable>

      {expanded && (
        <View style={[styles.daySectionBody, { backgroundColor: colors.background, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          {jobs.length === 0 ? (
            <Text style={[styles.emptyDayText, { color: colors.mutedForeground }]}>
              No jobs scheduled
            </Text>
          ) : (
            <>
              {pendingJobs.map((job, idx) => (
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
                  jobType={(job as any).jobType}
                  geoSeq={isToday ? idx + 1 : undefined}
                />
              ))}
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
                  jobType={(job as any).jobType}
                />
              ))}
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TodayScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { user } = useAuth();

  const teamParam = user?.teamId ? { teamId: user.teamId } : {};
  const queryOpts = { query: { enabled: !!user } as any };

  const { data: thisWeek, isLoading: loadingThis, refetch: refetchThis, isRefetching: refetchingThis } =
    useGetScheduleWeek({ week: TODAY, ...teamParam }, queryOpts);

  const { data: nextWeek, isLoading: loadingNext, refetch: refetchNext, isRefetching: refetchingNext } =
    useGetScheduleWeek({ week: DAY2,  ...teamParam }, queryOpts);

  const isLoading   = loadingThis || loadingNext;
  const isRefetching = refetchingThis || refetchingNext;
  const refetch = () => { refetchThis(); refetchNext(); };

  const dayMap = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const w of [thisWeek, nextWeek]) {
      if (!w?.days) continue;
      for (const d of w.days as { date: string; jobs: Job[] }[]) {
        if (!map.has(d.date)) map.set(d.date, d.jobs ?? []);
      }
    }
    return map;
  }, [thisWeek, nextWeek]);

  const todayJobs = dayMap.get(TODAY) ?? [];
  const day1Jobs  = dayMap.get(DAY1)  ?? [];
  const day2Jobs  = dayMap.get(DAY2)  ?? [];

  const pendingToday = todayJobs.filter(
    (j) => j.status === "pending" || j.status === "in_progress" || j.status === "paused" || j.status === "overdue",
  );
  const doneToday = todayJobs.filter(
    (j) => j.status === "completed" || j.status === "skipped",
  );

  const topPad    = insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 84 : 160);

  const allEmpty = todayJobs.length === 0 && day1Jobs.length === 0 && day2Jobs.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: colors.navy, paddingTop: topPad + 16 }]}>
        <Text style={styles.greeting}>
          {getGreeting()}, {user?.name?.split(" ")[0] ?? "there"}
        </Text>
        <Text style={styles.dateLabel}>{formatDateFull(TODAY)}</Text>

        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{pendingToday.length}</Text>
            <Text style={styles.statLabel}>Remaining</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: "rgba(255,255,255,0.2)" }]} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{doneToday.length}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: "rgba(255,255,255,0.2)" }]} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{todayJobs.length}</Text>
            <Text style={styles.statLabel}>Total Today</Text>
          </View>
        </View>
      </View>

      {/* ── List ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} size="large" />
        ) : allEmpty ? (
          <EmptyState
            icon="check-circle"
            title="No jobs in the next 3 days"
            subtitle="Enjoy the break or check with your supervisor."
          />
        ) : (
          <>
            <DaySection date={TODAY} jobs={todayJobs} defaultExpanded={true} />
            <DaySection date={DAY1}  jobs={day1Jobs}  defaultExpanded={false} />
            <DaySection date={DAY2}  jobs={day2Jobs}  defaultExpanded={false} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  stat: { flex: 1, alignItems: "center" },
  statNum: { fontFamily: "Inter_700Bold", fontSize: 24, color: "#ffffff" },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    marginTop: 2,
  },
  statDivider: { width: 1, marginVertical: 4 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 10 },

  daySection: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  daySectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  dayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dayLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    flex: 1,
  },
  dayCounts: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dayDoneCount: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  dayJobCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  daySectionBody: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  emptyDayText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
