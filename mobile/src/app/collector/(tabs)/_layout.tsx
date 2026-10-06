import Ionicons from "@expo/vector-icons/Ionicons"
import { Tabs } from "expo-router/js-tabs"
import type { ComponentProps } from "react"
import type { ColorValue } from "react-native"
import { colors } from "../../../theme"

type IconName = ComponentProps<typeof Ionicons>["name"]

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />

export default function CollectorTabsLayout() {
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
