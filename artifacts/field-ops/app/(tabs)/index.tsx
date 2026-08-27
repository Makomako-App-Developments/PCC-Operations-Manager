import { Feather } from "@expo/vector-icons";
import { useGetScheduleWeek } from "@workspace/api-client-react";
import { Redirect } from "expo-router";
import React, { useMemo, useState } from "react";
import type { ScheduledJob } from "@/lib/todayJobsLogic";
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
import {
  computeDoneToday,
  computePendingToday,
  computeTodayJobs,
} from "@/lib/todayJobsLogic";

// ─── Date helpers ─────────────────────────────────────────────────────────────

const DAY_NAMES   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextWorkingDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
  return localDateStr(d);
}

const TODAY = localDateStr(new Date());
const DAY1  = nextWorkingDay(TODAY);
const DAY2  = nextWorkingDay(DAY1);
const DAY3  = nextWorkingDay(DAY2);
const DAY4  = nextWorkingDay(DAY3);

const CALENDAR_TOMORROW = (() => {
  const d = new Date(TODAY + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return localDateStr(d);
})();

function formatDateFull(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function dayLabel(dateStr: string) {
  if (dateStr === TODAY) return "Today";
  if (dateStr === DAY1 && dateStr === CALENDAR_TOMORROW) return `Tomorrow — ${formatDateFull(dateStr)}`;
  return formatDateFull(dateStr);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Collapsible day section ──────────────────────────────────────────────────

type Job = ScheduledJob & {
  assetName?: string;
  gardenType?: string;
  serviceTimeMins?: number;
  assetDesc?: string | null;
  suburb?: string | null;
  streetAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  isAllTeams?: boolean;
  jobType?: string;
  priority?: string | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  routeOrder?: number | null;
};

function DaySection({
  date,
  jobs,
  defaultExpanded,
  currentUserId,
}: {
  date: string;
  jobs: Job[];
  defaultExpanded: boolean;
  currentUserId?: string | null;
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
              {(() => {
                // Assign geoSeq positions: jobs sharing the same non-null routeOrder
                // (i.e. mulching/infill for the same asset as a regular job) get the
                // same position number. Null-routeOrder jobs each get their own number.
                let pos = 0;
                let lastOrder: number | null = undefined as any;
                const geoSeqFor = pendingJobs.map((job) => {
                  const order = (job as any).routeOrder as number | null ?? null;
                  const sameAsLast = order !== null && order === lastOrder;
                  if (!sameAsLast) { pos++; lastOrder = order; }
                  return pos;
                });
                return pendingJobs.map((job, idx) => (
                  <JobCard
                    key={job.id}
                    id={job.id}
                    assetName={job.assetName ?? "Unknown site"}
                    assetDesc={(job as any).assetDesc}
                    gardenType={job.gardenType ?? "—"}
                    suburb={(job as any).suburb}
                    streetAddress={(job as any).streetAddress}
                    lat={(job as any).lat}
                    lng={(job as any).lng}
                    serviceTimeMins={job.serviceTimeMins ?? 0}
                    status={job.status}
                    scheduledDate={job.scheduledDate}
                    isAllTeams={(job as any).isAllTeams ?? false}
                    jobType={(job as any).jobType}
                    priority={(job as any).priority}
                    assignedUserId={(job as any).assignedUserId}
                    assignedUserName={(job as any).assignedUserName}
                    currentUserId={currentUserId}
                    geoSeq={geoSeqFor[idx]}
                  />
                ));
              })()}
              {doneJobs.map((job) => (
                <JobCard
                  key={job.id}
                  id={job.id}
                  assetName={job.assetName ?? "Unknown site"}
                  assetDesc={(job as any).assetDesc}
                  gardenType={job.gardenType ?? "—"}
                  suburb={(job as any).suburb}
                  streetAddress={(job as any).streetAddress}
                  lat={(job as any).lat}
                  lng={(job as any).lng}
                  serviceTimeMins={job.serviceTimeMins ?? 0}
                  status={job.status}
                  scheduledDate={job.scheduledDate}
                  isAllTeams={(job as any).isAllTeams ?? false}
                  jobType={(job as any).jobType}
                  priority={(job as any).priority}
                  assignedUserId={(job as any).assignedUserId}
                  assignedUserName={(job as any).assignedUserName}
                  currentUserId={currentUserId}
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

  if (user?.role === "manager") {
    return <Redirect href="/(tabs)/audits" />;
  }

  const teamParam = user?.teamId ? { teamId: user.teamId } : {};
  const queryOpts = { query: { enabled: !!user, refetchInterval: 60_000, staleTime: 30_000 } as any };

  const { data: thisWeek, isLoading: loadingThis, refetch: refetchThis, isRefetching: refetchingThis } =
    useGetScheduleWeek({ week: TODAY, ...teamParam }, queryOpts);

  const { data: nextWeek, isLoading: loadingNext, refetch: refetchNext, isRefetching: refetchingNext } =
    useGetScheduleWeek({ week: DAY2,  ...teamParam }, queryOpts);

  // DAY4 may fall in a third calendar week (e.g. Wed view: Fri ends this week,
  // Mon–Tue are next week, Wed is the week after). Fetching by DAY4 covers that case;
  // the API deduplicates by date so overlapping weeks are harmless.
  const { data: week3, isLoading: loadingWeek3, refetch: refetchWeek3, isRefetching: refetchingWeek3 } =
    useGetScheduleWeek({ week: DAY4,  ...teamParam }, queryOpts);

  const isLoading   = loadingThis || loadingNext || loadingWeek3;
  const isRefetching = refetchingThis || refetchingNext || refetchingWeek3;
  const refetch = () => { refetchThis(); refetchNext(); refetchWeek3(); };

  const dayMap = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const w of [thisWeek, nextWeek, week3]) {
      if (!w?.days) continue;
      for (const d of w.days) {
        // The API excludes manager-only drafts. Keep this guard as a second
        // boundary so a malformed or stale response can never expose draft
        // work in the field app.
        if (!map.has(d.date)) map.set(d.date, (d.jobs ?? []).filter(job => (job.status as string) !== "draft") as unknown as Job[]);
      }
    }
    return map;
  }, [thisWeek, nextWeek, week3]);

  // Carry forward any pending/in-progress jobs from past dates into today.
  // Logic lives in lib/todayJobsLogic.ts so it can be unit-tested independently.
  const todayJobs = useMemo(
    () => computeTodayJobs(dayMap, TODAY),
    [dayMap],
  );
  const day1Jobs  = dayMap.get(DAY1)  ?? [];
  const day2Jobs  = dayMap.get(DAY2)  ?? [];
  const day3Jobs  = dayMap.get(DAY3)  ?? [];
  const day4Jobs  = dayMap.get(DAY4)  ?? [];

  const allVisibleJobs = [...todayJobs, ...day1Jobs, ...day2Jobs, ...day3Jobs, ...day4Jobs];

  const pendingToday = computePendingToday(todayJobs);
  const doneToday    = computeDoneToday(todayJobs);

  const topPad    = insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 84 : 160);

  const allEmpty = todayJobs.length === 0 && day1Jobs.length === 0 && day2Jobs.length === 0
    && day3Jobs.length === 0 && day4Jobs.length === 0;

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
            <Text style={styles.statLabel}>Total</Text>
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
            title="No jobs in the next 5 days"
            subtitle="Enjoy the break or check with your supervisor."
          />
        ) : (
          <>
            <DaySection date={TODAY} jobs={todayJobs} defaultExpanded={true} currentUserId={user?.id} />
            <DaySection date={DAY1}  jobs={day1Jobs}  defaultExpanded={false} currentUserId={user?.id} />
            <DaySection date={DAY2}  jobs={day2Jobs}  defaultExpanded={false} currentUserId={user?.id} />
            <DaySection date={DAY3}  jobs={day3Jobs}  defaultExpanded={false} currentUserId={user?.id} />
            <DaySection date={DAY4}  jobs={day4Jobs}  defaultExpanded={false} currentUserId={user?.id} />
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
