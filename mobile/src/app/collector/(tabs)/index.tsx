import Ionicons from "@expo/vector-icons/Ionicons"
import { router } from "expo-router"
import { useEffect, useState } from "react"
import { Pressable, StyleSheet, Switch, Text, View } from "react-native"
import { JobCard, jobTask } from "../../../components/JobCard"
import { Button, Card, ErrorBanner, Loading, Screen, Section, switchColors } from "../../../components/ui"
import { api } from "../../../lib/api"
import { notify } from "../../../lib/dialogs"
import { loadJobs, useOfflineQueue } from "../../../lib/offline"
import { useAuth } from "../../../lib/auth"
import { daysUntil, formatDate, naira } from "../../../lib/format"
import type { CollectorJob } from "../../../lib/types"
import { useFocusData } from "../../../lib/useFocusData"
import { useSubmit } from "../../../lib/useSubmit"
import { colors, font, hairline, radius, shadow, spacing } from "../../../theme"

/** Overdue first, then today, then each upcoming day. */
function groupJobs(jobs: CollectorJob[]) {
  const groups: { title: string; jobs: CollectorJob[] }[] = []
  const add = (title: string, job: CollectorJob) => {
    const last = groups[groups.length - 1]
    if (last?.title === title) last.jobs.push(job)
    else groups.push({ title, jobs: [job] })
  }
  for (const job of jobs) {
    const days = daysUntil(job.scheduledDate)
    add(days < 0 ? "Overdue" : days === 0 ? "Today" : days === 1 ? "Tomorrow" : formatDate(job.scheduledDate), job)
  }
  return groups
}

export default function CollectorJobs() {
  const { user } = useAuth()
  const { data, error, refreshing, refresh } = useFocusData(() => loadJobs())
  const waiting = useOfflineQueue((r) => {
    refresh()
    if (r.failed.length) notify("Some updates weren't accepted", r.failed.join("\n"))
  })

  if (!data) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />

  const groups = groupJobs(data.open)
  const todayJobs = data.open.filter((j) => daysUntil(j.scheduledDate) <= 0)
  const today = todayJobs.length

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={{ gap: spacing.xs }}>
        <Text style={font.title}>Hello, {user?.name.split(" ")[0]}</Text>
        <Text style={font.muted}>
          {today === 0 ? "No jobs left for today." : `${today} job${today === 1 ? "" : "s"} for today.`}
        </Text>
      </View>

      {data.offline || waiting > 0 ? (
        <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning }}>
          <Text style={font.label}>{data.offline ? "You're offline" : "Sending your updates…"}</Text>
          <Text style={font.muted}>
            {data.offline ? "Showing your jobs as last saved. " : ""}
            {waiting > 0 ? `${waiting} update${waiting === 1 ? "" : "s"} will be sent when you have signal.` : ""}
          </Text>
        </Card>
      ) : null}

      <OnDutySwitch />

      <TodayCard jobs={todayJobs} />
      <OwedRow />

      <Button title="Log a drop-off at the dump site" variant="secondary" onPress={() => router.push("/collector/disposal")} />

      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Stat label="Done today" value={data.stats.doneToday} />
        <Stat label="Done this week" value={data.stats.doneThisWeek} />
        {data.stats.rating !== null ? <Stat label={`Rating (${data.stats.ratings})`} value={`${data.stats.rating}★`} /> : null}
      </View>

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {groups.length === 0 ? (
        <Card>
          <Text style={font.muted}>No jobs assigned to you right now. Pull down to refresh.</Text>
        </Card>
      ) : null}

      {groups.map((g) => (
        <Section key={g.title} title={`${g.title} (${g.jobs.length})`}>
          {g.jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </Section>
      ))}
    </Screen>
  )
}

