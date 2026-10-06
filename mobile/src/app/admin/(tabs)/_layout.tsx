import Ionicons from "@expo/vector-icons/Ionicons"
import { Tabs } from "expo-router/js-tabs"
import type { ComponentProps } from "react"
import type { ColorValue } from "react-native"
import { colors } from "../../../theme"

type IconName = ComponentProps<typeof Ionicons>["name"]

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />

export default function AdminTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        headerTitleStyle: { color: colors.text },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Orders", tabBarIcon: icon("file-tray-full-outline") }} />
      <Tabs.Screen name="plans" options={{ title: "Plans", tabBarIcon: icon("calendar-outline") }} />
      <Tabs.Screen name="collectors" options={{ title: "Collectors", tabBarIcon: icon("people-outline") }} />
      <Tabs.Screen name="tickets" options={{ title: "Tickets", tabBarIcon: icon("chatbubbles-outline") }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("person-outline") }} />
    </Tabs>
  )
}
