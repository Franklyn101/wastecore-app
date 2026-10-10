import * as ImagePicker from "expo-image-picker"
import { router, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { Alert, Image, Linking, Platform, StyleSheet, Switch, Text, View } from "react-native"
import { jobKind, jobTask } from "../../../components/JobCard"
import { MapView } from "../../../components/MapView"
import { Stepper } from "../../../components/Stepper"
import { Badge, Button, Card, Chip, ErrorBanner, Loading, Row, Screen, Section, TextField, switchColors } from "../../../components/ui"
import type { PickedImage } from "../../../lib/api"
import { useCatalog } from "../../../lib/catalog"
import { confirmAction } from "../../../lib/dialogs"
import { formatDate, naira, pickupWhen } from "../../../lib/format"
import { extraBagsPrice } from "../../../lib/pricing"
import { directionsUrl } from "../../../lib/location"
import { loadJob, runOrQueue } from "../../../lib/offline"
import { useFocusData } from "../../../lib/useFocusData"
import { useSubmit } from "../../../lib/useSubmit"
import { colors, font, radius, spacing } from "../../../theme"

const REASONS = ["Customer not home", "Gate locked", "Wrong address", "Waste not ready", "Couldn't reach customer"]

const whatsappUrl = (phone: string) => `https://wa.me/${phone.replace(/^\+/, "")}`

export default function Job() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, error, refresh, setData } = useFocusData(() => loadJob(id))
  const { catalog } = useCatalog()
  const action = useSubmit()
  const [queued, setQueued] = useState(false)
  const [mode, setMode] = useState<"idle" | "complete" | "incomplete">("idle")
  const [note, setNote] = useState("")
  const [photo, setPhoto] = useState<PickedImage | null>(null)
  const [reason, setReason] = useState("")
  const [bags, setBags] = useState<number | null>(null)
  const [cash, setCash] = useState(false)
  const [wastedTrip, setWastedTrip] = useState(false)
  const [weight, setWeight] = useState("")

  const job = data?.job
  if (!job) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />

  const open = job.status === "ASSIGNED"
  const isPickup = job.type !== "WASTE_BAGS"
  const bagCount = bags ?? job.quantity
  const pricing = catalog?.pickupPricing
  const extraBags = Math.max(0, bagCount - job.includedBags)
  // Bags beyond what was paid for: priced as if booked (one-off pickups), or per extra bag (plans).
  const extra = !pricing || !extraBags
    ? 0
    : job.type === "INSTANT_PICKUP"
      ? extraBagsPrice(job.includedBags, bagCount, job.instant, pricing)
      : job.type === "PLAN_PICKUP"
        ? extraBags * pricing.scheduled.extraBag
        : 0

  // Sends the action, or saves it on the phone to send when there's signal.
  const apply = (step: Parameters<typeof runOrQueue>[1]) =>
    void action.submit(async () => {
      const result = await runOrQueue(job, step)
      setData({ job: result.job, offline: result.queued })
      setQueued(result.queued)
      setMode("idle")
    })

  async function takePhoto() {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.6 }
    let result: ImagePicker.ImagePickerResult
    if (Platform.OS === "web") {
      result = await ImagePicker.launchImageLibraryAsync(options)
    } else {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) {
        Alert.alert("Camera access needed", "Allow camera access in Settings to take a photo of the job.")
        return
      }
      result = await ImagePicker.launchCameraAsync(options)
    }
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0])
  }

  return (
    <Screen refreshing={false} onRefresh={refresh}>
      {queued || data.offline ? (
        <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning }}>
          <Text style={font.label}>{queued ? "Saved on your phone" : "You're offline"}</Text>
          <Text style={font.muted}>
            {queued ? "It will be sent to the office automatically when you have signal." : "Showing the last saved copy of this job."}
          </Text>
        </Card>
      ) : null}
      <Card>
        <View style={styles.headerRow}>
          <Text style={font.heading}>{jobKind(job)}</Text>
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            {job.asap && open ? <Badge label="ASAP" tone="warning" /> : null}
            {job.onTheWayAt && open ? <Badge label="On the way" tone="success" /> : null}
          </View>
        </View>
        <Row label="When" value={job.asap ? `As soon as possible · ${formatDate(job.scheduledDate)}` : pickupWhen(job)} />
        <Row label="What to do" value={jobTask(job)} />
        {open ? <Row label="Pays" value={`About ${naira(job.estimatedPay)}${isPickup && job.type !== "SPECIAL_PICKUP" ? ", more for extra bags" : ""}`} /> : null}
        <Row label="Reference" value={job.reference} />
      </Card>

      {open && job.wastecoreBags ? (
        <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning }}>
          <Text style={font.label}>
            Bring {job.wastecoreBags} WasteCore bag{job.wastecoreBags === 1 ? "" : "s"}
          </Text>
          <Text style={font.muted}>The customer has paid for them. Hand them over at the pickup.</Text>
        </Card>
      ) : null}

      {open && mode === "idle" ? <Steps job={job} /> : null}

      {action.error ? <ErrorBanner message={action.error} /> : null}

      {open && mode === "idle" ? (
        <View style={{ gap: spacing.sm }}>
          {!job.onTheWayAt ? (
            <Button
              title="I'm on my way"
              variant="secondary"
              loading={action.busy}
              onPress={() => apply({ kind: "onTheWay", jobId: job.id })}
            />
          ) : null}
          <Button title={job.type === "WASTE_BAGS" ? "Mark delivered" : "Mark completed"} onPress={() => setMode("complete")} />
          <Button title="Couldn't complete" variant="danger" onPress={() => setMode("incomplete")} />
        </View>
      ) : null}

      {open && mode === "complete" ? (
        <Card style={{ borderColor: colors.primary }}>
          <Text style={font.heading}>{job.type === "WASTE_BAGS" ? "Confirm delivery" : "Confirm pickup"}</Text>
          {photo ? (
            <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" accessibilityLabel="Photo of the job" />
          ) : null}
          <Button
            title={photo ? "Retake photo" : Platform.OS === "web" ? "Add a photo (optional)" : "Take a photo (optional)"}
            variant="secondary"
            onPress={() => void takePhoto()}
          />
          {isPickup ? (
            <Stepper
              label="Bags collected"
              hint={job.type === "PLAN_PICKUP" ? `Plan includes ${job.includedBags}` : `Booked: ${job.includedBags}`}
              value={bagCount}
              onChange={setBags}
              max={200}
              unit="bags"
            />
          ) : null}
          {extra > 0 ? (
            <View style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
              <Text style={[font.label, { color: colors.warning }]}>
                {extraBags} extra bag{extraBags === 1 ? "" : "s"}: {naira(extra)}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text style={[font.body, { flex: 1 }]}>Customer paid me {naira(extra)} in cash</Text>
                <Switch {...switchColors} accessibilityLabel="Customer paid the extra in cash" value={cash} onValueChange={setCash} trackColor={{ true: colors.primary }} />
              </View>
              {!cash ? <Text style={font.muted}>The customer will be asked to pay in the app.</Text> : null}
            </View>
          ) : null}
          {isPickup ? (
            <TextField
              label="Weight in kg (optional)"
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={setWeight}
              hint="If you weighed the bags."
            />
          ) : null}
          <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={500} placeholder="e.g. Left bags at the gate" />
          <Button
            title="Confirm"
            loading={action.busy}
            onPress={() =>
              apply({
                kind: "complete",
                jobId: job.id,
                input: {
                  note: note.trim() || undefined,
                  photo,
                  ...(isPickup ? { bags: bagCount } : {}),
                  ...(extra > 0 && cash ? { extraPaidCash: true } : {}),
                  ...(isPickup && Number(weight.replace(",", ".")) > 0 ? { weightKg: Number(weight.replace(",", ".")) } : {}),
                },
              })
            }
          />
          <Button title="Back" variant="secondary" disabled={action.busy} onPress={() => setMode("idle")} />
        </Card>
      ) : null}

      {open && mode === "incomplete" ? (
        <Card style={{ borderColor: colors.danger }}>
          <Text style={font.heading}>Why couldn't it be done?</Text>
          <Text style={font.muted}>The customer and the office will see this.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {REASONS.map((r) => (
              <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
            ))}
          </View>
          <TextField label="Reason" value={reason} onChangeText={setReason} multiline maxLength={500} />
          {isPickup && job.type !== "SPECIAL_PICKUP" && pricing ? (
            <View style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text style={[font.label, { flex: 1 }]}>Wasted trip</Text>
                <Switch
                  {...switchColors}
                  accessibilityLabel="Wasted trip"
                  value={wastedTrip}
                  onValueChange={setWastedTrip}
                  trackColor={{ true: colors.primary }}
                />
              </View>
              <Text style={font.muted}>
                I came and there was no waste or nobody home. The customer pays a {naira(pricing.wastedTripFee)} fee and you're paid for
                the trip.
              </Text>
            </View>
          ) : null}
          <Button
            title="Close job as not done"
            variant="danger"
            loading={action.busy}
            disabled={reason.trim().length < 3}
            onPress={() =>
              confirmAction(
                "Close this job?",
                wastedTrip && pricing
                  ? `It will be marked as a wasted trip, and the customer charged ${naira(pricing.wastedTripFee)}.`
                  : "It will be marked as not completed.",
                "Close job",
                () => apply({ kind: "incomplete", jobId: job.id, reason: reason.trim(), wastedTrip: wastedTrip && job.type !== "SPECIAL_PICKUP" }),
              )
            }
          />
          <Button title="Back" variant="secondary" disabled={action.busy} onPress={() => setMode("idle")} />
        </Card>
      ) : null}


      {job.notes ? (
        <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning }}>
          <Text style={font.label}>Note from the office</Text>
          <Text style={font.body}>{job.notes}</Text>
        </Card>
      ) : null}

      <Section title="Where">
        <Card>
          {job.lat != null && job.lng != null ? (
            <MapView center={{ lat: job.lat, lng: job.lng }} pin={{ lat: job.lat, lng: job.lng }} height={200} zoom={17} />
          ) : null}
          <Text style={font.body}>{job.address}</Text>
          {job.landmark ? <Text style={font.muted}>Landmark: {job.landmark}</Text> : null}
          <Button title="Directions" variant="secondary" onPress={() => void Linking.openURL(directionsUrl(job))} />
        </Card>
      </Section>

      <Section title="Customer">
        <Card>
          <Row label="Name" value={job.customer.name} />
          <Row label="Phone" value={job.customer.phone} />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button title="Call" variant="secondary" style={{ flex: 1 }} onPress={() => void Linking.openURL(`tel:${job.customer.phone}`)} />
            <Button
              title="WhatsApp"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => void Linking.openURL(whatsappUrl(job.customer.phone))}
            />
          </View>
        </Card>
      </Section>

      {!open ? (
        <Card>
          <Text style={font.heading}>
            {job.status === "COMPLETED"
              ? "Completed"
              : job.wastedTrip
                ? "Wasted trip"
                : job.status === "INCOMPLETE"
                  ? "Not completed"
                  : "Cancelled by the office"}
          </Text>
          {job.completedAt ? <Row label="Closed" value={formatDate(job.completedAt)} /> : null}
          {job.bagsCollected !== null ? <Row label="Bags collected" value={String(job.bagsCollected)} /> : null}
          {job.weightKg !== null ? <Row label="Weight" value={`${job.weightKg} kg`} /> : null}
          {job.extraAmount > 0 ? (
            <Row
              label={job.wastedTrip ? "Wasted-trip fee" : "Extra bags"}
              value={`${naira(job.extraAmount)} · ${job.extraPaid ? "paid" : "customer to pay in app"}`}
            />
          ) : null}
          {job.pay !== null ? <Row label="You earn" value={naira(job.pay)} /> : null}
          {job.collectorNote ? <Row label="Your note" value={job.collectorNote} /> : null}
          {job.rating ? <Row label="Customer's rating" value={`${"★".repeat(job.rating)}${"☆".repeat(5 - job.rating)}`} /> : null}
          {job.ratingComment ? <Text style={font.body}>"{job.ratingComment}"</Text> : null}
          {job.proofPhotoUrl ? (
            <Image source={{ uri: job.proofPhotoUrl }} style={styles.photo} resizeMode="cover" accessibilityLabel="Photo of the job" />
          ) : null}
          <Button title="Back to my jobs" variant="secondary" onPress={() => router.back()} />
        </Card>
      ) : null}
    </Screen>
  )
}

