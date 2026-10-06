import { Text, View } from "react-native"
import { JobCard } from "../../../components/JobCard"
import { Card, ErrorBanner, Loading, Screen, Section } from "../../../components/ui"
import { api } from "../../../lib/api"
import { useAuth } from "../../../lib/auth"
import { daysUntil, formatDate } from "../../../lib/format"
import type { CollectorJob } from "../../../lib/types"
import { useFocusData } from "../../../lib/useFocusData"
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
  const { data, error, refreshing, refresh } = useFocusData(() => api.collector.jobs())

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

      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Stat label="Done today" value={data.stats.doneToday} />
        <Stat label="Done this week" value={data.stats.doneThisWeek} />
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

function Stat({ label, value }: { label: string; value: number }) {
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
