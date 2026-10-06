import * as ImagePicker from "expo-image-picker"
import { router, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { Alert, Image, Linking, Platform, StyleSheet, Text, View } from "react-native"
import { jobLoad, JOB_KIND } from "../../../components/JobCard"
import { Badge, Button, Card, Chip, ErrorBanner, Loading, Row, Screen, Section, TextField } from "../../../components/ui"
import { api, type PickedImage } from "../../../lib/api"
import { confirmAction } from "../../../lib/dialogs"
import { formatDate } from "../../../lib/format"
import type { CollectorJob } from "../../../lib/types"
import { useFocusData } from "../../../lib/useFocusData"
import { useSubmit } from "../../../lib/useSubmit"
import { colors, font, radius, spacing } from "../../../theme"

const REASONS = ["Customer not home", "Gate locked", "Wrong address", "Waste not ready", "Couldn't reach customer"]

const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
const whatsappUrl = (phone: string) => `https://wa.me/${phone.replace(/^\+/, "")}`

export default function Job() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, error, refresh, setData } = useFocusData(() => api.collector.job(id))
  const action = useSubmit()
  const [mode, setMode] = useState<"idle" | "complete" | "incomplete">("idle")
  const [note, setNote] = useState("")
  const [photo, setPhoto] = useState<PickedImage | null>(null)
  const [reason, setReason] = useState("")

  const job = data?.job
  if (!job) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />

  const open = job.status === "ASSIGNED"
  const apply = (fn: () => Promise<{ job: CollectorJob }>) =>
    void action.submit(async () => {
      setData(await fn())
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
      <Card>
        <View style={styles.headerRow}>
          <Text style={font.heading}>{JOB_KIND[job.type]}</Text>
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            {job.asap && open ? <Badge label="ASAP" tone="warning" /> : null}
            {job.onTheWayAt && open ? <Badge label="On the way" tone="success" /> : null}
          </View>
        </View>
        <Row label="When" value={job.asap ? `As soon as possible · ${formatDate(job.scheduledDate)}` : formatDate(job.scheduledDate)} />
        <Row label={job.type === "WASTE_BAGS" ? "Deliver" : "Collect"} value={jobLoad(job) || "—"} />
        <Row label="Reference" value={job.reference} />
      </Card>

      {job.notes ? (
        <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning }}>
          <Text style={font.label}>Note from the office</Text>
          <Text style={font.body}>{job.notes}</Text>
        </Card>
      ) : null}

      <Section title="Where">
        <Card>
          <Text style={font.body}>{job.address}</Text>
          <Button title="Open in Maps" variant="secondary" onPress={() => void Linking.openURL(mapsUrl(job.address))} />
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

      {action.error ? <ErrorBanner message={action.error} /> : null}

      {open && mode === "idle" ? (
        <View style={{ gap: spacing.sm }}>
          {!job.onTheWayAt ? (
            <Button
              title="I'm on my way"
              variant="secondary"
              loading={action.busy}
              onPress={() => apply(() => api.collector.onTheWay(job.id))}
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
          <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={500} placeholder="e.g. Left bags at the gate" />
          <Button
            title="Confirm"
            loading={action.busy}
            onPress={() => apply(() => api.collector.complete(job.id, { note: note.trim() || undefined, photo }))}
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
          <Button
            title="Close job as not done"
            variant="danger"
            loading={action.busy}
            disabled={reason.trim().length < 3}
            onPress={() =>
              confirmAction("Close this job?", "It will be marked as not completed.", "Close job", () =>
                apply(() => api.collector.incomplete(job.id, reason.trim())),
              )
            }
          />
          <Button title="Back" variant="secondary" disabled={action.busy} onPress={() => setMode("idle")} />
        </Card>
      ) : null}

      {!open ? (
        <Card>
          <Text style={font.heading}>
            {job.status === "COMPLETED" ? "Completed" : job.status === "INCOMPLETE" ? "Not completed" : "Cancelled by the office"}
          </Text>
          {job.completedAt ? <Row label="Closed" value={formatDate(job.completedAt)} /> : null}
          {job.collectorNote ? <Row label="Your note" value={job.collectorNote} /> : null}
          {job.proofPhotoUrl ? (
            <Image source={{ uri: job.proofPhotoUrl }} style={styles.photo} resizeMode="cover" accessibilityLabel="Photo of the job" />
          ) : null}
          <Button title="Back to my jobs" variant="secondary" onPress={() => router.back()} />
        </Card>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  photo: { width: "100%", height: 240, borderRadius: radius.md, backgroundColor: colors.background },
})
