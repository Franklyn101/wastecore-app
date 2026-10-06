import { router } from "expo-router"
import { Pressable, Text, View } from "react-native"
import { Badge, Card, ErrorBanner, Loading, Screen } from "../../../components/ui"
import { api } from "../../../lib/api"
import { formatDate, naira, SUBSCRIPTION_STATUS } from "../../../lib/format"
import { useFocusData } from "../../../lib/useFocusData"
import { colors, font, radius, spacing } from "../../../theme"

export default function AdminPlans() {
  const { data, error, refreshing, refresh } = useFocusData(() => api.admin.subscriptions())

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {!data && !error ? <Loading /> : null}
      {data?.subscriptions.length === 0 ? (
        <Card>
          <Text style={font.muted}>No customer plans yet.</Text>
        </Card>
      ) : null}
      {data?.subscriptions.map((s) => {
        const status = SUBSCRIPTION_STATUS[s.status]
        return (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            accessibilityLabel={`${s.customer.name}, ${s.planName}, ${status.label}`}
            onPress={() => router.push(`/admin/plans/${s.id}`)}
            style={({ pressed }) => ({
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: s.status === "ACTIVE" && !s.collector ? colors.warning : colors.border,
              padding: spacing.lg,
              gap: spacing.xs,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={font.label}>
                {s.customer.name} · {s.planName}
              </Text>
              <Badge label={status.label} tone={status.tone} />
            </View>
            <Text style={font.muted} numberOfLines={1}>
              {s.address}
            </Text>
            <Text style={font.muted}>
              {naira(s.price)} {s.periodLabel}
              {s.currentPeriodEnd ? ` · ${s.status === "ACTIVE" ? (s.autoRenew ? "renews" : "ends") : "ended"} ${formatDate(s.currentPeriodEnd)}` : ""}
            </Text>
            <Text style={[font.muted, !s.collector && s.status === "ACTIVE" ? { color: colors.warning } : null]}>
              {s.collector ? `Collector: ${s.collector.name}` : "No regular collector yet"}
            </Text>
          </Pressable>
        )
      })}
    </Screen>
  )
}
