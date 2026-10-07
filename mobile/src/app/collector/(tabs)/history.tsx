import { Text } from "react-native"
import { JobCard } from "../../../components/JobCard"
import { Card, ErrorBanner, Loading, Screen } from "../../../components/ui"
import { loadJobs } from "../../../lib/offline"
import { useFocusData } from "../../../lib/useFocusData"
import { font } from "../../../theme"

export default function CollectorHistory() {
  const { data, error, refreshing, refresh } = useFocusData(() => loadJobs())
  if (!data) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Text style={font.muted}>Jobs you closed in the last 30 days.</Text>
      {data.history.length === 0 ? (
        <Card>
          <Text style={font.muted}>Nothing yet. Completed jobs will show here.</Text>
        </Card>
      ) : null}
      {data.history.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </Screen>
  )
}
