import { router, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { Image, Linking, Pressable, Text, View } from "react-native"
import { MapView } from "../../../components/MapView"
import { Badge, Button, Card, ErrorBanner, Loading, Row, Screen, Section, TextField } from "../../../components/ui"
import { api } from "../../../lib/api"
import { formatDate, naira, QUOTE_STATUS } from "../../../lib/format"
import { directionsUrl } from "../../../lib/location"
import { useFocusData } from "../../../lib/useFocusData"
import { useSubmit } from "../../../lib/useSubmit"
import { colors, font, radius, spacing } from "../../../theme"

export default function AdminQuote() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, error, refreshing, refresh, setData } = useFocusData(() => api.admin.quote(id))
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [closing, setClosing] = useState(false)
  const action = useSubmit()

  const quote = data?.quote
  if (!quote) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />
  const open = quote.status === "NEW" || quote.status === "QUOTED"
  const price = Number(amount.replace(/\D/g, ""))

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
          <Text style={[font.heading, { flexShrink: 1 }]}>{quote.category}</Text>
          <Badge label={QUOTE_STATUS[quote.status].label} tone={QUOTE_STATUS[quote.status].tone} />
        </View>
        <Text style={font.body}>{quote.description}</Text>
        <Row label="Reference" value={quote.reference} />
        <Row label="Wants it on" value={formatDate(quote.preferredDate)} />
        <Row label="Asked" value={formatDate(quote.createdAt)} />
        {quote.amount ? <Row label="Quoted" value={naira(quote.amount)} /> : null}
        {quote.staffNote ? <Text style={font.muted}>Note: {quote.staffNote}</Text> : null}
      </Card>

      {quote.photoUrl ? (
        <Pressable accessibilityRole="imagebutton" accessibilityLabel="Open photo full size" onPress={() => void Linking.openURL(quote.photoUrl!)}>
          <Image source={{ uri: quote.photoUrl }} style={{ width: "100%", height: 260, borderRadius: radius.md }} resizeMode="cover" />
        </Pressable>
      ) : null}

      <Section title="Where">
        <Card>
          <MapView center={{ lat: quote.lat, lng: quote.lng }} pin={{ lat: quote.lat, lng: quote.lng }} height={180} zoom={16} />
          <Text style={font.body}>{quote.address}</Text>
          {quote.landmark ? <Text style={font.muted}>{quote.landmark}</Text> : null}
          <Button title="Directions" variant="secondary" onPress={() => void Linking.openURL(directionsUrl(quote))} />
        </Card>
      </Section>

      <Section title="Customer">
        <Card>
          <Row label={quote.customer.name} value={quote.customer.phone} />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button title="Call" variant="secondary" style={{ flex: 1 }} onPress={() => void Linking.openURL(`tel:${quote.customer.phone}`)} />
            <Button
              title="WhatsApp"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => void Linking.openURL(`https://wa.me/${quote.customer.phone.replace(/^\+/, "")}`)}
            />
          </View>
        </Card>
      </Section>

      {action.error ? <ErrorBanner message={action.error} /> : null}
      {open && !closing ? (
        <Card style={{ borderColor: colors.primary }}>
          <Text style={font.heading}>{quote.status === "QUOTED" ? "Change the price" : "Send a price"}</Text>
          <TextField label="Price (₦)" keyboardType="number-pad" value={amount} onChangeText={setAmount} />
          <TextField
            label="What it covers (shown to the customer)"
            placeholder="e.g. Truck and two loaders, one trip"
            value={note}
            onChangeText={setNote}
            maxLength={500}
          />
          <Button
            title={price ? `Send ${naira(price)}` : "Send price"}
            loading={action.busy}
            disabled={price < 500}
            onPress={() =>
              void action.submit(async () => {
                setData(await api.admin.sendQuote(quote.id, { amount: price, note: note.trim() || undefined }))
                setAmount("")
                setNote("")
              })
            }
          />
          <Button title="We can't do this" variant="danger" onPress={() => setClosing(true)} />
        </Card>
      ) : null}
      {open && closing ? (
        <Card style={{ borderColor: colors.danger }}>
          <TextField label="Tell the customer why" value={note} onChangeText={setNote} maxLength={500} />
          <Button
            title="Close request"
            variant="danger"
            loading={action.busy}
            disabled={note.trim().length < 3}
            onPress={() => void action.submit(async () => setData(await api.admin.closeQuote(quote.id, note.trim())))}
          />
          <Button title="Back" variant="secondary" onPress={() => setClosing(false)} />
        </Card>
      ) : null}
      {quote.orderId ? <Button title="Open the order" onPress={() => router.push(`/admin/orders/${quote.orderId}`)} /> : null}
    </Screen>
  )
}
