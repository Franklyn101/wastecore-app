import { useEffect, useState } from "react"
import { Text, View } from "react-native"
import { api } from "../lib/api"
import type { ServiceArea } from "../lib/types"
import { font, spacing } from "../theme"
import { Chip } from "./ui"

/** Choose a city we serve (or will soon). Used for the city a collector works in. */
export function AreaChips({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (id: string) => void
}) {
  const [areas, setAreas] = useState<ServiceArea[]>([])

  useEffect(() => {
    api
      .areas()
      .then((r) => setAreas(r.areas))
      .catch(() => setAreas([]))
  }, [])

  if (areas.length === 0) return null
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={font.label}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {areas.map((a) => (
          <Chip
            key={a.id}
            label={a.active ? `${a.name}, ${a.state}` : `${a.name} (soon)`}
            selected={value === a.id}
            onPress={() => onChange(a.id)}
          />
        ))}
      </View>
    </View>
  )
}
