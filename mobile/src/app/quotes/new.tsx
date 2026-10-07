import * as ImagePicker from "expo-image-picker"
import { router } from "expo-router"
import { useState } from "react"
import { Image, Text, View } from "react-native"
import { AddressPicker } from "../../components/AddressPicker"
import { DatePicker } from "../../components/DatePicker"
import { Button, Chip, ErrorBanner, Loading, Screen, TextField } from "../../components/ui"
import { api, type PickedImage } from "../../lib/api"
import { useCatalog } from "../../lib/catalog"
import { useSubmit } from "../../lib/useSubmit"
import { font, radius, spacing } from "../../theme"

export default function RequestQuote() {
  const { catalog, error: catalogError, reload } = useCatalog()
  const [category, setCategory] = useState<string | null>(null)
  const [description, setDescription] = useState("")
  const [photo, setPhoto] = useState<PickedImage | null>(null)
  const [addressId, setAddressId] = useState<string | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const { busy, error, submit } = useSubmit()

  if (!catalog) return catalogError ? <ErrorBanner message={catalogError} onRetry={reload} /> : <Loading />
  const ready = category && description.trim().length >= 5 && addressId && date

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 })
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0])
  }

  function send() {
    if (!ready) return
    void submit(async () => {
      const { quote } = await api.requestQuote({ category: category!, description: description.trim(), addressId: addressId!, preferredDate: date!, photo })
      router.replace(`/quotes/${quote.id}`)
    })
  }

  return (
    <Screen>
      <View style={{ gap: spacing.sm }}>
        <Text style={font.label}>What is it?</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {catalog.specialWasteCategories.map((c) => (
            <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>
      </View>
      <TextField
        label="Describe it"
        placeholder="e.g. About 20 bags of rubble and an old door, by the gate"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={1000}
        hint="How much there is, and anything heavy or awkward."
      />
      {photo ? <Image source={{ uri: photo.uri }} style={{ width: "100%", height: 220, borderRadius: radius.md }} resizeMode="cover" /> : null}
      <Button title={photo ? "Change photo" : "Add a photo (helps us price it)"} variant="secondary" onPress={() => void pickPhoto()} />
      <AddressPicker label="Where" value={addressId} onChange={setAddressId} />
      <DatePicker label="Best day for you" value={date} onChange={setDate} />
      {error ? <ErrorBanner message={error} /> : null}
      <Button title="Ask for a quote" onPress={send} loading={busy} disabled={!ready} />
      <Text style={font.muted}>No charge until you accept a price.</Text>
    </Screen>
  )
}
