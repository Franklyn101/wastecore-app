import { router } from "expo-router"
import { useState } from "react"
import { Pressable, Text, TextInput, View } from "react-native"
import { api } from "../lib/api"
import { confirmAction } from "../lib/dialogs"
import { daysUntil } from "../lib/format"
import type { Order, TimeWindow } from "../lib/types"
import { useSubmit } from "../lib/useSubmit"
import { colors, font, radius, spacing } from "../theme"
import { DatePicker } from "./DatePicker"
import { TimeWindowPicker } from "./TimeWindowPicker"
import { Button, Card, ErrorBanner } from "./ui"

/** Can the customer still move or skip this pickup? Mirrors the server's rule. */
export function canChange(order: Order): boolean {
  if (order.type === "WASTE_BAGS" || order.onTheWayAt) return false
  const open =
    order.status === "PENDING" ||
    order.status === "ASSIGNED" ||
    (order.status === "AWAITING_PAYMENT" && order.type === "INSTANT_PICKUP")
  return open && daysUntil(order.scheduledDate) >= 0
}

/** Reschedule (any pickup) or skip (plan pickups) before the collector sets off. */
export function ChangePickup({ order, onChanged }: { order: Order; onChanged: (order: Order) => void }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState<string | null>(null)
  const [timeWindow, setTimeWindow] = useState<TimeWindow | null>(order.timeWindow)
  const { busy, error, submit } = useSubmit()

  if (!canChange(order)) return null

  function move() {
    if (!date) return
    void submit(async () => {
      onChanged((await api.reschedule(order.id, { date, timeWindow })).order)
      setOpen(false)
    })
  }

  function skip() {
    confirmAction(
      "Skip this pickup?",
      "Your other plan pickups stay as they are. Skipped pickups aren't refunded or carried over.",
      "Skip pickup",
      () => void submit(async () => onChanged((await api.skipPickup(order.id)).order)),
      { cancelText: "Keep it" },
    )
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {error ? <ErrorBanner message={error} /> : null}
      {open ? (
        <Card>
          <Text style={font.heading}>Move this pickup</Text>
          <DatePicker label="New date" value={date} onChange={setDate} />
          <TimeWindowPicker value={timeWindow} onChange={setTimeWindow} />
          <Button title="Save new time" onPress={move} loading={busy} disabled={!date} />
          <Button title="Never mind" variant="secondary" onPress={() => setOpen(false)} />
        </Card>
      ) : (
        <Button title="Reschedule" variant="secondary" onPress={() => setOpen(true)} />
      )}
      {order.type === "PLAN_PICKUP" && !open ? (
        <Button title="Skip this pickup" variant="danger" onPress={skip} loading={busy} />
      ) : null}
    </View>
  )
}

/** Stars and an optional comment once a pickup or delivery is done. */
export function RateOrder({ order, onRated }: { order: Order; onRated: (order: Order) => void }) {
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState("")
  const { busy, error, submit } = useSubmit()

  if (order.status !== "COMPLETED") return null

  if (order.rating) {
    return (
      <Card>
        <Text style={font.label}>Your rating</Text>
        <Text style={{ fontSize: 24, color: colors.warning }} accessibilityLabel={`${order.rating} out of 5 stars`}>
          {"★".repeat(order.rating)}
          <Text style={{ color: colors.border }}>{"★".repeat(5 - order.rating)}</Text>
        </Text>
        {order.ratingComment ? <Text style={font.body}>{order.ratingComment}</Text> : null}
      </Card>
    )
  }

  return (
    <Card>
      <Text style={font.heading}>How did we do?</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n === 1 ? "" : "s"}`}
            accessibilityState={{ selected: stars === n }}
            onPress={() => setStars(n)}
            hitSlop={6}
          >
            <Text style={{ fontSize: 34, color: n <= stars ? colors.warning : colors.border }}>★</Text>
          </Pressable>
        ))}
      </View>
      {stars ? (
        <TextInput
          accessibilityLabel="Comment"
          placeholder={stars <= 3 ? "What went wrong? (optional)" : "Anything to add? (optional)"}
          value={comment}
          onChangeText={setComment}
          maxLength={500}
          multiline
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            padding: spacing.md,
            minHeight: 70,
            backgroundColor: colors.surface,
            color: colors.text,
          }}
        />
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      <Button
        title="Send rating"
        onPress={() => void submit(async () => onRated((await api.rateOrder(order.id, { stars, comment: comment.trim() || null })).order))}
        loading={busy}
        disabled={!stars}
      />
    </Card>
  )
}

/** Opens a support ticket about this order. */
export function ReportProblem({ order }: { order: Order }) {
  return (
    <Button
      title="Report a problem"
      variant="secondary"
      onPress={() => router.push({ pathname: "/support/new", params: { orderId: order.id, reference: order.reference } })}
    />
  )
}
