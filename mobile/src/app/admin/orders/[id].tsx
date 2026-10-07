import { useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native"
import { RefundSection } from "../../../components/RefundForm"
import { Badge, Button, Card, ErrorBanner, Loading, OptionCard, Row, Screen, Section, TextField } from "../../../components/ui"
import { api } from "../../../lib/api"
import { useIsOwner } from "../../../lib/auth"
import { confirmAction } from "../../../lib/dialogs"
import { assignable, formatDate, naira, ORDER_TYPE_LABELS, orderStatus, pickupWhen } from "../../../lib/format"
import type { AdminOrder, Collector } from "../../../lib/types"
import { directionsUrl } from "../../../lib/location"
import { useFocusData } from "../../../lib/useFocusData"
import { useSubmit } from "../../../lib/useSubmit"
import { colors, font, radius, spacing } from "../../../theme"

type Update = Parameters<typeof api.admin.updateOrder>[1]

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  })
}

/** wa.me wants the number without "+". */
const whatsappUrl = (phone: string) => `https://wa.me/${phone.replace(/^\+/, "")}`

export default function ManageOrder() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, error, refreshing, refresh, setData } = useFocusData(() => api.admin.order(id))
  const collectors = useFocusData(() => api.admin.collectors())
  const action = useSubmit()
  const owner = useIsOwner()

  const [collectorId, setCollectorId] = useState<string | null>(null)
  const [changingCollector, setChangingCollector] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [adminNote, setAdminNote] = useState("")

  const order = data?.order
  useEffect(() => {
    if (!order) return
    setCollectorId(order.collector?.id ?? null)
    setAdminNote(order.adminNote ?? "")
  }, [order])

  if (!order) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />

  const status = orderStatus(order)
  const isBags = order.type === "WASTE_BAGS"
  const active = collectors.data?.collectors.filter(assignable) ?? []

  function update(body: Update, after?: () => void) {
    void action.submit(async () => {
      const { order: updated } = await api.admin.updateOrder(order!.id, body)
      setData((d) => ({ order: updated, refunds: d?.refunds ?? [] }))
      after?.()
    })
  }

  const done = isBags ? "Mark delivered" : "Mark completed"

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Card>
        <View style={styles.headerRow}>
          <Text style={font.heading}>
            {ORDER_TYPE_LABELS[order.type]} · {order.reference}
          </Text>
          <Badge label={status.label} tone={status.tone} />
        </View>
        <Text style={font.muted}>Booked {formatDateTime(order.createdAt)}</Text>
      </Card>

      {action.error ? <ErrorBanner message={action.error} /> : null}

      <NextStep
        order={order}
        busy={action.busy}
        collectors={active}
        collectorId={collectorId}
        setCollectorId={setCollectorId}
        changingCollector={changingCollector}
        setChangingCollector={setChangingCollector}
        rejecting={rejecting}
        setRejecting={setRejecting}
        reason={reason}
        setReason={setReason}
        doneLabel={done}
        update={update}
      />

      <Section title="Payment">
        {order.type === "PLAN_PICKUP" ? (
          <Card>
            <Text style={font.muted}>Included in the customer's {order.planLabel} plan, paid online.</Text>
          </Card>
        ) : order.paymentMethod === "PAYSTACK" ? (
          <Card>
            <Text style={font.label}>Paid online with Paystack</Text>
            <Text style={font.muted}>
              {naira(order.amount)} verified{order.paidAt ? ` on ${formatDateTime(order.paidAt)}` : ""}. No receipt check
              needed.
            </Text>
          </Card>
        ) : order.receiptUrl ? (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel="Open receipt full size"
            onPress={() => void Linking.openURL(order.receiptUrl!)}
          >
            <Image source={{ uri: order.receiptUrl }} style={styles.receipt} resizeMode="contain" />
            <Text style={[font.muted, { marginTop: spacing.xs }]}>
              Uploaded {order.paidAt ? formatDateTime(order.paidAt) : ""} · tap to open full size
            </Text>
          </Pressable>
        ) : (
          <Card>
            <Text style={font.muted}>No receipt uploaded yet.</Text>
          </Card>
        )}
      </Section>

      {order.rating ? (
        <Card style={order.rating <= 2 ? { backgroundColor: colors.dangerSoft, borderColor: colors.danger } : undefined}>
          <Row label="Customer rating" value={`${"★".repeat(order.rating)}${"☆".repeat(5 - order.rating)}`} />
          {order.ratingComment ? <Text style={font.body}>"{order.ratingComment}"</Text> : null}
        </Card>
      ) : null}
      {order.skippedAt ? <Text style={font.muted}>The customer skipped this plan pickup.</Text> : null}

      {order.onTheWayAt || order.completedAt || order.collectorNote || order.proofPhotoUrl || order.bagsCollected !== null ? (
        <Section title="From the collector">
          <Card>
            {order.onTheWayAt ? <Row label="On the way" value={formatDateTime(order.onTheWayAt)} /> : null}
            {order.completedAt ? (
              <Row label={order.status === "INCOMPLETE" ? "Closed (not done)" : "Completed"} value={formatDateTime(order.completedAt)} />
            ) : null}
            {order.bagsCollected !== null ? <Row label="Bags collected" value={`${order.bagsCollected} (booked ${order.quantity})`} /> : null}
            {order.weightKg !== null ? <Row label="Weight" value={`${order.weightKg} kg`} /> : null}
            {order.extraAmount > 0 ? (
              <Row
                label="Extra bags"
                value={`${naira(order.extraAmount)} · ${order.extraPaidAt ? `paid${order.extraPaymentMethod === "CASH" ? " in cash to collector" : " online"}` : "unpaid"}`}
              />
            ) : null}
            {order.collectorNote ? <Row label="Note" value={order.collectorNote} /> : null}
            {order.proofPhotoUrl ? (
              <Pressable
                accessibilityRole="imagebutton"
                accessibilityLabel="Open collector's photo full size"
                onPress={() => void Linking.openURL(order.proofPhotoUrl!)}
              >
                <Image source={{ uri: order.proofPhotoUrl }} style={styles.receipt} resizeMode="contain" />
              </Pressable>
            ) : null}
          </Card>
        </Section>
      ) : null}

      <Section title="Customer">
        <Card>
          <Row label="Name" value={order.customer.name} />
          <Row label="Phone" value={order.customer.phone} />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              title="Call"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => void Linking.openURL(`tel:${order.customer.phone}`)}
            />
            <Button
              title="WhatsApp"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => void Linking.openURL(whatsappUrl(order.customer.phone))}
            />
          </View>
        </Card>
      </Section>

      <Section title="Order">
        <Card>
          <Row label={isBags ? "Bags" : "Plan"} value={order.planLabel} />
          {isBags ? <Row label="Packs" value={String(order.quantity)} /> : null}
          {order.type === "INSTANT_PICKUP" ? <Row label="Bags" value={String(order.quantity)} /> : null}
          {order.wasteType ? <Row label="Waste type" value={order.wasteType} /> : null}
          <Row
            label={isBags ? "Ordered" : "Pickup"}
            value={isBags ? formatDate(order.scheduledDate) : pickupWhen(order)}
          />
          <Row label={isBags ? "Deliver to" : "Address"} value={order.address} />
          {order.landmark ? <Row label="Landmark" value={order.landmark} /> : null}
          {order.lat != null && order.lng != null ? (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(directionsUrl(order))}>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>Show on map</Text>
            </Pressable>
          ) : null}
          <Row label="Amount" value={order.type === "PLAN_PICKUP" ? "Included in plan" : naira(order.amount)} />
          {order.collector ? <Row label="Collector" value={`${order.collector.name} (${order.collector.area})`} /> : null}
          {order.customerNote ? <Row label="Message to customer" value={order.customerNote} /> : null}
        </Card>
      </Section>

      {owner ? <RefundSection order={order} refunds={data.refunds} onRefunded={refresh} /> : null}

      <Section title="Notes for the collector">
        <TextField
          label="Seen by staff and the assigned collector"
          value={adminNote}
          onChangeText={setAdminNote}
          multiline
          maxLength={1000}
          placeholder="e.g. Gate code, landmark, call before arriving"
        />
        {adminNote.trim() !== (order.adminNote ?? "") ? (
          <Button
            title="Save note"
            variant="secondary"
            loading={action.busy}
            onPress={() => update({ adminNote: adminNote.trim() || null })}
          />
        ) : null}
      </Section>

      {order.status === "AWAITING_PAYMENT" || order.status === "PENDING" || order.status === "ASSIGNED" ? (
        <Button
          title="Cancel order"
          variant="danger"
          disabled={action.busy}
          onPress={() =>
            confirmAction(
              `Cancel ${order.reference}?`,
              order.paidAt
                ? "The customer has paid. Arrange a refund separately before cancelling."
                : "The customer hasn't paid for this order.",
              "Cancel order",
              () => update({ status: "CANCELLED" }),
              { cancelText: "Keep order" },
            )
          }
        />
      ) : null}
    </Screen>
  )
}

