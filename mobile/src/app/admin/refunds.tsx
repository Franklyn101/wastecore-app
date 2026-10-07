import { router } from "expo-router"
import { Pressable, Text, View } from "react-native"
import { Badge, Card, ErrorBanner, Loading, Screen } from "../../components/ui"
import { api } from "../../lib/api"
import { formatDate, naira } from "../../lib/format"
import { useFocusData } from "../../lib/useFocusData"
import { font, spacing } from "../../theme"

const STATUS = { PENDING: { label: "On its way", tone: "info" }, PROCESSED: { label: "Done", tone: "success" }, FAILED: { label: "Failed", tone: "danger" } } as const

// Refunds staff have given. Issue new ones from an order.
export default function Refunds() {
  const { data, error, refreshing, refresh } = useFocusData(() => api.admin.refunds())
  if (!data) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />
  const total = data.refunds.filter((r) => r.status !== "FAILED").reduce((sum, r) => sum + r.amount, 0)

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Text style={font.muted}>
        {data.refunds.length} refund{data.refunds.length === 1 ? "" : "s"} · {naira(total)} in total. To refund, open the order.
      </Text>
      {data.refunds.map((r) => (
        <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push(`/admin/orders/${r.order.id}`)}>
          <Card style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
              <Text style={font.label}>
                {naira(r.amount)} · {r.order.reference}
              </Text>
              <Badge label={STATUS[r.status].label} tone={STATUS[r.status].tone} />
            </View>
            <Text style={font.body}>{r.reason}</Text>
            <Text style={font.muted}>
              {r.user.name} · {formatDate(r.createdAt)} · {r.method === "PAYSTACK" ? "Paystack" : "Manual"}
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  )
}
