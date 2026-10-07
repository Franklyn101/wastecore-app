import { Text, View } from "react-native"
import { router } from "expo-router"
import { useEffect, useState } from "react"
import { Switch } from "react-native"
import { JobCard } from "../../../components/JobCard"
import { Button, Card, ErrorBanner, Loading, Screen, Section } from "../../../components/ui"
import { api } from "../../../lib/api"
import { notify } from "../../../lib/dialogs"
import { loadJobs, useOfflineQueue } from "../../../lib/offline"
import { useAuth } from "../../../lib/auth"
import { daysUntil, formatDate } from "../../../lib/format"
import type { CollectorJob } from "../../../lib/types"
import { useFocusData } from "../../../lib/useFocusData"
import { useSubmit } from "../../../lib/useSubmit"
import { colors, font, radius, spacing } from "../../../theme"

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
  const today = data.open.filter((j) => daysUntil(j.scheduledDate) <= 0).length

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

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button title="Today's route" style={{ flex: 1 }} onPress={() => router.push("/collector/route")} />
        <Button title="Earnings" variant="secondary" style={{ flex: 1 }} onPress={() => router.push("/collector/earnings")} />
      </View>

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
