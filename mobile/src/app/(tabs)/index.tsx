import Ionicons from "@expo/vector-icons/Ionicons"
import { router, type Href } from "expo-router"
import type { ComponentProps } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { OrderCard } from "../../components/OrderCard"
import { Badge, Button, Card, ErrorBanner, Row, Screen, Section } from "../../components/ui"
import { api } from "../../lib/api"
import { useAuth } from "../../lib/auth"
import { useCatalog } from "../../lib/catalog"
import { formatDate, hourLabel, isActive, naira } from "../../lib/format"
import { useFocusData } from "../../lib/useFocusData"
import { colors, font, hairline, radius, shadow, spacing } from "../../theme"

type Service = {
  title: string
  subtitle: string
  icon: ComponentProps<typeof Ionicons>["name"]
  href: Href
  /** Icon colour and its tint, so each service is easy to tell apart. */
  tone: { fg: string; bg: string }
}

const TONES = {
  green: { fg: colors.primaryDark, bg: colors.primarySoft },
  blue: { fg: colors.info, bg: colors.infoSoft },
  amber: { fg: colors.warning, bg: colors.warningSoft },
  slate: { fg: "#4B5563", bg: "#EEF1F4" },
}

export default function Home() {
  const { user } = useAuth()
  const { catalog, error: catalogError, reload } = useCatalog()
  const { data, error, refreshing, refresh } = useFocusData(async () => {
    const [{ orders }, { subscriptions }] = await Promise.all([api.orders(), api.subscriptions()])
    const plan = subscriptions.find((s) => s.status === "ACTIVE") ?? null
    const nextPickup = plan ? ((await api.subscription(plan.id)).upcomingPickups[0] ?? null) : null
    return { orders, plan, nextPickup }
  })
  const active = data?.orders.filter((o) => isActive(o.status)) ?? []
  const plan = data?.plan ?? null

  const weekly = catalog?.plans.filter((p) => p.group === "weekly") ?? []
  const premium = catalog?.plans.filter((p) => p.group === "premium") ?? []
  const cheapestWeekly = weekly.length ? Math.min(...weekly.map((p) => p.price / 4)) : null
  const cheapestPremium = premium.length ? Math.min(...premium.map((p) => p.price)) : null
  const cheapestBags = catalog ? Math.min(...catalog.bagSizes.map((b) => b.price)) : null

  // The WhatsApp bot's services, plus quotes for special waste. Instant pickup leads; support sits below.
  const instant = {
    title: "Instant pickup",
    subtitle: catalog ? `One-time · ${naira(catalog.instantPickup.pricePerBag)}/bag` : "One-time pickup",
  }
  const services: Service[] = [
    {
      title: "Weekly plans",
      subtitle: cheapestWeekly ? `From ${naira(cheapestWeekly)}/week` : "Regular pickups",
      icon: "calendar-outline",
      href: plan ? "/plan" : "/book/plans",
      tone: TONES.green,
    },
    {
      title: plan ? "Upgrade plan" : "Premium plans",
      subtitle: cheapestPremium ? `From ${naira(cheapestPremium)}/month` : "Monthly plans",
      icon: "star-outline",
      href: plan ? { pathname: "/book/plans", params: { change: plan.id, current: plan.plan } } : "/book/plans",
      tone: TONES.amber,
    },
    {
      title: "Waste bags",
      subtitle: cheapestBags ? `From ${naira(cheapestBags)}/pack` : "Packs of 10",
      icon: "bag-handle-outline",
      href: "/book/bags",
      tone: TONES.blue,
    },
    {
      title: "Special waste",
      subtitle: "Rubble, furniture, electronics",
      icon: "construct-outline",
      href: "/quotes",
      tone: TONES.slate,
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

      {plan ? (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={font.heading}>{plan.planName}</Text>
            <Badge label="Active" tone="success" />
          </View>
          {data?.nextPickup ? <Row label="Next pickup" value={formatDate(data.nextPickup.scheduledDate)} /> : null}
          {plan.currentPeriodEnd ? (
            <Row label={plan.autoRenew ? "Renews on" : "Ends on"} value={formatDate(plan.currentPeriodEnd)} />
          ) : null}
          <Button title="Manage plan" variant="secondary" onPress={() => router.push("/plan")} />
        </Card>
      ) : null}

      {active.length > 0 ? (
        <Section title="Active requests">
          {active.slice(0, 3).map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </Section>
      ) : null}

      <Section title="Services">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${instant.title}, ${instant.subtitle}`}
          onPress={() => router.push("/book/pickup")}
          style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
        >
          <View style={styles.heroIcon}>
            <Ionicons name="flash" size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.heroTitle}>{instant.title}</Text>
            <Text style={styles.heroSubtitle}>{instant.subtitle}</Text>
            {catalog ? (
              <Text style={styles.heroNote}>Same day if booked before {hourLabel(catalog.instantPickup.asapCutoffHour)}</Text>
            ) : null}
          </View>
          <Ionicons name="arrow-forward-circle" size={32} color="#FFFFFF" />
        </Pressable>

        <View style={styles.grid}>
          {services.map((s) => (
            <Pressable
              key={s.title}
              accessibilityRole="button"
              accessibilityLabel={`${s.title}, ${s.subtitle}`}
              onPress={() => router.push(s.href)}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
            >
              <View style={styles.tileTop}>
                <View style={[styles.tileIcon, { backgroundColor: s.tone.bg }]}>
                  <Ionicons name={s.icon} size={22} color={s.tone.fg} />
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              <Text style={font.label} numberOfLines={1}>
                {s.title}
              </Text>
              <Text style={font.muted} numberOfLines={2}>
                {s.subtitle}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Need help? Contact support"
          onPress={() => router.push("/support/new")}
          style={({ pressed }) => [styles.helpRow, pressed && styles.pressed]}
        >
          <Ionicons name="help-buoy-outline" size={20} color={colors.primaryDark} />
          <Text style={[font.body, { flex: 1 }]}>
            Need help? <Text style={{ color: colors.primaryDark, fontWeight: "700" }}>Contact support</Text>
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </Section>
    </Screen>
  )
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.raised,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  heroSubtitle: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
  heroNote: { fontSize: 13, color: "#FFFFFF", opacity: 0.95 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 132,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 4,
    borderWidth: 1,
    borderColor: hairline,
    ...shadow.card,
  },
  tileTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.sm },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  helpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: hairline,
    ...shadow.card,
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
})
