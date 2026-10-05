export const colors = {
  primary: "#167A3E",
  primaryDark: "#0F5A2D",
  primarySoft: "#E8F5EC",
  background: "#F6F8F7",
  surface: "#FFFFFF",
  text: "#14211A",
  textMuted: "#5E6B64",
  border: "#DCE3DF",
  danger: "#B42318",
  dangerSoft: "#FDECEA",
  warning: "#9A6700",
  warningSoft: "#FFF4D6",
  info: "#1F5FAD",
  infoSoft: "#E6F0FB",
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 }

export const font = {
  title: { fontSize: 24, fontWeight: "700" as const, color: colors.text },
  heading: { fontSize: 18, fontWeight: "700" as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  label: { fontSize: 14, fontWeight: "600" as const, color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
}
