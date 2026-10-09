import Ionicons from "@expo/vector-icons/Ionicons"
import type { ComponentProps } from "react"
import { View } from "react-native"
import type { OrderType } from "../lib/types"
import { colors } from "../theme"

type IconName = ComponentProps<typeof Ionicons>["name"]

// Each kind of order gets its own icon and colour, matching the home screen's services.
const KIND: Record<OrderType, { icon: IconName; fg: string; bg: string }> = {
  INSTANT_PICKUP: { icon: "flash", fg: colors.primaryDark, bg: colors.primarySoft },
  PLAN_PICKUP: { icon: "calendar", fg: colors.primaryDark, bg: colors.primarySoft },
  WASTE_BAGS: { icon: "bag-handle", fg: colors.info, bg: colors.infoSoft },
  SPECIAL_PICKUP: { icon: "construct", fg: "#4B5563", bg: "#EEF1F4" },
}

export function OrderIcon({ type, size = 40 }: { type: OrderType; size?: number }) {
  const k = KIND[type]
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: k.bg, alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name={k.icon} size={size * 0.5} color={k.fg} />
    </View>
  )
}
