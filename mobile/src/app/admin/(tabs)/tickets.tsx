import { useState } from "react"
import { Linking, ScrollView, Text, View } from "react-native"
import { Badge, Button, Card, Chip, ErrorBanner, Loading, Screen } from "../../../components/ui"
import { api } from "../../../lib/api"
import { formatDate, TICKET_STATUS } from "../../../lib/format"
import type { AdminTicket, TicketStatus } from "../../../lib/types"
import { useFocusData } from "../../../lib/useFocusData"
import { useSubmit } from "../../../lib/useSubmit"
import { font, spacing } from "../../../theme"

const FILTERS: { status: TicketStatus | null; label: string }[] = [
  { status: "OPEN", label: "Open" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "RESOLVED", label: "Resolved" },
  { status: null, label: "All" },
]

export default function AdminTickets() {
  const [status, setStatus] = useState<TicketStatus | null>("OPEN")
  const { data, error, refreshing, refresh } = useFocusData(() => api.admin.tickets(status ?? undefined), String(status))

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {FILTERS.map((f) => (
          <Chip key={f.label} label={f.label} selected={status === f.status} onPress={() => setStatus(f.status)} />
        ))}
      </ScrollView>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {!data && !error ? <Loading /> : null}
      {data?.tickets.length === 0 ? (
        <Card>
          <Text style={font.muted}>No tickets here.</Text>
        </Card>
      ) : null}
      {data?.tickets.map((t) => (
        <TicketCard key={t.id} ticket={t} onChanged={refresh} />
      ))}
    </Screen>
  )
}

function TicketCard({ ticket, onChanged }: { ticket: AdminTicket; onChanged: () => void }) {
  const { busy, error, submit } = useSubmit()
  const status = TICKET_STATUS[ticket.status]
  const move = (to: TicketStatus) =>
    void submit(async () => {
      await api.admin.updateTicket(ticket.id, to)
      onChanged()
    })

  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={font.label}>{ticket.category}</Text>
        <Badge label={status.label} tone={status.tone} />
      </View>
      <Text style={font.body}>{ticket.message}</Text>
      <Text style={font.muted}>
        {ticket.customer.name} · {ticket.customer.phone} · prefers {ticket.contactTime}
      </Text>
      <Text style={font.muted}>
        {ticket.reference} · {formatDate(ticket.createdAt)}
      </Text>
      {error ? <ErrorBanner message={error} /> : null}
      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        <Button
          title="Call"
          variant="secondary"
          onPress={() => void Linking.openURL(`tel:${ticket.customer.phone}`)}
          style={{ flexGrow: 1 }}
        />
        {ticket.status === "OPEN" ? (
          <Button title="Start" variant="secondary" loading={busy} onPress={() => move("IN_PROGRESS")} style={{ flexGrow: 1 }} />
        ) : null}
        {ticket.status !== "RESOLVED" ? (
          <Button title="Resolve" loading={busy} onPress={() => move("RESOLVED")} style={{ flexGrow: 1 }} />
        ) : (
          <Button title="Reopen" variant="secondary" loading={busy} onPress={() => move("OPEN")} style={{ flexGrow: 1 }} />
        )}
      </View>
    </Card>
  )
}
