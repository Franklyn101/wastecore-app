import { router, useLocalSearchParams } from "expo-router"
import { Text } from "react-native"
import { useState } from "react"
import { Button, ErrorBanner, Loading, OptionCard, Screen, Section, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { useCatalog } from "../../lib/catalog"
import { notify } from "../../lib/dialogs"
import { useSubmit } from "../../lib/useSubmit"
import { font } from "../../theme"

export default function NewTicket() {
  // Opened from an order's "Report a problem", the ticket is linked to that order.
  const { orderId, reference } = useLocalSearchParams<{ orderId?: string; reference?: string }>()
  const { catalog, error: catalogError, reload } = useCatalog()
  const [category, setCategory] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [contactTime, setContactTime] = useState("")
  const { busy, error, submit } = useSubmit()

  if (!catalog) return catalogError ? <ErrorBanner message={catalogError} onRetry={reload} /> : <Loading />

  const ready = category && message.trim() && contactTime.trim()

  function send() {
    if (!ready) return
    void submit(async () => {
      const { ticket } = await api.createTicket({
        category: category!,
        message: message.trim(),
        contactTime: contactTime.trim(),
        ...(orderId ? { orderId } : {}),
      })
      const note = `Your ticket ID is ${ticket.reference}. A WasteCore agent will reach out shortly.`
      notify("Ticket raised", note)
      router.back()
    })
  }

  return (
    <Screen>
      {reference ? <Text style={font.muted}>About order {reference}</Text> : null}
      <Section title="What's the issue?">
        {catalog.supportCategories.map((c) => (
          <OptionCard key={c} title={c} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </Section>
      <TextField label="Describe the issue" value={message} onChangeText={setMessage} multiline maxLength={1000} />
      <TextField
        label="Preferred contact time"
        placeholder="e.g. mornings, afternoons, anytime"
        value={contactTime}
        onChangeText={setContactTime}
        maxLength={100}
      />
      {error ? <ErrorBanner message={error} /> : null}
      <Button title="Submit ticket" onPress={send} loading={busy} disabled={!ready} />
    </Screen>
  )
}
