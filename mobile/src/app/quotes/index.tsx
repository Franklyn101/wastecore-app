import { router } from "expo-router"
import { Pressable, Text, View } from "react-native"
import { Badge, Button, Card, ErrorBanner, Loading, Screen } from "../../components/ui"
import { api } from "../../lib/api"
import { formatDate, naira, QUOTE_STATUS } from "../../lib/format"
import { useFocusData } from "../../lib/useFocusData"
import { font, spacing } from "../../theme"

// Special waste that doesn't fit in bags: ask for a price, then accept it and pay.
export default function Quotes() {
  const { data, error, refreshing, refresh } = useFocusData(() => api.quotes())

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Text style={font.muted}>
        Building rubble, old furniture, electronics, garden waste or a big clear-out? Tell us what it is and we'll send you a
        price, usually the same day.
      </Text>
      <Button title="Ask for a quote" onPress={() => router.push("/quotes/new")} />
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : !data ? <Loading /> : null}
      {data?.quotes.map((q) => (
        <Pressable key={q.id} accessibilityRole="button" onPress={() => router.push(`/quotes/${q.id}`)}>
          <Card style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
              <Text style={[font.label, { flexShrink: 1 }]}>{q.category}</Text>
              <Badge label={QUOTE_STATUS[q.status].label} tone={QUOTE_STATUS[q.status].tone} />
            </View>
            <Text style={font.muted} numberOfLines={2}>
              {q.description}
            </Text>
            <Text style={font.muted}>
              {q.reference} · {formatDate(q.createdAt)}
              {q.amount ? ` · ${naira(q.amount)}` : ""}
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  )
}
