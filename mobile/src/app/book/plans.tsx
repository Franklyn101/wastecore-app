import { router, Stack, useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { Text, View } from "react-native"
import { DatePicker } from "../../components/DatePicker"
import { Button, Card, Chip, ErrorBanner, Loading, OptionCard, Screen, Section, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { useAuth } from "../../lib/auth"
import { useCatalog } from "../../lib/catalog"
import { naira } from "../../lib/format"
import type { Plan, PlanChangeQuote } from "../../lib/types"
import { useSubmit } from "../../lib/useSubmit"
import { font, spacing } from "../../theme"

// Choose a pickup plan (the bot's "Weekly Pickup" and "Upgrade Plan" options),
// or switch an active plan when opened with ?change=<subscription id>.
export default function ChoosePlan() {
  const { change, current } = useLocalSearchParams<{ change?: string; current?: string }>()
  const { user } = useAuth()
  const { catalog, error: catalogError, reload } = useCatalog()
  const [plan, setPlan] = useState<string | null>(null)
  const [address, setAddress] = useState(user?.address ?? "")
  const [wasteType, setWasteType] = useState<string | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [quote, setQuote] = useState<PlanChangeQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const { busy, error, submit } = useSubmit()

  useEffect(() => {
    setQuote(null)
    setQuoteError(null)
    if (!change || !plan) return
    api
      .changeQuote(change, plan)
      .then((r) => setQuote(r.quote))
      .catch((e: Error) => setQuoteError(e.message))
  }, [change, plan])

  if (!catalog) return catalogError ? <ErrorBanner message={catalogError} onRetry={reload} /> : <Loading />

  const ready = change ? quote?.allowed : plan && address.trim() && wasteType && date

  function next() {
    void submit(async () => {
      const { subscription } = change
        ? await api.changePlan(change, plan!)
        : await api.subscribe({ plan: plan!, address: address.trim(), wasteType: wasteType!, startDate: date! })
      router.replace({ pathname: "/plan/checkout", params: { id: subscription.id } })
    })
  }

  const group = (title: string, subtitle: string, plans: Plan[]) => (
    <Section title={title}>
      <Text style={font.muted}>{subtitle}</Text>
      {plans.map((p) => (
        <OptionCard
          key={p.id}
          title={p.id === current ? `${p.name} (current)` : p.name}
          subtitle={p.priceNote ? `${p.priceNote} · billed ${naira(p.price)} ${p.periodLabel}` : undefined}
          trailing={p.priceNote ? undefined : `${naira(p.price)}/mo`}
          selected={plan === p.id}
          onPress={() => p.id !== current && setPlan(p.id)}
        >
          {p.group === "premium"
            ? p.features.map((f) => (
                <Text key={f} style={font.muted}>
                  • {f}
                </Text>
              ))
            : null}
        </OptionCard>
      ))}
    </Section>
  )

  return (
    <Screen>
      <Stack.Screen options={{ title: change ? "Change plan" : "Choose a plan" }} />
      {group(
        "Weekly plans",
        "Regular pickups, paid every 4 weeks.",
        catalog.plans.filter((p) => p.group === "weekly"),
      )}
      {group(
        "Premium plans",
        "More pickups and waste bags included, paid monthly.",
        catalog.plans.filter((p) => p.group === "premium"),
      )}

      {change ? (
        plan ? (
          quoteError ? (
            <ErrorBanner message={quoteError} />
          ) : quote ? (
            <Card>
              {quote.allowed ? (
                <>
                  <Text style={font.label}>Switch today</Text>
                  <Text style={font.muted}>
                    Your new plan starts today. You get {naira(quote.credit)} credit for the unused part of your current
                    plan, so you pay {naira(quote.amountDue)} now.
                  </Text>
                </>
              ) : (
                <Text style={font.muted}>{quote.message}</Text>
              )}
            </Card>
          ) : (
            <Loading />
          )
        ) : null
      ) : (
        <>
          <TextField label="Pickup address" value={address} onChangeText={setAddress} multiline autoComplete="street-address" />
          <View style={{ gap: spacing.sm }}>
            <Text style={font.label}>Main waste type</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {catalog.wasteTypes.map((t) => (
                <Chip key={t} label={t} selected={wasteType === t} onPress={() => setWasteType(t)} />
              ))}
            </View>
          </View>
          <DatePicker label="First pickup" value={date} onChange={setDate} />
        </>
      )}

      {error ? <ErrorBanner message={error} /> : null}
      <Button title="Continue to payment" onPress={next} loading={busy} disabled={!ready} />
    </Screen>
  )
}
