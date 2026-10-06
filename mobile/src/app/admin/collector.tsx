import { router, Stack, useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { Switch, Text, View } from "react-native"
import { Button, ErrorBanner, Loading, Screen, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { useSubmit } from "../../lib/useSubmit"
import { colors, font } from "../../theme"

/** Adds a collector, or edits one when opened with ?id=. */
export default function CollectorEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const [loaded, setLoaded] = useState(!id)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [area, setArea] = useState("")
  const [active, setActive] = useState(true)
  const { busy, error, submit } = useSubmit()

  useEffect(() => {
    if (!id) return
    api.admin
      .collectors()
      .then(({ collectors }) => {
        const c = collectors.find((x) => x.id === id)
        if (!c) throw new Error("Collector not found.")
        setName(c.name)
        setPhone(c.phone)
        setArea(c.area)
        setActive(c.active)
        setLoaded(true)
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [id])

  if (loadError) return <ErrorBanner message={loadError} />
  if (!loaded) return <Loading />

  const ready = name.trim() && phone.trim() && area.trim()

  function save() {
    void submit(async () => {
      const body = { name: name.trim(), phone: phone.trim(), area: area.trim() }
      if (id) await api.admin.updateCollector(id, { ...body, active })
      else await api.admin.createCollector(body)
      router.back()
    })
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? "Edit collector" : "Add collector" }} />
      {error ? <ErrorBanner message={error} /> : null}
      <TextField label="Full name" value={name} onChangeText={setName} />
      <TextField label="Phone number" placeholder="08012345678" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <TextField label="Area covered" placeholder="e.g. Ikeja, Lekki Phase 1" value={area} onChangeText={setArea} />
      {id ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={font.label}>Active</Text>
            <Text style={font.muted}>Inactive collectors can't be assigned new orders.</Text>
          </View>
          <Switch
            accessibilityLabel="Active"
            value={active}
            onValueChange={setActive}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
      ) : null}
      <Button title={id ? "Save changes" : "Add collector"} onPress={save} loading={busy} disabled={!ready} />
    </Screen>
  )
}
