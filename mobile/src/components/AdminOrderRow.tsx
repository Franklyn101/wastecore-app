import { router } from "expo-router"
import { Pressable, Text, View } from "react-native"
import { naira, ORDER_TYPE_LABELS, orderStatus, orderSummary, pickupWhen } from "../lib/format"
import type { AdminOrder } from "../lib/types"
import { colors, font, radius, spacing } from "../theme"
import { Badge } from "./ui"

/** One row in the staff order queue. */
export function AdminOrderRow({ order }: { order: AdminOrder }) {
  const status = orderStatus(order)
  const what = orderSummary(order)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${order.reference}, ${order.customer.name}, ${status.label}`}
      onPress={() => router.push(`/admin/orders/${order.id}`)}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.xs,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
        <Text style={font.label}>
          {order.reference} · {order.customer.name}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          {order.asap && (order.status === "PENDING" || order.status === "ASSIGNED") ? <Badge label="ASAP" tone="warning" /> : null}
          <Badge label={status.label} tone={status.tone} />
        </View>
      </View>
      <Text style={font.body}>
        {ORDER_TYPE_LABELS[order.type]} — {what}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
        <Text style={[font.muted, { flexShrink: 1 }]} numberOfLines={1}>
          {pickupWhen(order)} · {order.address}
        </Text>
        <Text style={[font.label, { color: colors.primary }]}>
          {order.type === "PLAN_PICKUP" ? "Plan" : naira(order.amount)}
        </Text>
      </View>
      {order.collector ? <Text style={font.muted}>Collector: {order.collector.name}</Text> : null}
    </Pressable>
  )
}
