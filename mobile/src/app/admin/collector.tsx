import { router, Stack, useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { Switch, Text, View } from "react-native"
import { AreaChips } from "../../components/AreaChips"
import { Badge, Button, Card, ErrorBanner, Loading, Row, Screen, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { confirmAction } from "../../lib/dialogs"
import { formatDate, naira } from "../../lib/format"
import type { Earnings } from "../../lib/types"
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
  const [city, setCity] = useState<string | null>(null)
  const [active, setActive] = useState(true)
  const [hasLogin, setHasLogin] = useState(false)
  const [password, setPassword] = useState("")
  const [loginSaved, setLoginSaved] = useState<string | null>(null)
  const { busy, error, submit } = useSubmit()
  const access = useSubmit()

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
        setCity(c.serviceAreaId)
        setActive(c.active)
        setHasLogin(c.hasLogin)
        setLoaded(true)
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [id])

  if (loadError) return <ErrorBanner message={loadError} />
  if (!loaded) return <Loading />

  const ready = name.trim() && phone.trim() && area.trim()

  function save() {
    void submit(async () => {
      const body = { name: name.trim(), phone: phone.trim(), area: area.trim(), serviceAreaId: city }
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
      <AreaChips label="City" value={city} onChange={setCity} />
      <TextField label="Neighbourhoods covered" placeholder="e.g. Ekeki, Kpansia" value={area} onChangeText={setArea} />
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

      {id ? <CollectorPay id={id} name={name} /> : null}

      {id ? (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={font.heading}>App login</Text>
            <Badge label={hasLogin ? "Has login" : "No login"} tone={hasLogin ? "success" : "muted"} />
          </View>
          <Text style={font.muted}>
            {hasLogin
              ? `${name} signs in with ${phone} to see their jobs. Set a new password below to reset it.`
              : `Give ${name || "this collector"} a password so they can sign in to the app with ${phone || "their phone number"} and see their jobs.`}
          </Text>
          {access.error ? <ErrorBanner message={access.error} /> : null}
          {loginSaved ? <Text style={[font.label, { color: colors.primary }]}>{loginSaved}</Text> : null}
          <TextField
            label={hasLogin ? "New password" : "Password"}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            hint="At least 8 characters. Share it with the collector privately."
          />
          <Button
            title={hasLogin ? "Reset password" : "Create login"}
            variant="secondary"
            loading={access.busy}
            disabled={password.length < 8}
            onPress={() =>
              void access.submit(async () => {
                const { collector } = await api.admin.setCollectorLogin(id, password)
                setHasLogin(collector.hasLogin)
                setPassword("")
                setLoginSaved(hasLogin ? "Password reset." : "Login created.")
              })
            }
          />
          {hasLogin ? (
            <Button
              title="Remove login"
              variant="danger"
              disabled={access.busy}
              onPress={() =>
                confirmAction(
                  "Remove app login?",
                  `${name} won't be able to sign in. Their jobs and history stay.`,
                  "Remove",
                  () =>
                    void access.submit(async () => {
                      const { collector } = await api.admin.removeCollectorLogin(id)
                      setHasLogin(collector.hasLogin)
                      setLoginSaved("Login removed.")
                    }),
                )
              }
            />
          ) : null}
        </Card>
      ) : null}
    </Screen>
  )
}

/** What the collector is owed, and recording a payout once staff have paid them. */
function CollectorPay({ id, name }: { id: string; name: string }) {
  const [earnings, setEarnings] = useState<Earnings | null>(null)
  const [note, setNote] = useState("")
  const [done, setDone] = useState<string | null>(null)
  const { busy, error, submit } = useSubmit()

  useEffect(() => {
    api.admin.earnings(id).then(setEarnings).catch(() => setEarnings(null))
  }, [id])

  if (!earnings) return null
  const { unpaid } = earnings

  function record() {
    confirmAction(
      `Record ${naira(unpaid.due)} paid to ${name}?`,
      `Do this after you've sent the money. It covers their ${unpaid.jobs} unpaid job${unpaid.jobs === 1 ? "" : "s"}.`,
      "Record payout",
      () =>
        void submit(async () => {
          const res = await api.admin.recordPayout(id, note.trim() || undefined)
          setEarnings(res.earnings)
          setNote("")
          setDone(`Recorded ${naira(res.payout.amount)}. ${name} has been notified.`)
        }),
      { destructive: false },
    )
  }

  return (
    <Card>
      <Text style={font.heading}>Pay</Text>
      <Row label={`Unpaid jobs (${unpaid.jobs})`} value={naira(unpaid.earned)} />
      {unpaid.cashHeld ? <Row label="Cash they took for extra bags" value={`− ${naira(unpaid.cashHeld)}`} /> : null}
      <Row label="Due now" value={naira(unpaid.due)} />
      {earnings.payouts[0] ? (
        <Text style={font.muted}>
          Last paid {naira(earnings.payouts[0].amount)} on {formatDate(earnings.payouts[0].createdAt)}
        </Text>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {done ? <Text style={[font.label, { color: colors.primary }]}>{done}</Text> : null}
      {unpaid.jobs > 0 ? (
        <>
          <TextField label="Note (optional)" placeholder="e.g. transfer reference" value={note} onChangeText={setNote} maxLength={200} />
          <Button title={`Record payout · ${naira(unpaid.due)}`} variant="secondary" loading={busy} onPress={record} />
        </>
      ) : null}
    </Card>
  )
}
