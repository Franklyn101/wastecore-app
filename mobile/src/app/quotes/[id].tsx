import { router, useLocalSearchParams } from "expo-router"
import { Image, Text, View } from "react-native"
import { Badge, Button, Card, ErrorBanner, Loading, Row, Screen } from "../../components/ui"
import { api } from "../../lib/api"
import { confirmAction } from "../../lib/dialogs"
import { formatDate, naira, QUOTE_STATUS } from "../../lib/format"
import { useFocusData } from "../../lib/useFocusData"
import { useSubmit } from "../../lib/useSubmit"
import { colors, font, radius } from "../../theme"

export default function QuoteDetails() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, error, refreshing, refresh, setData } = useFocusData(() => api.quote(id))
  const action = useSubmit()

  const quote = data?.quote
  if (!quote) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />
  const status = QUOTE_STATUS[quote.status]

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Text style={[font.heading, { flexShrink: 1 }]}>{quote.category}</Text>
          <Badge label={status.label} tone={status.tone} />
        </View>
        <Text style={font.muted}>
          {quote.status === "NEW"
            ? "We're looking at your request and will send a price soon."
            : quote.status === "QUOTED"
              ? "Here's our price. Accept it to book the pickup and pay."
              : quote.status === "ACCEPTED"
                ? "Accepted. Pay for the pickup to confirm it."
                : quote.status === "DECLINED"
                  ? "You declined this price."
                  : "This request is closed."}
        </Text>
      </Card>

      {quote.amount && (quote.status === "QUOTED" || quote.status === "ACCEPTED") ? (
        <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary }}>
          <Text style={font.muted}>Price</Text>
          <Text style={[font.title, { color: colors.primaryDark }]}>{naira(quote.amount)}</Text>
          {quote.staffNote ? <Text style={font.body}>{quote.staffNote}</Text> : null}
        </Card>
      ) : null}
      {quote.status === "CANCELLED" && quote.staffNote ? (
        <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning }}>
          <Text style={font.label}>Message from WasteCore</Text>
          <Text style={font.body}>{quote.staffNote}</Text>
        </Card>
      ) : null}

      {action.error ? <ErrorBanner message={action.error} /> : null}
      {quote.status === "QUOTED" ? (
        <>
          <Button
            title={`Accept and pay ${naira(quote.amount!)}`}
            loading={action.busy}
            onPress={() =>
              void action.submit(async () => {
                const { order } = await api.acceptQuote(quote.id)
                router.replace(`/orders/${order.id}`)
              })
            }
          />
          <Button
            title="Decline"
            variant="secondary"
            disabled={action.busy}
            onPress={() =>
              confirmAction("Decline this price?", "You can ask for a new quote any time.", "Decline", () =>
                void action.submit(async () => setData(await api.declineQuote(quote.id))),
              )
            }
          />
        </>
      ) : null}
      {quote.orderId ? <Button title="Go to the order" onPress={() => router.push(`/orders/${quote.orderId}`)} /> : null}

      <Card>
        <Row label="Reference" value={quote.reference} />
        <Row label="Best day" value={formatDate(quote.preferredDate)} />
        <Row label="Address" value={quote.address} />
        {quote.landmark ? <Row label="Landmark" value={quote.landmark} /> : null}
        <Text style={font.body}>{quote.description}</Text>
        {quote.photoUrl ? (
          <Image source={{ uri: quote.photoUrl }} style={{ width: "100%", height: 220, borderRadius: radius.md }} resizeMode="cover" />
        ) : null}
      </Card>
      {quote.status === "NEW" ? (
        <Button
          title="Withdraw request"
          variant="danger"
          disabled={action.busy}
          onPress={() =>
            confirmAction("Withdraw this request?", "We'll stop working on a price.", "Withdraw", () =>
              void action.submit(async () => setData(await api.declineQuote(quote.id))),
            )
          }
        />
      ) : null}
    </Screen>
  )
}
