import * as Clipboard from "expo-clipboard"
import * as ImagePicker from "expo-image-picker"
import { useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { Alert, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native"
import { PayButton } from "../../components/PayButton"
import { Badge, Button, Card, ErrorBanner, Loading, Row, Screen } from "../../components/ui"
import { api } from "../../lib/api"
import { useCatalog } from "../../lib/catalog"
import { confirmAction } from "../../lib/dialogs"
import { formatDate, naira, ORDER_TYPE_LABELS, orderStatus, pickupWhen } from "../../lib/format"
import type { Order } from "../../lib/types"
import { useFocusData } from "../../lib/useFocusData"
import { useSubmit } from "../../lib/useSubmit"
import { colors, font, radius, spacing } from "../../theme"

const STEPS = ["Booked", "Paid", "Confirmed", "Done"] as const

function progress(order: Order): number {
  switch (order.status) {
    case "AWAITING_PAYMENT":
      return 0
    case "PENDING":
      return 1
    case "ASSIGNED":
      return 2
    case "COMPLETED":
      return 3
    default:
      return -1
  }
}

function nextStepText(order: Order): string {
  switch (order.status) {
    case "AWAITING_PAYMENT":
      return "Pay to confirm your booking."
    case "PENDING":
      if (order.type === "PLAN_PICKUP") return "Part of your plan. We'll assign a collector before the day."
      return order.paymentMethod === "PAYSTACK"
        ? "Payment received. We'll assign a collector shortly."
        : "We're confirming your payment. You'll see the update here shortly."
    case "ASSIGNED":
      if (order.onTheWayAt) return order.type === "WASTE_BAGS" ? "Your bags are on the way." : "Your collector is on the way."
      return order.type === "WASTE_BAGS"
        ? "Payment confirmed. Your bags are on the way."
        : "Payment confirmed and a collector has been assigned."
    case "COMPLETED":
      return "All done. Thank you for keeping your environment clean!"
    case "INCOMPLETE":
      return "This order couldn't be completed. Contact support if you need help."
    case "CANCELLED":
      return "This order was cancelled."
  }
}

export default function OrderDetails() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { catalog } = useCatalog()
  const { data, error, refreshing, refresh } = useFocusData(() => api.order(id))
  const [order, setOrder] = useState<Order | null>(null)
  const [copied, setCopied] = useState(false)
  const [payByTransfer, setPayByTransfer] = useState(false)
  const upload = useSubmit()
  const cancel = useSubmit()

  // Prefer the result of the latest action over the last fetch.
  const current = order && data && order.updatedAt >= data.order.updatedAt ? order : (data?.order ?? order)
  if (!current) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />

  const status = orderStatus(current)
  const step = progress(current)
  const online = Boolean(catalog?.onlinePayments)
  // Bank transfer is the fallback when online payment is off, or when the customer picks it.
  const showTransfer = !online || payByTransfer || Boolean(current.receiptUrl)
  const canUpload =
    (current.status === "AWAITING_PAYMENT" && showTransfer) ||
    (current.status === "PENDING" && current.paymentMethod === "TRANSFER")

  async function pickReceipt(source: "library" | "camera") {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.6 }
    let result: ImagePicker.ImagePickerResult
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) {
        Alert.alert("Camera access needed", "Allow camera access in Settings to photograph your receipt.")
        return
      }
      result = await ImagePicker.launchCameraAsync(options)
    } else {
      result = await ImagePicker.launchImageLibraryAsync(options)
    }
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    void upload.submit(async () => setOrder((await api.uploadReceipt(current!.id, asset)).order))
  }

  async function copyAccountNumber() {
    if (!catalog) return
    await Clipboard.setStringAsync(catalog.bank.accountNumber)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Card>
        <View style={styles.headerRow}>
          <Text style={font.heading}>{ORDER_TYPE_LABELS[current.type]}</Text>
          <Badge label={status.label} tone={status.tone} />
        </View>
        <Text style={font.muted}>{nextStepText(current)}</Text>
        {step >= 0 ? (
          <View style={styles.steps} accessibilityLabel={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
            {STEPS.map((label, i) => (
              <View key={label} style={styles.step}>
                <View style={[styles.stepBar, i <= step && { backgroundColor: colors.primary }]} />
                <Text style={[styles.stepLabel, i <= step && { color: colors.primary }]}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      {current.collectorNote || current.proofPhotoUrl ? (
        <Card style={current.status === "INCOMPLETE" ? { backgroundColor: colors.dangerSoft, borderColor: colors.danger } : undefined}>
          <Text style={font.label}>From your collector</Text>
          {current.collectorNote ? <Text style={font.body}>{current.collectorNote}</Text> : null}
          {current.proofPhotoUrl ? (
            <Image
              source={{ uri: current.proofPhotoUrl }}
              style={styles.receipt}
              resizeMode="cover"
              accessibilityLabel="Photo taken by your collector"
            />
          ) : null}
        </Card>
      ) : null}

      {current.customerNote ? (
        <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning }}>
          <Text style={font.label}>Message from WasteCore</Text>
          <Text style={font.body}>{current.customerNote}</Text>
        </Card>
      ) : null}

      {current.status === "AWAITING_PAYMENT" && online && !showTransfer ? (
        <Card>
          <PayButton
            amount={current.amount}
            target={{ orderId: current.id }}
            onPaid={() => void api.order(current.id).then((r) => setOrder(r.order))}
          />
          <Button title="Pay by bank transfer instead" variant="secondary" onPress={() => setPayByTransfer(true)} />
        </Card>
      ) : null}

      {current.status === "AWAITING_PAYMENT" && catalog && showTransfer ? (
        <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary }}>
          <Text style={font.heading}>Transfer {naira(current.amount)}</Text>
          <Row label="Bank" value={catalog.bank.bankName} />
          <Row label="Account name" value={catalog.bank.accountName} />
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Copies the account number"
            onPress={copyAccountNumber}
            style={styles.copyRow}
          >
            <Text style={font.muted}>Account number</Text>
            <Text style={[font.heading, { color: colors.primaryDark }]}>
              {catalog.bank.accountNumber} {copied ? "✓ Copied" : "⧉"}
            </Text>
          </Pressable>
          <Text style={font.muted}>
            Use {current.reference} as the transfer narration, then upload a photo or screenshot of your receipt.
          </Text>
          {online && !current.receiptUrl ? (
            <Button title="Pay online instead" variant="secondary" onPress={() => setPayByTransfer(false)} />
          ) : null}
        </Card>
      ) : null}

      {canUpload ? (
        <View style={{ gap: spacing.sm }}>
          {upload.error ? <ErrorBanner message={upload.error} /> : null}
          <Button
            title={
              current.customerNote && current.status === "AWAITING_PAYMENT"
                ? "Upload a new receipt"
                : current.receiptUrl
                  ? "Replace receipt"
                  : "Upload payment receipt"
            }
            onPress={() => void pickReceipt("library")}
            loading={upload.busy}
          />
          {Platform.OS !== "web" ? (
            <Button
              title="Take a photo of the receipt"
              variant="secondary"
              onPress={() => void pickReceipt("camera")}
              disabled={upload.busy}
            />
          ) : null}
        </View>
      ) : null}

      <Card>
        <Row label="Reference" value={current.reference} />
        <Row
          label={current.type === "WASTE_BAGS" ? "Bags" : current.type === "PLAN_PICKUP" ? "Plan" : "Service"}
          value={current.planLabel}
        />
        {current.type === "WASTE_BAGS" ? <Row label="Packs" value={String(current.quantity)} /> : null}
        {current.type === "INSTANT_PICKUP" ? <Row label="Bags" value={String(current.quantity)} /> : null}
        {current.wasteType ? <Row label="Waste type" value={current.wasteType} /> : null}
        <Row
          label={current.type === "WASTE_BAGS" ? "Ordered" : "Pickup"}
          value={current.type === "WASTE_BAGS" ? formatDate(current.scheduledDate) : pickupWhen(current)}
        />
        <Row label={current.type === "WASTE_BAGS" ? "Delivery address" : "Address"} value={current.address} />
        <Row label="Amount" value={current.type === "PLAN_PICKUP" ? "Included in your plan" : naira(current.amount)} />
        {current.paymentMethod ? (
          <Row label="Paid by" value={current.paymentMethod === "PAYSTACK" ? "Paystack" : "Bank transfer"} />
        ) : null}
      </Card>

      {current.receiptUrl ? (
        <Card>
          <Text style={font.label}>Your receipt</Text>
          <Image
            source={{ uri: current.receiptUrl }}
            style={styles.receipt}
            resizeMode="contain"
            accessibilityLabel="Uploaded payment receipt"
          />
        </Card>
      ) : null}

      {current.status === "AWAITING_PAYMENT" ? (
        <>
          {cancel.error ? <ErrorBanner message={cancel.error} /> : null}
          <Button
            title="Cancel order"
            variant="danger"
            loading={cancel.busy}
            onPress={() =>
              confirmAction(
                "Cancel this order?",
                "You haven't paid yet, so nothing will be charged.",
                "Cancel order",
                () => void cancel.submit(async () => setOrder((await api.cancelOrder(current.id)).order)),
                { cancelText: "Keep order" },
              )
            }
          />
        </>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  steps: { flexDirection: "row", gap: spacing.xs },
  step: { flex: 1, gap: spacing.xs },
  stepBar: { height: 4, borderRadius: 2, backgroundColor: colors.border },
  stepLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  copyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  receipt: { width: "100%", height: 280, borderRadius: radius.md, backgroundColor: colors.background },
})
