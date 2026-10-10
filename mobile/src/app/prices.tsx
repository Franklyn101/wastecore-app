import { router } from "expo-router"
import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { Button, Card, ErrorBanner, Loading, Row, Screen, Section } from "../components/ui"
import { useCatalog } from "../lib/catalog"
import { hourLabel, naira } from "../lib/format"
import { pickupPrice } from "../lib/pricing"
import { colors, font, spacing } from "../theme"

// Every service and what it costs, in one place, plus how and when customers pay.
// All prices come from the server (the main admin sets them).
export default function Prices() {
  const { catalog, error, reload } = useCatalog()
  if (!catalog) return error ? <ErrorBanner message={error} onRetry={reload} /> : <Loading />

  const p = catalog.pickupPricing
  const tier = p.tierBags
  const weekly = catalog.plans.filter((x) => x.group === "weekly")
  const monthly = catalog.plans.filter((x) => x.group === "premium")

  return (
    <Screen>
      <Text style={font.muted}>Everything WasteCore offers and what it costs. You always see the total before you pay.</Text>

      <Section title="One-time pickup">
        <Card style={{ gap: spacing.sm }}>
          <Text style={font.body}>No subscription. Book it when you need it and pay per bag.</Text>
          <Table
            head={["", "Pick a date", "As soon as possible"]}
            rows={[
              [`Each of the first ${tier} bags`, naira(p.scheduled.firstBags), naira(p.instant.firstBags)],
              ["Each bag after that", naira(p.scheduled.extraBag), naira(p.instant.extraBag)],
              ["Least you pay", naira(p.scheduled.minimum), naira(p.instant.minimum)],
              ["Example: 3 bags", naira(pickupPrice(3, false, p)), naira(pickupPrice(3, true, p))],
            ]}
          />
          <Text style={font.muted}>
            "Pick a date" costs less because we come with other pickups in your area. "As soon as possible" is the same day if you book
            before {hourLabel(catalog.instantPickup.asapCutoffHour)}.
          </Text>
          <Button title="Book a pickup" onPress={() => router.push("/book/pickup")} />
        </Card>
      </Section>

      <Section title="Pickup plans">
        <Card style={{ gap: spacing.sm }}>
          <Text style={font.body}>Regular pickups on set days, paid up front. Cheaper than booking each time.</Text>
          {[...weekly, ...monthly].map((plan) => (
            <View key={plan.id} style={{ gap: 2 }}>
              <Row label={plan.name} value={`${naira(plan.price)} ${plan.periodLabel}`} />
              <Text style={font.muted}>
                {[plan.priceNote, plan.group === "premium" ? plan.features[0] : null, `Up to ${plan.bagsPerPickup} bags each pickup`]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          ))}
          <Text style={font.muted}>
            Weekly plans are paid every 4 weeks; monthly plans every month and include extras like priority support. Bags over your plan's
            limit are {naira(p.scheduled.extraBag)} each.
          </Text>
          <Button title="See plans" variant="secondary" onPress={() => router.push("/book/plans")} />
        </Card>
      </Section>

      <Section title="Waste bags">
        <Card style={{ gap: spacing.sm }}>
          <Text style={font.body}>Two ways to get bags:</Text>
          <Row label="WasteCore bag at your pickup" value={`${naira(p.wastecoreBag)} each`} />
          <Text style={font.muted}>Add them when you book a pickup; your collector brings them.</Text>
          {catalog.bagSizes.map((b) => (
            <Row key={b.id} label={`${b.name} bags, pack of ${b.packSize}, delivered`} value={naira(b.price)} />
          ))}
          <Text style={font.muted}>Bag packs are delivered to your address on their own, without a pickup.</Text>
          <Button title="Order bag packs" variant="secondary" onPress={() => router.push("/book/bags")} />
        </Card>
      </Section>

      <Section title="Special waste">
        <Card style={{ gap: spacing.sm }}>
          <Text style={font.body}>
            Rubble, furniture, electronics, garden waste and clear-outs don't fit in bags. Send a photo and a description and we'll send
            you a price. You only pay if you accept it.
          </Text>
          <Button title="Ask for a price" variant="secondary" onPress={() => router.push("/quotes")} />
        </Card>
      </Section>

      <Section title="Charges at the pickup">
        <Card style={{ gap: spacing.sm }}>
          <Row label="Extra bags" value="Same prices as above" />
          <Text style={font.muted}>
            If you put out more bags than you booked, you pay the difference, as if you'd booked them all. Your collector records the
            count and you can pay in the app or give them cash.
          </Text>
          <Row label="Wasted trip" value={naira(p.wastedTripFee)} />
          <Text style={font.muted}>If your collector comes and there's no waste out or nobody is home.</Text>
        </Card>
      </Section>

      <Section title="How to pay">
        <Card style={{ gap: spacing.sm }}>
          <Step n={1}>You see the full price before you book. Nothing is charged until you pay.</Step>
          <Step n={2}>
            {catalog.onlinePayments
              ? "Pay online with card, bank transfer or USSD (through Paystack), or "
              : "Pay "}
            by bank transfer to {catalog.bank.bankName} {catalog.bank.accountNumber} ({catalog.bank.accountName}) and upload your
            receipt.
          </Step>
          <Step n={3}>We assign a collector once your payment is confirmed.</Step>
          <Step n={4}>Anything owed after a pickup (extra bags or a wasted trip) shows on your Home screen under "To pay".</Step>
          <Text style={font.muted}>Every payment and refund is listed under Account, Payment history.</Text>
        </Card>
      </Section>
    </Screen>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: colors.primarySoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.primaryDark, fontWeight: "700", fontSize: 13 }}>{n}</Text>
      </View>
      <Text style={[font.body, { flex: 1 }]}>{children}</Text>
    </View>
  )
}

/** A small table: a header row, then rows whose first cell is a label. */
function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  const cell = (text: string, i: number, bold: boolean) => (
    <Text
      key={i}
      style={[
        i === 0 ? font.muted : font.body,
        { flex: i === 0 ? 1.4 : 1, textAlign: i === 0 ? "left" : "right", fontWeight: bold && i > 0 ? "700" : i > 0 ? "600" : "400" },
      ]}
    >
      {text}
    </Text>
  )
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>{head.map((h, i) => cell(h, i, true))}</View>
      {rows.map((r) => (
        <View key={r[0]} style={{ flexDirection: "row", gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs }}>
          {r.map((c, i) => cell(c, i, false))}
        </View>
      ))}
    </View>
  )
}
