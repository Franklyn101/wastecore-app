import { Stack } from "expo-router"
import { Pressable, Text, View } from "react-native"
import { Card, ErrorBanner, Loading, Screen } from "../components/ui"
import { api } from "../lib/api"
import { useNotifications } from "../lib/notifications"
import { openNotificationUrl } from "../lib/push"
import type { AppNotification } from "../lib/types"
import { useFocusData } from "../lib/useFocusData"
import { colors, font, radius, spacing } from "../theme"

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" })
}

export default function NotificationsScreen() {
  const { refresh: refreshCount } = useNotifications()
  const { data, error, refreshing, refresh, setData } = useFocusData(() => api.notifications())

  if (!data) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />

  async function open(n: AppNotification) {
    if (!n.read) {
      setData({ ...data!, notifications: data!.notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)), unread: data!.unread - 1 })
      await api.markNotificationsRead([n.id]).catch(() => {})
      refreshCount()
    }
    openNotificationUrl(n.url)
  }

  async function readAll() {
    setData({ notifications: data!.notifications.map((n) => ({ ...n, read: true })), unread: 0 })
    await api.markNotificationsRead().catch(() => {})
    refreshCount()
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen
        options={{
          headerRight: () =>
            data.unread > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => void readAll()} hitSlop={8} style={{ marginRight: spacing.lg }}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Mark all read</Text>
              </Pressable>
            ) : null,
        }}
      />
      {data.notifications.length === 0 ? (
        <Card>
          <Text style={font.muted}>No notifications yet. Updates about your orders and jobs will appear here.</Text>
        </Card>
      ) : null}
      {data.notifications.map((n) => (
        <Pressable
          key={n.id}
          accessibilityRole="button"
          accessibilityLabel={`${n.read ? "" : "Unread. "}${n.title}. ${n.body}`}
          onPress={() => void open(n)}
          style={({ pressed }) => ({
            flexDirection: "row",
            gap: spacing.md,
            backgroundColor: n.read ? colors.surface : colors.primarySoft,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: n.read ? colors.border : colors.primary,
            padding: spacing.lg,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View style={{ width: 8, paddingTop: 6 }}>
            {!n.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
              <Text style={[font.label, { flexShrink: 1 }]}>{n.title}</Text>
              <Text style={font.muted}>{ago(n.createdAt)}</Text>
            </View>
            <Text style={font.body}>{n.body}</Text>
          </View>
        </Pressable>
      ))}
    </Screen>
  )
}
