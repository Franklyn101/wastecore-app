import Ionicons from "@expo/vector-icons/Ionicons"
import { Tabs } from "expo-router/js-tabs"
import type { ComponentProps } from "react"
import { Text, View, type ColorValue } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Button, Card, ErrorBanner, Loading, Screen } from "../../../components/ui"
import { api } from "../../../lib/api"
import { useAuth } from "../../../lib/auth"
import { useFocusData } from "../../../lib/useFocusData"
import { colors, font, spacing } from "../../../theme"

type IconName = ComponentProps<typeof Ionicons>["name"]

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />

export default function CollectorTabsLayout() {
  const { signOut } = useAuth()
  const { data, error, refreshing, refresh } = useFocusData(() => api.collector.me())

  if (!data) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />

  // Collectors who signed up themselves wait here until the office approves them.
  if (data.collector.status === "PENDING") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <Screen refreshing={refreshing} onRefresh={refresh}>
          <View style={{ alignItems: "center", gap: spacing.sm, marginTop: spacing.xxl }}>
            <Ionicons name="hourglass-outline" size={48} color={colors.primary} />
            <Text style={font.title}>Waiting for approval</Text>
          </View>
          <Card>
            <Text style={font.body}>
              Thanks for applying, {data.collector.name.split(" ")[0]}. The WasteCore office will check your details and
              may call you on {data.collector.phone}.
            </Text>
            <Text style={font.muted}>
              Once you're approved, your jobs will appear here. Pull down or tap below to check.
            </Text>
          </Card>
          <Button title="Check again" variant="secondary" loading={refreshing} onPress={refresh} />
          <Button title="Sign out" variant="danger" onPress={() => void signOut()} />
        </Screen>
      </SafeAreaView>
    )
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        headerTitleStyle: { color: colors.text },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "My jobs", tabBarIcon: icon("navigate-outline") }} />
      <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: icon("checkmark-done-outline") }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("person-outline") }} />
    </Tabs>
  )
}
