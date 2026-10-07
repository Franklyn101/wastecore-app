import { Text, View } from "react-native"
import { useCatalog } from "../lib/catalog"
import type { TimeWindow } from "../lib/types"
import { font, spacing } from "../theme"
import { Chip } from "./ui"

/** Any time, morning or afternoon. */
export function TimeWindowPicker({
  label = "Time of day",
  value,
  onChange,
}: {
  label?: string
  value: TimeWindow | null
  onChange: (value: TimeWindow | null) => void
}) {
  const { catalog } = useCatalog()
  const windows = catalog?.timeWindows ?? []
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={font.label}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Chip label="Any time" selected={value === null} onPress={() => onChange(null)} />
        {windows.map((w) => (
          <Chip key={w.id} label={`${w.label} · ${w.hours}`} selected={value === w.id} onPress={() => onChange(w.id)} />
        ))}
      </View>
    </View>
  )
}
