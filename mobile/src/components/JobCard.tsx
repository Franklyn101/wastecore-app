import { router } from "expo-router"
import { Pressable, Text, View } from "react-native"
import { daysUntil, formatDate, naira } from "../lib/format"
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

/** "Instant pickup", "Scheduled pickup", "Plan pickup"... */
export function jobKind(job: Pick<CollectorJob, "type" | "instant">): string {
  if (job.type === "INSTANT_PICKUP") return job.instant ? "Instant pickup" : "Scheduled pickup"
  return JOB_KIND[job.type]
}

/** What to do there: "Collect 3 bags · Plastic", "Deliver 2 packs of medium bags", "Collect: Furniture". */
export function jobTask(job: CollectorJob): string {
  if (job.type === "WASTE_BAGS") return `Deliver ${job.quantity} pack${job.quantity === 1 ? "" : "s"} of ${job.planLabel.toLowerCase()} bags`
  const bags =
    job.type === "INSTANT_PICKUP"
      ? `Collect ${job.quantity} bag${job.quantity === 1 ? "" : "s"}`
      : job.type === "PLAN_PICKUP"
        ? `Collect up to ${job.includedBags} bags`
        : "Collect"
  return job.wasteType ? `${bags} · ${job.wasteType}` : bags
}

/** "3 bags · Plastic · bring 2 WasteCore bags" (used on the job screen). */
export function jobLoad(job: CollectorJob): string {
  const bring = job.wastecoreBags ? `bring ${job.wastecoreBags} WasteCore bag${job.wastecoreBags === 1 ? "" : "s"}` : null
  return [jobTask(job), bring].filter(Boolean).join(" · ")
}

/** One job in a collector's list. */
export function JobCard({ job }: { job: CollectorJob }) {
  const overdue = job.status === "ASSIGNED" && daysUntil(job.scheduledDate) < 0
  const closed = job.status !== "ASSIGNED"
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${jobKind(job)} for ${job.customer.name} at ${job.address}`}
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
            {jobKind(job)} · {job.customer.name}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            {job.asap && !closed ? <Badge label="ASAP" tone="warning" /> : null}
            {job.timeWindow && !closed ? <Badge label={job.timeWindow === "MORNING" ? "Morning" : "Afternoon"} tone="info" /> : null}
            {overdue ? <Badge label="Overdue" tone="danger" /> : null}
            {job.onTheWayAt && !closed ? <Badge label="On the way" tone="success" /> : null}
            {job.status === "COMPLETED" ? <Badge label="Done" tone="success" /> : null}
            {job.status === "INCOMPLETE" ? <Badge label={job.wastedTrip ? "Wasted trip" : "Not done"} tone="danger" /> : null}
            {job.status === "CANCELLED" ? <Badge label="Cancelled" tone="muted" /> : null}
          </View>
        </View>
        <Text style={font.body}>{job.address}</Text>
        <Text style={[font.label, { color: colors.primaryDark }]}>{jobTask(job)}</Text>
        {job.wastecoreBags && !closed ? (
          <View style={{ alignSelf: "flex-start", backgroundColor: colors.warningSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.warning }}>
              Bring {job.wastecoreBags} WasteCore bag{job.wastecoreBags === 1 ? "" : "s"}
            </Text>
          </View>
        ) : null}
        <Text style={font.muted}>
          {closed
            ? job.pay !== null
              ? `Earned ${naira(job.pay)}`
              : "No pay"
            : `Pays about ${naira(job.estimatedPay)}`}
          {closed && job.completedAt ? ` · ${formatDate(job.completedAt)}` : ""}
          {job.rating ? ` · ${job.rating}★` : ""}
        </Text>
      </View>
    </Pressable>
  )
}
