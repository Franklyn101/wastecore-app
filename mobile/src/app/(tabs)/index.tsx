import Ionicons from "@expo/vector-icons/Ionicons"
import { router, type Href } from "expo-router"
import type { ComponentProps } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { OrderCard } from "../../components/OrderCard"
import { Badge, Button, Card, ErrorBanner, Row, Screen, Section } from "../../components/ui"
import { api } from "../../lib/api"
import { useAuth } from "../../lib/auth"
import { useCatalog } from "../../lib/catalog"
import { daysUntil, formatDate, hourLabel, isActive, naira, orderTitle } from "../../lib/format"
import type { Order, Subscription } from "../../lib/types"
import { useFocusData } from "../../lib/useFocusData"
import { colors, font, hairline, radius, shadow, spacing } from "../../theme"

type Service = {
  title: string
  subtitle: string
  /** e.g. "From ₦1,500/week". */
  price?: string
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
    const [{ orders }, { subscriptions, renewWindowDays }] = await Promise.all([api.orders(), api.subscriptions()])
    const plan = subscriptions.find((s) => s.status === "ACTIVE") ?? null
    const nextPickup = plan ? ((await api.subscription(plan.id)).upcomingPickups[0] ?? null) : null
    return { orders, subscriptions, renewWindowDays, plan, nextPickup }
  })
  const plan = data?.plan ?? null
  const toPay = data ? amountsDue(data.orders, data.subscriptions, data.renewWindowDays) : []
  // Unpaid bookings are under "To pay", so they're not listed twice.
  const active = data?.orders.filter((o) => isActive(o.status) && o.status !== "AWAITING_PAYMENT") ?? []

  const weekly = catalog?.plans.filter((p) => p.group === "weekly") ?? []
  const premium = catalog?.plans.filter((p) => p.group === "premium") ?? []
  const cheapestWeekly = weekly.length ? Math.min(...weekly.map((p) => p.price / 4)) : null
  const cheapestMonthly = premium.length ? Math.min(...premium.map((p) => p.price)) : null
  const cheapestBags = catalog ? Math.min(...catalog.bagSizes.map((b) => b.price)) : null
  const weeklyBags = weekly[0]?.bagsPerPickup
  const monthlyBags = premium[0]?.bagsPerPickup
  const pricing = catalog?.pickupPricing

  // One-time pickups lead; then regular plans, bags and special waste.
  const services: Service[] = [
    {
      title: plan ? "My plan" : "Weekly plans",
      subtitle: plan ? `${plan.planName}. Manage or upgrade` : `Every week${weeklyBags ? `, up to ${weeklyBags} bags` : ""}`,
      price: !plan && cheapestWeekly ? `From ${naira(cheapestWeekly)}/week` : undefined,
      icon: "calendar-outline",
      href: plan ? "/plan" : "/book/plans",
      tone: TONES.green,
    },
    {
      title: "Monthly plans",
      subtitle: `Bigger pickups${monthlyBags ? `, up to ${monthlyBags} bags` : ""}`,
      price: cheapestMonthly ? `From ${naira(cheapestMonthly)}/month` : undefined,
      icon: "star-outline",
      href: plan ? { pathname: "/book/plans", params: { change: plan.id, current: plan.plan } } : "/book/plans",
      tone: TONES.amber,
    },
    {
      title: "Buy bag packs",
      subtitle: "Packs of 10, delivered",
      price: cheapestBags ? `From ${naira(cheapestBags)}/pack` : undefined,
      icon: "bag-handle-outline",
      href: "/book/bags",
      tone: TONES.blue,
    },
    {
      title: "Special waste",
      subtitle: "Rubble, furniture, electronics",
      price: "We send you a price",
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

      {toPay.length ? (
        <Section title="To pay">
          {toPay.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${naira(item.amount)}. ${item.action}`}
              onPress={() => router.push(item.href)}
              style={({ pressed }) => [styles.dueRow, pressed && styles.pressed]}
            >
              <Ionicons name="wallet-outline" size={22} color={colors.warning} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={font.label}>{item.title}</Text>
                <Text style={font.muted}>{item.note}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text style={styles.dueAmount}>{naira(item.amount)}</Text>
                <Text style={styles.dueAction}>{item.action} ›</Text>
              </View>
            </Pressable>
          ))}
        </Section>
      ) : null}

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
          accessibilityLabel="Book a one-time pickup"
          onPress={() => router.push("/book/pickup")}
          style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={styles.heroIcon}>
              <Ionicons name="trash-bin" size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.heroTitle}>Book a pickup</Text>
              <Text style={styles.heroSubtitle}>One-time. Pay per bag.</Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={32} color="#FFFFFF" />
          </View>
          {pricing && catalog ? (
            <View style={styles.speeds}>
              <View style={styles.speed}>
                <Text style={styles.speedTitle}>Pick a date</Text>
                <Text style={styles.speedPrice}>{naira(pricing.scheduled.firstBags)}/bag</Text>
                <Text style={styles.speedNote}>Cheaper</Text>
              </View>
              <View style={styles.speed}>
                <Text style={styles.speedTitle}>As soon as possible</Text>
                <Text style={styles.speedPrice}>{naira(pricing.instant.firstBags)}/bag</Text>
                <Text style={styles.speedNote}>Same day before {hourLabel(catalog.instantPickup.asapCutoffHour)}</Text>
              </View>
            </View>
          ) : null}
        </Pressable>

        <View style={styles.grid}>
          {services.map((s) => (
            <Pressable
              key={s.title}
              accessibilityRole="button"
              accessibilityLabel={`${s.title}, ${s.subtitle}${s.price ? `, ${s.price}` : ""}`}
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
              {s.price ? (
                <Text style={styles.tilePrice} numberOfLines={1}>
                  {s.price}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="All prices and how to pay"
          onPress={() => router.push("/prices")}
          style={({ pressed }) => [styles.helpRow, pressed && styles.pressed]}
        >
          <Ionicons name="pricetags-outline" size={20} color={colors.primaryDark} />
          <Text style={[font.body, { flex: 1 }]}>
            <Text style={{ color: colors.primaryDark, fontWeight: "700" }}>All prices and how to pay</Text>
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

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

type Due = { key: string; title: string; note: string; amount: number; action: string; href: Href }

/** Everything the customer owes: unpaid bookings, charges after a pickup, and plans to pay for or renew. */
function amountsDue(orders: Order[], subscriptions: Subscription[], renewWindowDays: number): Due[] {
  const due: Due[] = []
  for (const o of orders) {
    if (o.status === "AWAITING_PAYMENT") {
      due.push({
        key: o.id,
        title: orderTitle(o),
        note: o.receiptUrl ? `${o.reference} · check your receipt` : `${o.reference} · not booked until paid`,
        amount: o.amount,
        action: "Pay now",
        href: `/orders/${o.id}`,
      })
    } else if (o.extraAmount > 0 && !o.extraPaidAt) {
      due.push({
        key: `${o.id}-extra`,
        title: o.wastedTrip ? "Wasted-trip fee" : "Extra bags",
        note: o.wastedTrip ? `${o.reference} · nothing to collect` : `${o.reference} · ${o.bagsCollected} bags collected`,
        amount: o.extraAmount,
        action: "Pay",
        href: `/orders/${o.id}`,
      })
    }
  }
  for (const s of subscriptions) {
    if (s.status === "PENDING_PAYMENT") {
      due.push({
        key: s.id,
        title: s.planName,
        note: "Your plan starts once it's paid",
        amount: Math.max(0, s.price - s.credit),
        action: "Pay now",
        href: { pathname: "/plan/checkout", params: { id: s.id } },
      })
    } else if (s.status === "ACTIVE" && !s.autoRenew && s.currentPeriodEnd && daysUntil(s.currentPeriodEnd) <= renewWindowDays) {
      due.push({
        key: `${s.id}-renew`,
        title: `Renew ${s.planName}`,
        note: `Ends ${formatDate(s.currentPeriodEnd)}`,
        amount: s.price,
        action: "Renew",
        href: { pathname: "/plan/checkout", params: { id: s.id } },
      })
    }
  }
  return due
}

const styles = StyleSheet.create({
  dueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  dueAmount: { fontSize: 17, fontWeight: "800", color: colors.text },
  dueAction: { fontSize: 13, fontWeight: "700", color: colors.warning },
  speeds: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  speed: { flex: 1, backgroundColor: "rgba(255,255,255,0.16)", borderRadius: radius.md, padding: spacing.md, gap: 2 },
  speedTitle: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },
  speedPrice: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  speedNote: { fontSize: 12, color: "#FFFFFF", opacity: 0.95 },
  hero: {
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
  tilePrice: { fontSize: 14, fontWeight: "700", color: colors.primaryDark, marginTop: 2 },
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
