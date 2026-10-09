import Ionicons from "@expo/vector-icons/Ionicons"
import { Tabs } from "expo-router/js-tabs"
import type { ComponentProps } from "react"
import type { ColorValue } from "react-native"
import { HeaderMark } from "../../components/BrandLogo"
import { NotificationsBell } from "../../components/NotificationsBell"
import { colors } from "../../theme"

type IconName = ComponentProps<typeof Ionicons>["name"]

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />

export default function TabsLayout() {
  return (
    <Tabs
      // The app draws one tab bar for every screen (components/AppTabBar).
      tabBar={() => null}
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        headerTitleStyle: { color: colors.text },
        sceneStyle: { backgroundColor: colors.background },
        headerRight: () => <NotificationsBell />,
        headerLeft: () => <HeaderMark />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home-outline") }} />
      <Tabs.Screen name="plan" options={{ title: "My plan", tabBarIcon: icon("calendar-outline") }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", tabBarIcon: icon("receipt-outline") }} />
      <Tabs.Screen name="support" options={{ title: "Support", tabBarIcon: icon("chatbubbles-outline") }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("person-outline") }} />
    </Tabs>
  )
}
