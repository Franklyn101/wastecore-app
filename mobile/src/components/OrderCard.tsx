import { router } from "expo-router"
import { Pressable, Text, View } from "react-native"
import { formatDate, naira, ORDER_STATUS, ORDER_TYPE_LABELS } from "../lib/format"
import type { Order } from "../lib/types"
import { colors, font, radius, spacing } from "../theme"
import { Badge } from "./ui"

export function OrderCard({ order }: { order: Order }) {
  const status = ORDER_STATUS[order.status]
  const what = order.type === "WASTE_BAGS" ? `${order.planLabel} bags × ${order.quantity}` : order.planLabel
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ORDER_TYPE_LABELS[order.type]} ${order.reference}, ${status.label}`}
      onPress={() => router.push(`/orders/${order.id}`)}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.sm,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={font.label}>{ORDER_TYPE_LABELS[order.type]}</Text>
        <Badge label={status.label} tone={status.tone} />
      </View>
      <Text style={font.body}>{what}</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={font.muted}>
          {order.reference} · {formatDate(order.scheduledDate)}
        </Text>
        <Text style={[font.label, { color: colors.primary }]}>{naira(order.amount)}</Text>
      </View>
    </Pressable>
  )
}
