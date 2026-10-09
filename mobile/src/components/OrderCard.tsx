import { router } from "expo-router"
import { Pressable, Text, View } from "react-native"
import { naira, ORDER_TYPE_LABELS, orderStatus, orderSummary, pickupWhen } from "../lib/format"
import type { Order } from "../lib/types"
import { colors, font, hairline, radius, shadow, spacing } from "../theme"
import { OrderIcon } from "./OrderIcon"
import { Badge } from "./ui"

/** The look shared by tappable list cards (orders, jobs, staff order rows). */
export const listCard = {
  flexDirection: "row" as const,
  gap: spacing.md,
  backgroundColor: colors.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: hairline,
  padding: spacing.lg,
  ...shadow.card,
}
export const pressedCard = { opacity: 0.9, transform: [{ scale: 0.99 }] }

export function OrderCard({ order }: { order: Order }) {
  const status = orderStatus(order)
  const what = orderSummary(order)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ORDER_TYPE_LABELS[order.type]} ${order.reference}, ${status.label}`}
      onPress={() => router.push(`/orders/${order.id}`)}
      style={({ pressed }) => [listCard, pressed && pressedCard]}
    >
      <OrderIcon type={order.type} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
          <Text style={[font.label, { flexShrink: 1 }]} numberOfLines={1}>
            {ORDER_TYPE_LABELS[order.type]}
          </Text>
          <Badge label={status.label} tone={status.tone} />
        </View>
        <Text style={font.body}>{what}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: spacing.sm }}>
          <Text style={[font.muted, { flexShrink: 1 }]}>
            {order.reference} · {pickupWhen(order)}
          </Text>
          <Text style={[font.label, { color: colors.primaryDark }]}>
            {order.type === "PLAN_PICKUP" ? "Plan" : naira(order.amount)}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}
