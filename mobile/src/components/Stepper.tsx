import { Pressable, StyleSheet, Text, View } from "react-native"
import { colors, font, radius, spacing } from "../theme"

/** A labelled −/+ counter, e.g. for number of bags or packs. */
export function Stepper({
  label,
  hint,
  value,
  onChange,
  min = 1,
  max,
  unit,
}: {
  label: string
  hint?: string
  value: number
  onChange: (value: number) => void
  min?: number
  max: number
  unit: string
}) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)))
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={font.label}>{label}</Text>
        {hint ? <Text style={font.muted}>{hint}</Text> : null}
      </View>
      <View style={styles.stepper}>
        <StepButton text="−" onPress={() => set(value - 1)} disabled={value <= min} a11y={`Fewer ${unit}`} />
        <Text style={styles.value} accessibilityLiveRegion="polite" accessibilityLabel={`${value} ${unit}`}>
          {value}
        </Text>
        <StepButton text="+" onPress={() => set(value + 1)} disabled={value >= max} a11y={`More ${unit}`} />
      </View>
    </View>
  )
}

function StepButton({ text, onPress, disabled, a11y }: { text: string; onPress: () => void; disabled: boolean; a11y: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled && { opacity: 0.4 }]}
    >
      <Text style={styles.buttonText}>{text}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  button: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 22, fontWeight: "700", color: colors.primary },
  value: { minWidth: 32, textAlign: "center", fontSize: 18, fontWeight: "700", color: colors.text },
})
