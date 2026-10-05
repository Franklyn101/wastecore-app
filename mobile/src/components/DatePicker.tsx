import { ScrollView, StyleSheet, Text, View } from "react-native"
import { formatDate, upcomingDates } from "../lib/format"
import { colors, font, spacing } from "../theme"
import { Chip } from "./ui"

/** Picks one of the next two weeks' dates. Works the same on iOS, Android and web. */
export function DatePicker({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: string | null
  onChange: (date: string) => void
  error?: string
}) {
  const dates = upcomingDates(14)
  return (
    <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={font.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {dates.map((date, i) => (
          <Chip
            key={date}
            label={i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatDate(date).replace(/ \d{4}$/, "")}
            selected={value === date}
            onPress={() => onChange(date)}
          />
        ))}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingRight: spacing.lg },
  error: { color: colors.danger, fontSize: 13 },
})