/** The three steps of a job, with the done ones ticked. */
function Steps({ job }: { job: { type: string; onTheWayAt: string | null } }) {
  const delivery = job.type === "WASTE_BAGS"
  const steps = [
    { text: "Tap \"I'm on my way\" when you set off. The customer gets a message.", done: Boolean(job.onTheWayAt) },
    { text: delivery ? "Hand over the bags." : "Collect the waste and count the bags.", done: false },
    { text: delivery ? "Tap \"Mark delivered\"." : "Tap \"Mark completed\", enter the bags and take a photo.", done: false },
  ]
  return (
    <Card style={{ gap: spacing.sm }}>
      <Text style={font.label}>How to do this job</Text>
      {steps.map((step, i) => (
        <View key={i} style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: step.done ? colors.primary : colors.primarySoft,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: step.done ? "#FFFFFF" : colors.primaryDark }}>{step.done ? "✓" : i + 1}</Text>
          </View>
          <Text style={[font.body, { flex: 1 }, step.done && { color: colors.textMuted, textDecorationLine: "line-through" }]}>{step.text}</Text>
        </View>
      ))}
      {!delivery ? (
        <Text style={font.muted}>
          Nobody home or no waste out? Tap "Couldn't complete" and turn on Wasted trip. You're still paid for the trip.
        </Text>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  photo: { width: "100%", height: 240, borderRadius: radius.md, backgroundColor: colors.background },
})
