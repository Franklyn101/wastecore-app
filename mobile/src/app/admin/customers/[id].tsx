import { router, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { Linking, Pressable, Text, View } from "react-native"
import { Badge, Button, Card, ErrorBanner, Loading, Row, Screen, Section, TextField } from "../../../components/ui"
import { api } from "../../../lib/api"
import { useIsOwner } from "../../../lib/auth"
import { confirmAction } from "../../../lib/dialogs"
import { formatDate, naira, ORDER_TYPE_LABELS, orderStatus, SUBSCRIPTION_STATUS } from "../../../lib/format"
import { useFocusData } from "../../../lib/useFocusData"
import { useSubmit } from "../../../lib/useSubmit"
import { colors, font, spacing } from "../../../theme"

export default function CustomerDetails() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, error, refreshing, refresh } = useFocusData(() => api.admin.customer(id))
  const [reason, setReason] = useState("")
  const [suspending, setSuspending] = useState(false)
  const action = useSubmit()
  const owner = useIsOwner()

  if (!data) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />
  const { customer: c } = data

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={font.heading}>{c.name}</Text>
          {c.suspendedAt ? <Badge label="Suspended" tone="danger" /> : null}
        </View>
        <Row label="Phone" value={`${c.phone}${c.phoneVerified ? " ✓" : ""}`} />
        {c.email ? <Row label="Email" value={c.email} /> : null}
        <Row label="Joined" value={formatDate(c.createdAt)} />
        <Row label="Paid online" value={naira(c.paidOnline)} />
        <Row label="Support tickets" value={String(c.tickets)} />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button title="Call" variant="secondary" style={{ flex: 1 }} onPress={() => void Linking.openURL(`tel:${c.phone}`)} />
          <Button
            title="WhatsApp"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => void Linking.openURL(`https://wa.me/${c.phone.replace(/^\+/, "")}`)}
          />
        </View>
      </Card>

      {c.suspendedAt ? (
        <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.danger }}>
          <Text style={font.label}>Suspended on {formatDate(c.suspendedAt)}</Text>
          {c.suspendedReason ? <Text style={font.body}>{c.suspendedReason}</Text> : null}
          {owner ? (
            <Button
              title="Restore account"
              variant="secondary"
              loading={action.busy}
              onPress={() =>
                void action.submit(async () => {
                  await api.admin.restoreCustomer(c.id)
                  refresh()
                })
              }
            />
          ) : null}
        </Card>
      ) : null}

      {data.addresses.length ? (
        <Section title="Addresses">
          {data.addresses.map((a) => (
            <Card key={a.id} style={{ gap: 2 }}>
              <Text style={font.label}>{a.label}</Text>
              <Text style={font.body}>{a.address}</Text>
              {a.landmark ? <Text style={font.muted}>{a.landmark}</Text> : null}
            </Card>
          ))}
        </Section>
      ) : null}

      {data.plans.length ? (
        <Section title="Plans">
          {data.plans.map((p) => (
            <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push(`/admin/plans/${p.id}`)}>
              <Card style={{ paddingVertical: spacing.md }}>
                <Row label={p.plan} value={SUBSCRIPTION_STATUS[p.status].label} />
              </Card>
            </Pressable>
          ))}
        </Section>
      ) : null}

      <Section title="Recent orders">
        {data.orders.length === 0 ? <Text style={font.muted}>No orders yet.</Text> : null}
        {data.orders.map((o) => (
          <Pressable key={o.id} accessibilityRole="button" onPress={() => router.push(`/admin/orders/${o.id}`)}>
            <Card style={{ paddingVertical: spacing.md, gap: 2 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                <Text style={font.label}>
                  {ORDER_TYPE_LABELS[o.type]} · {o.reference}
                </Text>
                <Badge label={orderStatus(o).label} tone={orderStatus(o).tone} />
              </View>
              <Text style={font.muted}>
                {formatDate(o.createdAt)} · {naira(o.amount)}
              </Text>
            </Card>
          </Pressable>
        ))}
      </Section>

      {action.error ? <ErrorBanner message={action.error} /> : null}
      {owner && !c.suspendedAt && !suspending ? (
        <Button title="Suspend account" variant="danger" onPress={() => setSuspending(true)} />
      ) : null}
      {suspending && !c.suspendedAt ? (
        <Card style={{ borderColor: colors.danger }}>
          <Text style={font.muted}>They'll be signed out and can't sign in until restored. Their orders and plans stay.</Text>
          <TextField label="Reason (kept for staff)" value={reason} onChangeText={setReason} maxLength={300} />
          <Button
            title="Suspend"
            variant="danger"
            loading={action.busy}
            disabled={reason.trim().length < 3}
            onPress={() =>
              confirmAction(`Suspend ${c.name}?`, "They won't be able to use the app.", "Suspend", () =>
                void action.submit(async () => {
                  await api.admin.suspendCustomer(c.id, reason.trim())
                  setSuspending(false)
                  setReason("")
                  refresh()
                }),
              )
            }
          />
          <Button title="Never mind" variant="secondary" onPress={() => setSuspending(false)} />
        </Card>
      ) : null}
    </Screen>
  )
}
