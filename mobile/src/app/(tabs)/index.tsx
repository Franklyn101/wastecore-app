import Ionicons from "@expo/vector-icons/Ionicons"
import { router, type Href } from "expo-router"
import type { ComponentProps } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { OrderCard } from "../../components/OrderCard"
import { ErrorBanner, Screen, Section } from "../../components/ui"
import { api } from "../../lib/api"
import { useAuth } from "../../lib/auth"
import { useCatalog } from "../../lib/catalog"
import { isActive, naira } from "../../lib/format"
import { useFocusData } from "../../lib/useFocusData"
import { colors, font, radius, spacing } from "../../theme"

type Service = {
  title: string
  subtitle: string
  icon: ComponentProps<typeof Ionicons>["name"]
  href: Href
}

export default function Home() {
  const { user } = useAuth()
  const { catalog, error: catalogError, reload } = useCatalog()
  const { data, error, refreshing, refresh } = useFocusData(() => api.orders())
  const active = data?.orders.filter((o) => isActive(o.status)) ?? []

  const cheapestWeekly = catalog ? Math.min(...catalog.weeklyPlans.map((p) => p.price)) : null
  const cheapestUpgrade = catalog ? Math.min(...catalog.upgradePlans.map((p) => p.price)) : null
  const cheapestBags = catalog ? Math.min(...catalog.bagSizes.map((b) => b.price)) : null

  // The same five services as the WhatsApp bot's main menu.
  const services: Service[] = [
    {
      title: "Instant pickup",
      subtitle: catalog ? naira(catalog.instantPickup.price) : "One-off pickup",
      icon: "flash-outline",
      href: { pathname: "/book/pickup", params: { mode: "instant" } },
    },
    {
      title: "Weekly pickup",
      subtitle: cheapestWeekly ? `From ${naira(cheapestWeekly)}/week` : "Regular pickups",
      icon: "calendar-outline",
      href: { pathname: "/book/pickup", params: { mode: "weekly" } },
    },
    {
      title: "Upgrade plan",
      subtitle: cheapestUpgrade ? `From ${naira(cheapestUpgrade)}/month` : "Monthly plans",
      icon: "star-outline",
      href: "/book/upgrade",
    },
    {
      title: "Waste bags",
      subtitle: cheapestBags ? `From ${naira(cheapestBags)}/pack` : "Packs of 10",
      icon: "bag-handle-outline",
      href: "/book/bags",
    },
    {
      title: "Support",
      subtitle: "Report an issue",
      icon: "help-buoy-outline",
      href: "/support/new",
    },
  ]

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={{ gap: spacing.xs }}>
        <Text style={font.title}>Hello, {user?.name.split(" ")[0]} 👋</Text>
        <Text style={font.muted}>What can we pick up for you today?</Text>
      </View>

      {catalogError ? <ErrorBanner message={catalogError} onRetry={reload} /> : null}
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {active.length > 0 ? (
        <Section title="Active requests">
          {active.slice(0, 3).map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </Section>
      ) : null}

      <Section title="Services">
        <View style={styles.grid}>
          {services.map((s) => (
            <Pressable
              key={s.title}
              accessibilityRole="button"
              accessibilityLabel={`${s.title}, ${s.subtitle}`}
              onPress={() => router.push(s.href)}
              style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.tileIcon}>
                <Ionicons name={s.icon} size={24} color={colors.primary} />
              </View>
              <Text style={font.label}>{s.title}</Text>
              <Text style={font.muted}>{s.subtitle}</Text>
            </Pressable>
          ))}
        </View>
      </Section>
    </Screen>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
})
