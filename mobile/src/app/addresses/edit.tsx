import { router, Stack, useLocalSearchParams } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { Text, View } from "react-native"
import { MapView } from "../../components/MapView"
import { Button, Card, Chip, ErrorBanner, Loading, Screen, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { useMapStart } from "../../lib/location"
import type { AreaCheck, SavedAddress } from "../../lib/types"
import { useSubmit } from "../../lib/useSubmit"
import { colors, font, radius, spacing } from "../../theme"

const LABELS = ["Home", "Office", "Shop"]

// Add or edit a saved address: pin the exact spot on the map, then describe it.
export default function EditAddress() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const [existing, setExisting] = useState<SavedAddress | null | undefined>(id ? undefined : null)

  useEffect(() => {
    if (!id) return
    api
      .addresses()
      .then((r) => setExisting(r.addresses.find((a) => a.id === id) ?? null))
      .catch(() => setExisting(null))
  }, [id])

  if (existing === undefined) return <Loading />
  return <AddressForm existing={existing} />
}

function AddressForm({ existing }: { existing: SavedAddress | null }) {
  const { areas, start, usingGps, locating, locateMe } = useMapStart(existing && { lat: existing.lat, lng: existing.lng })
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(existing && { lat: existing.lat, lng: existing.lng })
  const [check, setCheck] = useState<AreaCheck | null>(null)
  const [label, setLabel] = useState(existing?.label ?? "Home")
  const [address, setAddress] = useState(existing?.address ?? "")
  const [landmark, setLandmark] = useState(existing?.landmark ?? "")
  const [notified, setNotified] = useState(false)
  const { busy, error, submit } = useSubmit()
  const latestCheck = useRef(0)

  const point = spot ?? start

  // Check the spot under the pin each time the map settles.
  useEffect(() => {
    if (!point) return
    const n = ++latestCheck.current
    const t = setTimeout(() => {
      api
        .locate(point)
        .then((r) => n === latestCheck.current && setCheck(r))
        .catch(() => undefined)
    }, 250)
    return () => clearTimeout(t)
  }, [point?.lat, point?.lng])

  if (!start || !point) return <Loading />

  const served = check?.served ?? false
  const ready = served && address.trim() && label.trim()

  function save() {
    if (!ready) return
    void submit(async () => {
      const body = { label: label.trim(), address: address.trim(), landmark: landmark.trim() || null, ...point! }
      if (existing) await api.updateAddress(existing.id, body)
      else await api.createAddress(body)
      router.back()
    })
  }

  function notifyMe() {
    void submit(async () => {
      await api.notifyMe(point!)
      setNotified(true)
    })
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? "Edit address" : "New address" }} />
      <Text style={font.muted}>Move the map so the pin sits on your gate or door. Tap a spot to jump there.</Text>
      <MapView center={start} picker areas={areas} onMove={setSpot} height={300} />
      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
        <Button
          title={locating ? "Finding you…" : "Use my location"}
          variant="secondary"
          onPress={() => void locateMe().then((p) => p && setSpot(p))}
          loading={locating}
        />
        {!usingGps && !existing ? <Text style={[font.muted, { flex: 1 }]}>Showing {areas.find((a) => a.active)?.name ?? "our area"}.</Text> : null}
      </View>

      <AreaStatus check={check} notified={notified} onNotify={notifyMe} busy={busy} />

      {served ? (
        <>
          <View style={{ gap: spacing.sm }}>
            <Text style={font.label}>Save as</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {LABELS.map((l) => (
                <Chip key={l} label={l} selected={label === l} onPress={() => setLabel(l)} />
              ))}
            </View>
          </View>
          <TextField
            label="Street address"
            placeholder="House number, street, area"
            value={address}
            onChangeText={setAddress}
            multiline
            autoComplete="street-address"
            maxLength={300}
          />
          <TextField
            label="Landmark (helps the collector find you)"
            placeholder="e.g. Opposite the church, blue gate"
            value={landmark}
            onChangeText={setLandmark}
            maxLength={200}
          />
          {error ? <ErrorBanner message={error} /> : null}
          <Button title="Save address" onPress={save} loading={busy} disabled={!ready} />
        </>
      ) : error ? (
        <ErrorBanner message={error} />
      ) : null}
    </Screen>
  )
}

function AreaStatus({
  check,
  notified,
  onNotify,
  busy,
}: {
  check: AreaCheck | null
  notified: boolean
  onNotify: () => void
  busy: boolean
}) {
  if (!check) return <Text style={font.muted}>Checking this spot…</Text>
  if (check.served && check.area) {
    return (
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
        <Text style={[font.label, { color: colors.primaryDark }]}>
          ✓ We pick up here: {check.area.name}, {check.area.state}
        </Text>
      </Card>
    )
  }
  const message = check.area
    ? `We're not in ${check.area.name} yet, but we're coming soon.`
    : `We don't serve this spot yet.${check.nearest ? ` We're in ${check.nearest.name}, ${check.nearest.state}${check.nearest.active ? "" : " soon"}.` : ""}`
  return (
    <View style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.lg, gap: spacing.md }}>
      <Text style={[font.body, { color: colors.warning }]}>{message}</Text>
      {notified ? (
        <Text style={font.label}>Thanks! We'll let you know when we launch near you.</Text>
      ) : (
        <Button title="Notify me when you launch here" variant="secondary" onPress={onNotify} loading={busy} />
      )}
    </View>
  )
}
