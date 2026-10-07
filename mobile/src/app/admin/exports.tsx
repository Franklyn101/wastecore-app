import { useState } from "react"
import { Text, View } from "react-native"
import { Button, Chip, ErrorBanner, OptionCard, Screen, Section } from "../../components/ui"
import { api } from "../../lib/api"
import { saveTextFile } from "../../lib/download"
import { upcomingDates } from "../../lib/format"
import type { ExportKind } from "../../lib/types"
import { useSubmit } from "../../lib/useSubmit"
import { font, spacing } from "../../theme"

const KINDS: { id: ExportKind; title: string; subtitle: string }[] = [
  { id: "orders", title: "Orders", subtitle: "Every order with customer, area, status, collector and rating" },
  { id: "payments", title: "Payments", subtitle: "Online payments and confirmed bank transfers" },
  { id: "refunds", title: "Refunds", subtitle: "Refunds given, with reasons" },
  { id: "payouts", title: "Collector payouts", subtitle: "What collectors were paid" },
  { id: "customers", title: "New customers", subtitle: "Accounts created in the period" },
  { id: "disposals", title: "Waste drop-offs", subtitle: "Loads taken to dump sites and recyclers, with weights" },
]

const RANGES = [7, 30, 90, 365]

// Spreadsheet reports for accounts and planning. Opens in Excel or Google Sheets.
export default function Exports() {
  const [kind, setKind] = useState<ExportKind>("orders")
  const [days, setDays] = useState(30)
  const [saved, setSaved] = useState<string | null>(null)
  const { busy, error, submit } = useSubmit()

  function download() {
    void submit(async () => {
      const [to] = upcomingDates(1)
      const from = new Date(Date.parse(to) - (days - 1) * 86_400_000).toISOString().slice(0, 10)
      const csv = await api.admin.exportCsv(kind, { from, to })
      const name = `wastecore-${kind}-${from}-to-${to}.csv`
      await saveTextFile(name, csv)
      setSaved(`${name} (${Math.max(0, csv.trim().split("\n").length - 1)} rows)`)
    })
  }

  return (
    <Screen>
      <Section title="Report">
        {KINDS.map((k) => (
          <OptionCard key={k.id} title={k.title} subtitle={k.subtitle} selected={kind === k.id} onPress={() => setKind(k.id)} />
        ))}
      </Section>
      <Section title="Period">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {RANGES.map((d) => (
            <Chip key={d} label={d === 365 ? "Last year" : `Last ${d} days`} selected={days === d} onPress={() => setDays(d)} />
          ))}
        </View>
      </Section>
      {error ? <ErrorBanner message={error} /> : null}
      {saved ? <Text style={font.muted}>Saved {saved}</Text> : null}
      <Button title="Download CSV" onPress={download} loading={busy} />
    </Screen>
  )
}