/** Today's stops at a glance, the next one, and the route. */
function TodayCard({ jobs }: { jobs: CollectorJob[] }) {
  if (jobs.length === 0) {
    return (
      <Card>
        <Text style={font.label}>Nothing left for today</Text>
        <Text style={font.muted}>New jobs from the office show up here. Upcoming days are listed below.</Text>
      </Card>
    )
  }
  const next = jobs[0]
  const bags = jobs.reduce((sum, j) => sum + (j.type === "WASTE_BAGS" ? 0 : j.includedBags), 0)
  const pay = jobs.reduce((sum, j) => sum + j.estimatedPay, 0)
  const bring = jobs.reduce((sum, j) => sum + j.wastecoreBags, 0)
  return (
    <View style={styles.today}>
      <Text style={styles.todayTitle}>Today</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <TodayStat value={String(jobs.length)} label={jobs.length === 1 ? "stop" : "stops"} />
        <TodayStat value={String(bags)} label="bags (about)" />
        <TodayStat value={naira(pay)} label="you earn (about)" />
      </View>
      {bring ? (
        <Text style={styles.todayNote}>
          Take {bring} WasteCore bag{bring === 1 ? "" : "s"} with you.
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Next stop: ${next.customer.name}, ${next.address}`}
        onPress={() => router.push(`/collector/jobs/${next.id}`)}
        style={({ pressed }) => [styles.next, pressed && { opacity: 0.9 }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.nextLabel}>Next stop{next.asap ? " · ASAP" : ""}</Text>
          <Text style={font.label}>
            {next.customer.name} · {next.address}
          </Text>
          <Text style={font.muted}>{jobTask(next)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start today's route"
        onPress={() => router.push("/collector/route")}
        style={({ pressed }) => [styles.routeButton, pressed && { opacity: 0.9 }]}
      >
        <Ionicons name="navigate" size={18} color={colors.primaryDark} />
        <Text style={styles.routeText}>See today's route on the map</Text>
      </Pressable>
    </View>
  )
}

function TodayStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={styles.todayValue}>{value}</Text>
      <Text style={styles.todayLabel}>{label}</Text>
    </View>
  )
}

/** What the collector is owed since their last payout. Hidden when offline. */
function OwedRow() {
  const [due, setDue] = useState<number | null>(null)
  useEffect(() => {
    api.collector
      .earnings()
      .then((e) => setDue(e.unpaid.due))
      .catch(() => setDue(null))
  }, [])
  if (due === null) return null
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Owed to you: ${naira(due)}. See earnings`}
      onPress={() => router.push("/collector/earnings")}
      style={({ pressed }) => [styles.owed, pressed && { opacity: 0.9 }]}
    >
      <Ionicons name="cash-outline" size={22} color={colors.primaryDark} />
      <View style={{ flex: 1 }}>
        <Text style={font.label}>Owed to you: {naira(due)}</Text>
        <Text style={font.muted}>Since your last payout. See earnings and how pay works.</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.primarySoft,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: 2,
      }}
    >
      <Text style={[font.title, { color: colors.primaryDark }]}>{value}</Text>
      <Text style={font.muted}>{label}</Text>
    </View>
  )
}

/** "I'm working": the office gives jobs to collectors who are on duty. */
function OnDutySwitch() {
  const [onDuty, setOnDuty] = useState<boolean | null>(null)
  const { busy, error, submit } = useSubmit()

  useEffect(() => {
    api.collector
      .me()
      .then((r) => setOnDuty(r.collector.onDuty))
      .catch(() => setOnDuty(null))
  }, [])

  if (onDuty === null) return null
  return (
    <Card style={onDuty ? { backgroundColor: colors.primarySoft, borderColor: colors.primary } : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={font.label}>{onDuty ? "You're on duty" : "You're off duty"}</Text>
          <Text style={font.muted}>{onDuty ? "The office can give you new jobs." : "Switch on when you start work."}</Text>
        </View>
        <Switch
          {...switchColors}
          accessibilityLabel="On duty"
          value={onDuty}
          disabled={busy}
          trackColor={{ true: colors.primary, false: colors.border }}
          onValueChange={(v) => void submit(async () => setOnDuty((await api.collector.setOnDuty(v)).onDuty))}
        />
      </View>
      {error ? <ErrorBanner message={error} /> : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  today: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, ...shadow.raised },
  todayTitle: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  todayValue: { fontSize: 20, fontWeight: "800", color: "#FFFFFF" },
  todayLabel: { fontSize: 13, color: "#FFFFFF", opacity: 0.95 },
  todayNote: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  next: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  nextLabel: { fontSize: 12, fontWeight: "700", color: colors.primaryDark, textTransform: "uppercase", letterSpacing: 0.5 },
  routeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  routeText: { fontSize: 15, fontWeight: "700", color: colors.primaryDark },
  owed: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: hairline,
    ...shadow.card,
  },
})
