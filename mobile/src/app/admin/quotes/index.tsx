import { router } from "expo-router"
import { useState } from "react"
import { Pressable, ScrollView, Text, View } from "react-native"
import { Badge, Card, Chip, ErrorBanner, Loading, Screen } from "../../../components/ui"
import { api } from "../../../lib/api"
import { formatDate, naira, QUOTE_STATUS } from "../../../lib/format"
import type { QuoteStatus } from "../../../lib/types"
import { useFocusData } from "../../../lib/useFocusData"
import { font, spacing } from "../../../theme"

const FILTERS: { label: string; status?: QuoteStatus }[] = [
  { label: "To price", status: "NEW" },
  { label: "Waiting on customer", status: "QUOTED" },
  { label: "Accepted", status: "ACCEPTED" },
  { label: "All" },
]

export default function AdminQuotes() {
  const [filter, setFilter] = useState(0)
  const { data, error, refreshing, refresh } = useFocusData(() => api.admin.quotes(FILTERS[filter].status), String(filter))

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {FILTERS.map((f, i) => (
          <Chip key={f.label} label={f.label} selected={filter === i} onPress={() => setFilter(i)} />
        ))}
      </ScrollView>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : !data ? <Loading /> : null}
      {data?.quotes.length === 0 ? <Text style={font.muted}>Nothing here.</Text> : null}
      {data?.quotes.map((q) => (
        <Pressable key={q.id} accessibilityRole="button" onPress={() => router.push(`/admin/quotes/${q.id}`)}>
          <Card style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
              <Text style={[font.label, { flexShrink: 1 }]}>
                {q.category} · {q.customer.name}
              </Text>
              <Badge label={QUOTE_STATUS[q.status].label} tone={QUOTE_STATUS[q.status].tone} />
            </View>
            <Text style={font.body} numberOfLines={2}>
              {q.description}
            </Text>
            <Text style={font.muted}>
              {q.reference} · wants {formatDate(q.preferredDate)}
              {q.amount ? ` · ${naira(q.amount)}` : ""}
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  )
}
