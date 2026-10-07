import { router } from "expo-router"
import { Pressable, Text, View } from "react-native"
import { Card, ErrorBanner, Loading, Screen } from "../components/ui"
import { api } from "../lib/api"
import { formatDate, naira } from "../lib/format"
import { useFocusData } from "../lib/useFocusData"
import { colors, font, spacing } from "../theme"

// Everything the customer has paid, newest first.
export default function PaymentHistory() {
  const { data, error, refreshing, refresh } = useFocusData(() => api.payments())

  if (!data) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
        <Text style={font.muted}>Total paid</Text>
        <Text style={[font.title, { color: colors.primaryDark }]}>{naira(data.total)}</Text>
      </Card>
      {data.payments.length === 0 ? <Text style={font.muted}>No payments yet.</Text> : null}
      {data.payments.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          disabled={!p.orderId && !p.subscriptionId}
          onPress={() => router.push(p.orderId ? `/orders/${p.orderId}` : "/plan")}
        >
          <Card style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
              <Text style={[font.label, { flexShrink: 1 }]}>{p.description}</Text>
              <Text style={font.label}>{naira(p.amount)}</Text>
            </View>
            <Text style={font.muted}>
              {formatDate(p.paidAt)} · {p.method} · {p.reference}
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  )
}
