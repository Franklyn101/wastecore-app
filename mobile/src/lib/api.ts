import Constants from "expo-constants"
import { Platform } from "react-native"
import type {
  AdminOrder,
  AppNotification,
  AdminSubscription,
  AdminSummary,
  AdminArea,
  AdminQuote,
  AdminRefund,
  AdminTicket,
  AuditEntry,
  AreaCheck,
  Catalog,
  Collector,
  CollectorJob,
  CollectorJobs,
  CollectorProfile,
  CustomerDetail,
  CustomerSummary,
  Dashboard,
  Disposal,
  DisposalKind,
  DisposalList,
  Earnings,
  ExportKind,
  Order,
  OrderStatus,
  Payment,
  PaymentRecord,
  PlanChangeQuote,
  Quote,
  QuoteStatus,
  Refund,
  RouteStop,
  SavedAddress,
  ServiceArea,
  StockLevel,
  StockMovement,
  StockSize,
  StaffMember,
  Subscription,
  SupportTicket,
  TicketStatus,
  TimeWindow,
  User,
  WasteReport,
} from "./types"

// Set EXPO_PUBLIC_API_URL in mobile/.env for a real server. While developing on a phone
// (Expo Go), "localhost" is the phone itself, so we use the computer Expo is running on instead.
export const API_URL = resolveApiUrl().replace(/\/$/, "")

function resolveApiUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL
  if (!__DEV__ || Platform.OS === "web") return configured ?? "http://localhost:4000"
  if (configured && !/\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(configured)) return configured
  // e.g. "192.168.1.20:8082": the computer's Wi-Fi address, as the phone sees it.
  const devHost = Constants.expoConfig?.hostUri?.split(":")[0]
  return devHost && /^\d+\.\d+\.\d+\.\d+$/.test(devHost) ? `http://${devHost}:4000` : (configured ?? "http://localhost:4000")
}

// While developing, say which server we tried, so a wrong address in .env.local is easy to spot.
const UNREACHABLE =
  "Can't reach WasteCore. Check your internet connection and try again." +
  (__DEV__ ? `\n\n(Dev: tried ${API_URL}. On a phone this must be your computer's Wi-Fi address, not localhost.)` : "")

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

let authToken: string | null = null
let onUnauthorized: (() => void) | null = null

export function setAuthToken(token: string | null) {
  authToken = token
}

/** Called when the server rejects the saved token, so the app can sign out. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" }
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  if (init.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json"

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers as object) } })
  } catch {
    throw new ApiError(UNREACHABLE, 0)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && authToken) onUnauthorized?.()
    throw new ApiError(data.error ?? "Something went wrong. Please try again.", res.status)
  }
  return data as T
}

/** For non-JSON responses such as CSV exports. */
async function requestText(path: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} })
  } catch {
    throw new ApiError(UNREACHABLE, 0)
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(data.error ?? "Something went wrong. Please try again.", res.status)
  }
  return res.text()
}

const patch = <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) })

const query = (params: Record<string, string | undefined>) => {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString()
  return qs ? `?${qs}` : ""
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) })

export type PickedImage = { uri: string; mimeType?: string | null; fileName?: string | null }

/** Adds a picked photo to a multipart form, on native and web. */
async function appendImage(form: FormData, field: string, image: PickedImage) {
  const type = image.mimeType ?? "image/jpeg"
  const name = image.fileName ?? `${field}.${type.split("/")[1] ?? "jpg"}`
  if (Platform.OS === "web") {
    form.append(field, await (await fetch(image.uri)).blob(), name)
  } else {
    // React Native's FormData accepts a { uri, name, type } file descriptor.
    form.append(field, { uri: image.uri, name, type } as unknown as Blob)
  }
}

export type CompleteJob = { note?: string; photo?: PickedImage | null; bags?: number; extraPaidCash?: boolean; weightKg?: number }

export type DisposalInput = { site: string; kind: DisposalKind; wasteType: string; weightKg: number; ticketNo?: string; note?: string }

export type AuthResponse = { token: string; user: User }

export type NewOrder =
  | {
      type: "INSTANT_PICKUP"
      addressId: string
      wasteType: string
      bags: number
      asap: boolean
      pickupDate?: string
      timeWindow?: TimeWindow | null
    }
  | { type: "WASTE_BAGS"; bagSize: string; quantity: number; addressId: string }

export type AddressInput = { label: string; address: string; landmark?: string | null; lat: number; lng: number }

