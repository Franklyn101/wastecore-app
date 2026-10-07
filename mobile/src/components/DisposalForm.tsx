import * as ImagePicker from "expo-image-picker"
import { useState } from "react"
import { Image, Text, View } from "react-native"
import type { DisposalInput, PickedImage } from "../lib/api"
import { useCatalog } from "../lib/catalog"
import { DISPOSAL_KIND_LABELS } from "../lib/format"
import type { DisposalKind } from "../lib/types"
import { useSubmit } from "../lib/useSubmit"
import { font, radius, spacing } from "../theme"
import { Button, Card, Chip, ErrorBanner, TextField } from "./ui"

const KINDS: DisposalKind[] = ["LANDFILL", "RECYCLER", "COMPOST", "OTHER"]

/** Logs a load taken to a dump site, recycler or compost. Collectors can add a photo of the gate ticket. */
export function DisposalForm({
  recentSites,
  withPhoto,
  onSave,
}: {
  recentSites: { site: string; kind: DisposalKind }[]
  withPhoto?: boolean
  onSave: (input: DisposalInput & { photo?: PickedImage | null }) => Promise<void>
}) {
  const { catalog } = useCatalog()
  const [site, setSite] = useState("")
  const [kind, setKind] = useState<DisposalKind>("LANDFILL")
  const [wasteType, setWasteType] = useState("Mixed")
  const [weight, setWeight] = useState("")
  const [ticketNo, setTicketNo] = useState("")
  const [photo, setPhoto] = useState<PickedImage | null>(null)
  const [saved, setSaved] = useState(false)
  const { busy, error, submit } = useSubmit()
  const kg = Number(weight.replace(",", "."))

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 })
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0])
  }

  return (
    <Card>
      <Text style={font.heading}>Log a drop-off</Text>
      {recentSites.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {recentSites.map((s) => (
            <Chip
              key={s.site}
              label={s.site}
              selected={site === s.site}
              onPress={() => {
                setSite(s.site)
                setKind(s.kind)
              }}
            />
          ))}
        </View>
      ) : null}
      <TextField label="Site" placeholder="e.g. the dump site or recycler's name and area" value={site} onChangeText={setSite} maxLength={150} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {KINDS.map((k) => (
          <Chip key={k} label={DISPOSAL_KIND_LABELS[k]} selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </View>
      <Text style={font.label}>Main waste in the load</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {[...(catalog?.wasteTypes ?? []), "Other"].map((t) => (
          <Chip key={t} label={t} selected={wasteType === t} onPress={() => setWasteType(t)} />
        ))}
      </View>
      <TextField label="Weight (kg)" keyboardType="decimal-pad" value={weight} onChangeText={setWeight} hint="From the weighbridge ticket, or your best estimate." />
      <TextField label="Ticket number (optional)" value={ticketNo} onChangeText={setTicketNo} maxLength={60} />
      {withPhoto ? (
        <>
          {photo ? <Image source={{ uri: photo.uri }} style={{ width: "100%", height: 180, borderRadius: radius.md }} resizeMode="cover" /> : null}
          <Button title={photo ? "Change photo" : "Add a photo of the ticket (optional)"} variant="secondary" onPress={() => void pickPhoto()} />
        </>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {saved ? <Text style={font.label}>Saved.</Text> : null}
      <Button
        title="Save drop-off"
        loading={busy}
        disabled={site.trim().length < 2 || !(kg > 0)}
        onPress={() =>
          void submit(async () => {
            await onSave({ site: site.trim(), kind, wasteType, weightKg: kg, ticketNo: ticketNo.trim() || undefined, photo })
            setWeight("")
            setTicketNo("")
            setPhoto(null)
            setSaved(true)
          })
        }
      />
    </Card>
  )
}
