import { useState } from "react"
import { Text } from "react-native"
import { Card, ErrorBanner, Loading, Screen, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { useFocusData } from "../../lib/useFocusData"
import { font, spacing } from "../../theme"

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })

// Main admin only: who changed what in the staff tools.
export default function Activity() {
  const [q, setQ] = useState("")
  const search = q.trim().length >= 2 ? q.trim() : undefined
  const { data, error, refreshing, refresh } = useFocusData(() => api.admin.audit({ q: search }), search ?? "")

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <TextField label="Search" placeholder="Name, order reference, action…" value={q} onChangeText={setQ} autoCapitalize="none" />
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : !data ? <Loading /> : null}
      {data?.entries.length === 0 ? <Text style={font.muted}>Nothing recorded yet.</Text> : null}
      {data?.entries.map((e) => (
        <Card key={e.id} style={{ gap: spacing.xs, paddingVertical: spacing.md }}>
          <Text style={font.body}>{e.summary}</Text>
          <Text style={font.muted}>
            {e.actorName} · {when(e.createdAt)}
          </Text>
        </Card>
      ))}
    </Screen>
  )
}
