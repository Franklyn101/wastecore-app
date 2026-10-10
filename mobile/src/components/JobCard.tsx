import { router } from "expo-router"
import { Pressable, Text, View } from "react-native"
import { daysUntil, formatDate } from "../lib/format"
import type { CollectorJob } from "../lib/types"
import { colors, font, spacing } from "../theme"
import { listCard, pressedCard } from "./OrderCard"
import { OrderIcon } from "./OrderIcon"
import { Badge } from "./ui"

export const JOB_KIND: Record<CollectorJob["type"], string> = {
  INSTANT_PICKUP: "Pickup",
  PLAN_PICKUP: "Plan pickup",
  WASTE_BAGS: "Bag delivery",
  SPECIAL_PICKUP: "Special pickup",
}

/** "3 bags · Plastic", "Medium bags × 2 packs", "Mixed". */
export function jobLoad(job: CollectorJob): string {
  if (job.type === "WASTE_BAGS") return `${job.planLabel} bags × ${job.quantity} pack${job.quantity === 1 ? "" : "s"}`
  const bags =
    job.type === "INSTANT_PICKUP"
      ? `${job.quantity} bag${job.quantity === 1 ? "" : "s"}`
      : job.type === "PLAN_PICKUP"
        ? `Up to ${job.includedBags} bags`
        : null
  const bring = job.wastecoreBags ? `bring ${job.wastecoreBags} WasteCore bag${job.wastecoreBags === 1 ? "" : "s"}` : null
  return [bags, job.wasteType, bring].filter(Boolean).join(" · ")
}

/** One job in a collector's list. */
export function JobCard({ job }: { job: CollectorJob }) {
  const overdue = job.status === "ASSIGNED" && daysUntil(job.scheduledDate) < 0
  const closed = job.status !== "ASSIGNED"
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${JOB_KIND[job.type]} for ${job.customer.name} at ${job.address}`}
      onPress={() => router.push(`/collector/jobs/${job.id}`)}
      style={({ pressed }) => [
        listCard,
        // Overdue jobs get a red edge down the left.
        overdue && { borderLeftWidth: 4, borderLeftColor: colors.danger },
        pressed && pressedCard,
      ]}
    >
      <OrderIcon type={job.type} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
          <Text style={[font.label, { flexShrink: 1 }]}>
            {JOB_KIND[job.type]} · {job.customer.name}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            {job.asap && !closed ? <Badge label="ASAP" tone="warning" /> : null}
            {job.timeWindow && !closed ? <Badge label={job.timeWindow === "MORNING" ? "Morning" : "Afternoon"} tone="info" /> : null}
            {overdue ? <Badge label="Overdue" tone="danger" /> : null}
            {job.onTheWayAt && !closed ? <Badge label="On the way" tone="success" /> : null}
            {job.status === "COMPLETED" ? <Badge label="Done" tone="success" /> : null}
            {job.status === "INCOMPLETE" ? <Badge label="Not done" tone="danger" /> : null}
            {job.status === "CANCELLED" ? <Badge label="Cancelled" tone="muted" /> : null}
          </View>
        </View>
        <Text style={font.body}>{job.address}</Text>
        <Text style={font.muted}>
          {jobLoad(job) || "—"}
          {closed && job.completedAt ? ` · ${formatDate(job.completedAt)}` : ""}
          {job.rating ? ` · ${job.rating}★` : ""}
        </Text>
      </View>
    </Pressable>
  )
}