type NextStepProps = {
  order: AdminOrder
  busy: boolean
  collectors: Collector[]
  collectorId: string | null
  setCollectorId: (id: string) => void
  changingCollector: boolean
  setChangingCollector: (v: boolean) => void
  rejecting: boolean
  setRejecting: (v: boolean) => void
  reason: string
  setReason: (v: string) => void
  doneLabel: string
  update: (body: Update, after?: () => void) => void
}

/** The actions that make sense for the order's current status. */
function NextStep(p: NextStepProps) {
  const { order, busy, update } = p

  const collectorPicker = (
    <View style={{ gap: spacing.sm }}>
      <Text style={font.label}>{order.type === "WASTE_BAGS" ? "Who delivers?" : "Assign a collector"}</Text>
      {p.collectors.length === 0 ? (
        <Text style={font.muted}>No active collectors. Add one in the Collectors tab.</Text>
      ) : (
        // Collectors who work in the order's city first.
        [...p.collectors]
          .sort(
            (a, b) =>
              Number(b.serviceAreaId === order.areaId) - Number(a.serviceAreaId === order.areaId) || Number(b.onDuty) - Number(a.onDuty),
          )
          .map((c) => (
          <OptionCard
            key={c.id}
            title={c.name}
            subtitle={`${c.onDuty ? "On duty · " : ""}${c.area} · ${c.phone}`}
            selected={p.collectorId === c.id}
            onPress={() => p.setCollectorId(c.id)}
          />
        ))
      )}
    </View>
  )

  switch (order.status) {
    case "AWAITING_PAYMENT":
      return (
        <Card>
          <Text style={font.heading}>Waiting for payment</Text>
          <Text style={font.muted}>
            The customer hasn't uploaded a receipt. If {naira(order.amount)} has arrived in the account with reference{" "}
            {order.reference}, you can mark it as paid.
          </Text>
          <Button
            title="Mark as paid"
            variant="secondary"
            loading={busy}
            onPress={() =>
              confirmAction(
                "Mark as paid?",
                `Only do this if ${naira(order.amount)} is in the account.`,
                "Mark as paid",
                () => update({ status: "PENDING" }),
                { destructive: false },
              )
            }
          />
        </Card>
      )

    case "PENDING":
      // Paid online (or part of a paid plan): nothing to verify, just schedule it.
      if (order.paymentMethod === "PAYSTACK") {
        return (
          <Card style={{ borderColor: colors.primary }}>
            <Text style={font.heading}>{order.type === "PLAN_PICKUP" ? "Plan pickup to schedule" : "Paid · ready to schedule"}</Text>
            <Text style={font.muted}>Due {formatDate(order.scheduledDate)}.</Text>
            {collectorPicker}
            <Button
              title="Assign collector"
              loading={busy}
              disabled={!p.collectorId}
              onPress={() => update({ collectorId: p.collectorId })}
            />
          </Card>
        )
      }
      if (p.rejecting) {
        return (
          <Card>
            <Text style={font.heading}>Reject receipt</Text>
            <Text style={font.muted}>The customer sees this message and can upload a new receipt.</Text>
            <TextField
              label="Reason"
              value={p.reason}
              onChangeText={p.setReason}
              multiline
              maxLength={1000}
              placeholder={`e.g. The receipt shows ₦1,500 but the amount due is ${naira(order.amount)}.`}
            />
            <Button
              title="Reject and notify customer"
              variant="danger"
              loading={busy}
              disabled={!p.reason.trim()}
              onPress={() =>
                update({ status: "AWAITING_PAYMENT", customerNote: p.reason.trim() }, () => {
                  p.setRejecting(false)
                  p.setReason("")
                })
              }
            />
            <Button title="Back" variant="secondary" onPress={() => p.setRejecting(false)} />
          </Card>
        )
      }
      return (
        <Card style={{ borderColor: colors.primary }}>
          <Text style={font.heading}>Check the payment</Text>
          <Text style={font.muted}>
            Confirm {naira(order.amount)} arrived in the account (reference {order.reference}) and matches the receipt
            below.
          </Text>
          {collectorPicker}
          <Button
            title="Confirm payment & assign"
            loading={busy}
            disabled={!p.collectorId}
            onPress={() => update({ collectorId: p.collectorId, customerNote: null })}
          />
          <Button title="Reject receipt" variant="danger" disabled={busy} onPress={() => p.setRejecting(true)} />
        </Card>
      )

    case "ASSIGNED":
      return (
        <Card>
          <Text style={font.heading}>{order.type === "WASTE_BAGS" ? "Out for delivery" : "Pickup scheduled"}</Text>
          <Text style={font.muted}>
            {order.collector?.name ?? "A collector"} is assigned for {formatDate(order.scheduledDate)}.
          </Text>
          {p.changingCollector ? (
            <>
              {collectorPicker}
              <Button
                title="Save collector"
                loading={busy}
                disabled={!p.collectorId || p.collectorId === order.collector?.id}
                onPress={() => update({ collectorId: p.collectorId }, () => p.setChangingCollector(false))}
              />
            </>
          ) : (
            <>
              <Button title={p.doneLabel} loading={busy} onPress={() => update({ status: "COMPLETED" })} />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Button
                  title="Change collector"
                  variant="secondary"
                  style={{ flex: 1 }}
                  disabled={busy}
                  onPress={() => p.setChangingCollector(true)}
                />
                <Button
                  title="Mark incomplete"
                  variant="danger"
                  style={{ flex: 1 }}
                  disabled={busy}
                  onPress={() =>
                    confirmAction(
                      "Mark as incomplete?",
                      "Use this when the pickup or delivery couldn't happen. The order will be closed.",
                      "Mark incomplete",
                      () => update({ status: "INCOMPLETE" }),
                    )
                  }
                />
              </View>
            </>
          )}
        </Card>
      )

    default:
      return (
        <Card>
          <Text style={font.muted}>This order is closed. No further actions.</Text>
        </Card>
      )
  }
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  receipt: { width: "100%", height: 360, borderRadius: radius.md, backgroundColor: colors.surface },
})
