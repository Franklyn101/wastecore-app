import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { Loading } from "../components/ui"
import { AuthProvider, useAuth } from "../lib/auth"
import { CatalogProvider } from "../lib/catalog"
import { colors } from "../theme"

function RootNavigator() {
  const { user, loading } = useAuth()
  if (loading) return <Loading />

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={!user}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ title: "Create account" }} />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="book/pickup" options={{ title: "Book a pickup" }} />
        <Stack.Screen name="book/upgrade" options={{ title: "Upgrade plan" }} />
        <Stack.Screen name="book/bags" options={{ title: "Order waste bags" }} />
        <Stack.Screen name="orders/[id]" options={{ title: "Order details" }} />
        <Stack.Screen name="support/new" options={{ title: "Contact support" }} />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <CatalogProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </CatalogProvider>
    </AuthProvider>
  )
}
