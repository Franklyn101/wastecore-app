import Ionicons from "@expo/vector-icons/Ionicons"
import { router } from "expo-router"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useNotifications } from "../lib/notifications"
import { colors, spacing } from "../theme"

/** Header button that opens the notification list, with an unread count. */
export function NotificationsBell() {
  const { unread } = useNotifications()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : "Notifications"}
      onPress={() => router.push("/notifications")}
      hitSlop={8}
      style={{ marginRight: spacing.lg }}
    >
      <Ionicons name="notifications-outline" size={24} color={colors.text} />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
})