export const api = {
  register: (body: { name: string; phone: string; password: string }) => post<AuthResponse>("/auth/register", body),
  registerCollector: (body: { name: string; phone: string; password: string; area: string; serviceAreaId?: string }) =>
    post<AuthResponse>("/auth/register-collector", body),
  login: (body: { phone: string; password: string }) => post<AuthResponse>("/auth/login", body),
  me: () => request<{ user: User }>("/me"),
  requestPasswordReset: (phone: string) =>
    post<{ message: string; resendAfterSeconds: number }>("/auth/password-reset/request", { phone }),
  confirmPasswordReset: (body: { phone: string; code: string; password: string }) =>
    post<AuthResponse>("/auth/password-reset/confirm", body),
  sendPhoneCode: () => post<{ sent: boolean; resendAfterSeconds: number }>("/me/phone/send-code"),
  verifyPhone: (code: string) => post<{ user: User }>("/me/phone/verify", { code }),
  changePassword: (body: { currentPassword: string; password: string }) => post<AuthResponse>("/me/password", body),
  updateProfile: (body: { name?: string; address?: string; email?: string }) => patch<{ user: User }>("/me", body),

  catalog: () => request<Catalog>("/catalog"),

  areas: () => request<{ areas: ServiceArea[] }>("/areas"),
  locate: (point: { lat: number; lng: number }) =>
    request<AreaCheck>(`/areas/locate${query({ lat: String(point.lat), lng: String(point.lng) })}`),
  fullDays: (areaId: string) => request<{ fullDays: string[] }>(`/areas/${areaId}/full-days`),
  notifyMe: (point: { lat: number; lng: number }) => post<{ ok: true }>("/areas/interest", point),
  addresses: () => request<{ addresses: SavedAddress[] }>("/addresses"),
  createAddress: (body: AddressInput) => post<{ address: SavedAddress }>("/addresses", body),
  updateAddress: (id: string, body: Partial<AddressInput>) => patch<{ address: SavedAddress }>(`/addresses/${id}`, body),
  deleteAddress: (id: string) => request<void>(`/addresses/${id}`, { method: "DELETE" }),

  registerPushToken: (token: string, platform: "ios" | "android") =>
    post<void>("/me/push-tokens", { token, platform }),
  removePushToken: (token: string) =>
    request<void>("/me/push-tokens", { method: "DELETE", body: JSON.stringify({ token }) }),
  notifications: () => request<{ notifications: AppNotification[]; unread: number }>("/notifications"),
  markNotificationsRead: (ids?: string[]) => post<void>("/notifications/read", ids ? { ids } : {}),

  createOrder: (body: NewOrder) => post<{ order: Order }>("/orders", body),
  orders: () => request<{ orders: Order[] }>("/orders"),
  order: (id: string) => request<{ order: Order; refunds?: Refund[] }>(`/orders/${id}`),
  cancelOrder: (id: string) => post<{ order: Order }>(`/orders/${id}/cancel`),
  reschedule: (id: string, body: { date: string; timeWindow: TimeWindow | null }) =>
    post<{ order: Order }>(`/orders/${id}/reschedule`, body),
  skipPickup: (id: string) => post<{ order: Order }>(`/orders/${id}/skip`),
  rateOrder: (id: string, body: { stars: number; comment?: string | null }) => post<{ order: Order }>(`/orders/${id}/rating`, body),
  payments: () => request<{ payments: PaymentRecord[]; total: number }>("/payments"),
  async uploadReceipt(id: string, image: PickedImage) {
    const form = new FormData()
    await appendImage(form, "receipt", image)
    return request<{ order: Order }>(`/orders/${id}/receipt`, { method: "POST", body: form })
  },


  subscriptions: () => request<{ subscriptions: Subscription[]; renewWindowDays: number }>("/subscriptions"),
  subscription: (id: string) =>
    request<{ subscription: Subscription; upcomingPickups: Order[] }>(`/subscriptions/${id}`),
  subscribe: (body: { plan: string; addressId: string; wasteType: string; startDate: string; timeWindow?: TimeWindow | null }) =>
    post<{ subscription: Subscription }>("/subscriptions", body),
  changeQuote: (id: string, plan: string) =>
    request<{ quote: PlanChangeQuote }>(`/subscriptions/${id}/change-quote${query({ plan })}`),
  changePlan: (id: string, plan: string) =>
    post<{ subscription: Subscription; quote: PlanChangeQuote }>(`/subscriptions/${id}/change`, { plan }),
  setAutoRenew: (id: string, autoRenew: boolean) =>
    patch<{ subscription: Subscription }>(`/subscriptions/${id}`, { autoRenew }),
  setPlanTime: (id: string, timeWindow: TimeWindow | null) =>
    patch<{ subscription: Subscription }>(`/subscriptions/${id}`, { timeWindow }),
  cancelSubscription: (id: string) => post<{ ok: true }>(`/subscriptions/${id}/cancel`),

  startPayment: (body: { orderId?: string; subscriptionId?: string; email?: string; returnUrl?: string }) =>
    post<{ payment: Payment; authorizationUrl: string }>("/payments", body),
  payment: (reference: string) => request<{ payment: Payment }>(`/payments/${encodeURIComponent(reference)}`),

  requestQuote: async (input: { category: string; description: string; addressId: string; preferredDate: string; photo?: PickedImage | null }) => {
    const form = new FormData()
    form.append("category", input.category)
    form.append("description", input.description)
    form.append("addressId", input.addressId)
    form.append("preferredDate", input.preferredDate)
    if (input.photo) await appendImage(form, "photo", input.photo)
    return request<{ quote: Quote }>("/quotes", { method: "POST", body: form })
  },
  quotes: () => request<{ quotes: Quote[] }>("/quotes"),
  quote: (id: string) => request<{ quote: Quote }>(`/quotes/${id}`),
  acceptQuote: (id: string) => post<{ order: Order }>(`/quotes/${id}/accept`),
  declineQuote: (id: string) => post<{ quote: Quote }>(`/quotes/${id}/decline`),

  createTicket: (body: { category: string; message: string; contactTime: string; orderId?: string }) =>
    post<{ ticket: SupportTicket }>("/support-tickets", body),
  tickets: () => request<{ tickets: SupportTicket[] }>("/support-tickets"),

  admin: {
    summary: () => request<AdminSummary>("/admin/summary"),
    orders: (params: { status?: OrderStatus; q?: string; areaId?: string } = {}) =>
      request<{ orders: AdminOrder[] }>(`/admin/orders${query(params)}`),
    order: (id: string) => request<{ order: AdminOrder; refunds: Refund[] }>(`/admin/orders/${id}`),
    refund: (id: string, body: { amount: number; reason: string; cancel: boolean }) =>
      post<{ refund: Refund; left: number }>(`/admin/orders/${id}/refund`, body),
    refunds: () => request<{ refunds: AdminRefund[] }>("/admin/refunds"),
    dashboard: () => request<Dashboard>("/admin/dashboard"),
    quotes: (status?: QuoteStatus) => request<{ quotes: AdminQuote[] }>(`/admin/quotes${query({ status })}`),
    quote: (id: string) => request<{ quote: AdminQuote }>(`/admin/quotes/${id}`),
    sendQuote: (id: string, body: { amount: number; note?: string }) => post<{ quote: AdminQuote }>(`/admin/quotes/${id}/quote`, body),
    closeQuote: (id: string, note: string) => post<{ quote: AdminQuote }>(`/admin/quotes/${id}/cancel`, { note }),
    staff: () => request<{ staff: StaffMember[] }>("/admin/staff"),
    addStaff: (body: { name: string; phone: string; password: string; staffRole: "OWNER" | "STAFF" }) =>
      post<{ staff: StaffMember }>("/admin/staff", body),
    updateStaff: (id: string, body: { staffRole?: "OWNER" | "STAFF"; disabled?: boolean }) =>
      patch<{ staff: StaffMember }>(`/admin/staff/${id}`, body),
    audit: (params: { q?: string; targetType?: string; targetId?: string } = {}) =>
      request<{ entries: AuditEntry[] }>(`/admin/audit${query(params)}`),
    disposals: () => request<DisposalList>("/admin/disposals"),
    addDisposal: (body: DisposalInput) => post<{ disposal: Disposal }>("/admin/disposals", body),
    wasteReport: (range: { from: string; to: string }) => request<WasteReport>(`/admin/reports/waste${query(range)}`),
    autoAssign: () => post<{ assigned: number }>("/admin/auto-assign"),
    customers: (params: { q?: string; suspended?: "true" | "false" } = {}) =>
      request<{ customers: CustomerSummary[] }>(`/admin/customers${query(params)}`),
    customer: (id: string) => request<CustomerDetail>(`/admin/customers/${id}`),
    suspendCustomer: (id: string, reason: string) => post<{ ok: true }>(`/admin/customers/${id}/suspend`, { reason }),
    restoreCustomer: (id: string) => post<{ ok: true }>(`/admin/customers/${id}/restore`),
    stock: () => request<{ sizes: StockSize[]; movements: StockMovement[] }>("/admin/stock"),
    changeStock: (size: string, body: { change: number; reason: string; lowAt?: number }) =>
      post<{ sizes: StockLevel[] }>(`/admin/stock/${size}`, body),
    /** A CSV report as text (sent with the staff member's sign-in). */
    exportCsv: (kind: ExportKind, range: { from: string; to: string }) => requestText(`/admin/exports/${kind}.csv${query(range)}`),
    updateOrder: (
      id: string,
      body: { status?: OrderStatus; collectorId?: string | null; adminNote?: string | null; customerNote?: string | null },
    ) => patch<{ order: AdminOrder }>(`/admin/orders/${id}`, body),
    subscriptions: () => request<{ subscriptions: AdminSubscription[] }>("/admin/subscriptions"),
    setPlanCollector: (id: string, collectorId: string | null) =>
      patch<{ subscription: AdminSubscription }>(`/admin/subscriptions/${id}`, { collectorId }),
    collectors: () => request<{ collectors: Collector[] }>("/admin/collectors"),
    setCollectorLogin: (id: string, password: string) =>
      request<{ collector: Collector }>(`/admin/collectors/${id}/login`, { method: "PUT", body: JSON.stringify({ password }) }),
    setUserPassword: (phone: string, password: string) =>
      post<{ user: { name: string; phone: string; role: string } }>("/admin/users/password", { phone, password }),
    approveCollector: (id: string) => post<{ collector: Collector }>(`/admin/collectors/${id}/approve`),
    rejectCollector: (id: string) => post<{ ok: true }>(`/admin/collectors/${id}/reject`),
    earnings: (id: string) => request<Earnings>(`/admin/collectors/${id}/earnings`),
    recordPayout: (id: string, note?: string) =>
      post<{ payout: { amount: number; jobs: number }; earnings: Earnings }>(`/admin/collectors/${id}/payouts`, { note }),
    removeCollectorLogin: (id: string) =>
      request<{ collector: Collector }>(`/admin/collectors/${id}/login`, { method: "DELETE" }),
    createCollector: (body: { name: string; phone: string; area: string; serviceAreaId?: string | null }) =>
      post<{ collector: Collector }>("/admin/collectors", body),
    updateCollector: (id: string, body: Partial<Omit<Collector, "id">>) =>
      patch<{ collector: Collector }>(`/admin/collectors/${id}`, body),
    areas: () => request<{ areas: AdminArea[] }>("/admin/areas"),
    updateArea: (id: string, body: { active?: boolean; radiusKm?: number; autoAssign?: boolean; dailyCapacity?: number | null }) =>
      patch<{ area: ServiceArea }>(`/admin/areas/${id}`, body),
    tickets: (status?: TicketStatus) => request<{ tickets: AdminTicket[] }>(`/admin/support-tickets${query({ status })}`),
    updateTicket: (id: string, status: TicketStatus) =>
      patch<{ ticket: SupportTicket }>(`/admin/support-tickets/${id}`, { status }),
  },

  collector: {
    me: () => request<{ collector: CollectorProfile }>("/collector/me"),
    setOnDuty: (onDuty: boolean) => patch<{ onDuty: boolean; onDutySince: string | null }>("/collector/me", { onDuty }),
    route: (from: { lat: number; lng: number } | null) =>
      request<{ stops: RouteStop[]; totalKm: number }>(
        `/collector/route${from ? query({ lat: String(from.lat), lng: String(from.lng) }) : ""}`,
      ),
    earnings: () => request<Earnings>("/collector/earnings"),
    disposals: () => request<DisposalList>("/collector/disposals"),
    async addDisposal(input: DisposalInput & { photo?: PickedImage | null }) {
      const form = new FormData()
      for (const [key, value] of Object.entries(input)) {
        if (key !== "photo" && value !== undefined && value !== null && value !== "") form.append(key, String(value))
      }
      if (input.photo) await appendImage(form, "photo", input.photo)
      return request<{ disposal: Disposal }>("/collector/disposals", { method: "POST", body: form })
    },
    jobs: () => request<CollectorJobs>("/collector/jobs"),
    job: (id: string) => request<{ job: CollectorJob }>(`/collector/jobs/${id}`),
    onTheWay: (id: string) => post<{ job: CollectorJob }>(`/collector/jobs/${id}/on-the-way`),
    async complete(id: string, input: CompleteJob) {
      const form = new FormData()
      if (input.note) form.append("note", input.note)
      if (input.bags !== undefined) form.append("bags", String(input.bags))
      if (input.extraPaidCash) form.append("extraPaidCash", "true")
      if (input.weightKg !== undefined) form.append("weightKg", String(input.weightKg))
      if (input.photo) await appendImage(form, "proof", input.photo)
      return request<{ job: CollectorJob }>(`/collector/jobs/${id}/complete`, { method: "POST", body: form })
    },
    incomplete: (id: string, reason: string) => post<{ job: CollectorJob }>(`/collector/jobs/${id}/incomplete`, { reason }),
  },
}
