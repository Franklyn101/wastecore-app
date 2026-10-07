import { Text } from "react-native"
import { DisposalForm } from "../../components/DisposalForm"
import { Card, ErrorBanner, Loading, Row, Screen, Section } from "../../components/ui"
import { api } from "../../lib/api"
import { DISPOSAL_KIND_LABELS, formatDate } from "../../lib/format"
import { useFocusData } from "../../lib/useFocusData"
import { font } from "../../theme"

// Where the truck emptied its load: for WasteCore's waste records.
export default function CollectorDisposals() {
  const { data, error, refresh } = useFocusData(() => api.collector.disposals())
  if (!data) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />

  return (
    <Screen>
      <Text style={font.muted}>Each time you empty the truck, log where it went and how much it weighed.</Text>
      <DisposalForm
        recentSites={data.recentSites}
        withPhoto
        onSave={async (input) => {
          await api.collector.addDisposal(input)
          refresh()
        }}
      />
      {data.disposals.length ? (
        <Section title="Your recent drop-offs">
          {data.disposals.map((d) => (
            <Card key={d.id} style={{ gap: 2 }}>
              <Row label={`${formatDate(d.disposedAt)} · ${DISPOSAL_KIND_LABELS[d.kind]}`} value={`${d.weightKg} kg`} />
              <Text style={font.muted}>
                {d.site} · {d.wasteType}
              </Text>
            </Card>
          ))}
        </Section>
      ) : null}
    </Screen>
  )
}
