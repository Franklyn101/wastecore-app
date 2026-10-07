import { Platform } from "react-native"
import type {
  AdminOrder,
  AppNotification,
  AdminSubscription,
  AdminSummary,
  AdminArea,
  AdminTicket,
  AreaCheck,
  Catalog,
  Collector,
  CollectorJob,
  CollectorJobs,
  Order,
  OrderStatus,
  Payment,
  PlanChangeQuote,
  SavedAddress,
  ServiceArea,
  Subscription,
  SupportTicket,
  TicketStatus,
  User,
} from "./types"

// Set EXPO_PUBLIC_API_URL in mobile/.env. On a physical phone use your
// computer's LAN address (e.g. http://192.168.1.20:4000), not localhost.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "")

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
    throw new ApiError("Can't reach WasteCore. Check your internet connection and try again.", 0)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && authToken) onUnauthorized?.()
    throw new ApiError(data.error ?? "Something went wrong. Please try again.", res.status)
  }
  return data as T
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

export type AuthResponse = { token: string; user: User }

export type NewOrder =
  | { type: "INSTANT_PICKUP"; addressId: string; wasteType: string; bags: number; asap: boolean; pickupDate?: string }
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
  order: (id: string) => request<{ order: Order }>(`/orders/${id}`),
  cancelOrder: (id: string) => post<{ order: Order }>(`/orders/${id}/cancel`),
  async uploadReceipt(id: string, image: PickedImage) {
    const form = new FormData()
    await appendImage(form, "receipt", image)
    return request<{ order: Order }>(`/orders/${id}/receipt`, { method: "POST", body: form })
  },


  subscriptions: () => request<{ subscriptions: Subscription[]; renewWindowDays: number }>("/subscriptions"),
  subscription: (id: string) =>
    request<{ subscription: Subscription; upcomingPickups: Order[] }>(`/subscriptions/${id}`),
  subscribe: (body: { plan: string; addressId: string; wasteType: string; startDate: string }) =>
    post<{ subscription: Subscription }>("/subscriptions", body),
  changeQuote: (id: string, plan: string) =>
    request<{ quote: PlanChangeQuote }>(`/subscriptions/${id}/change-quote${query({ plan })}`),
  changePlan: (id: string, plan: string) =>
    post<{ subscription: Subscription; quote: PlanChangeQuote }>(`/subscriptions/${id}/change`, { plan }),
  setAutoRenew: (id: string, autoRenew: boolean) =>
    patch<{ subscription: Subscription }>(`/subscriptions/${id}`, { autoRenew }),
  cancelSubscription: (id: string) => post<{ ok: true }>(`/subscriptions/${id}/cancel`),

  startPayment: (body: { orderId?: string; subscriptionId?: string; email?: string; returnUrl?: string }) =>
    post<{ payment: Payment; authorizationUrl: string }>("/payments", body),
  payment: (reference: string) => request<{ payment: Payment }>(`/payments/${encodeURIComponent(reference)}`),

  createTicket: (body: { category: string; message: string; contactTime: string }) =>
    post<{ ticket: SupportTicket }>("/support-tickets", body),
  tickets: () => request<{ tickets: SupportTicket[] }>("/support-tickets"),

  admin: {
    summary: () => request<AdminSummary>("/admin/summary"),
    orders: (params: { status?: OrderStatus; q?: string; areaId?: string } = {}) =>
      request<{ orders: AdminOrder[] }>(`/admin/orders${query(params)}`),
    order: (id: string) => request<{ order: AdminOrder }>(`/admin/orders/${id}`),
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
    removeCollectorLogin: (id: string) =>
      request<{ collector: Collector }>(`/admin/collectors/${id}/login`, { method: "DELETE" }),
    createCollector: (body: { name: string; phone: string; area: string; serviceAreaId?: string | null }) =>
      post<{ collector: Collector }>("/admin/collectors", body),
    updateCollector: (id: string, body: Partial<Omit<Collector, "id">>) =>
      patch<{ collector: Collector }>(`/admin/collectors/${id}`, body),
    areas: () => request<{ areas: AdminArea[] }>("/admin/areas"),
    updateArea: (id: string, body: { active?: boolean; radiusKm?: number }) =>
      patch<{ area: ServiceArea }>(`/admin/areas/${id}`, body),
    tickets: (status?: TicketStatus) => request<{ tickets: AdminTicket[] }>(`/admin/support-tickets${query({ status })}`),
    updateTicket: (id: string, status: TicketStatus) =>
      patch<{ ticket: SupportTicket }>(`/admin/support-tickets/${id}`, { status }),
  },

  collector: {
    me: () =>
      request<{ collector: { id: string; name: string; phone: string; area: string; status: "PENDING" | "APPROVED" } }>(
        "/collector/me",
      ),
    jobs: () => request<CollectorJobs>("/collector/jobs"),
    job: (id: string) => request<{ job: CollectorJob }>(`/collector/jobs/${id}`),
    onTheWay: (id: string) => post<{ job: CollectorJob }>(`/collector/jobs/${id}/on-the-way`),
    async complete(id: string, input: { note?: string; photo?: PickedImage | null }) {
      const form = new FormData()
      if (input.note) form.append("note", input.note)
      if (input.photo) await appendImage(form, "proof", input.photo)
      return request<{ job: CollectorJob }>(`/collector/jobs/${id}/complete`, { method: "POST", body: form })
    },
    incomplete: (id: string, reason: string) => post<{ job: CollectorJob }>(`/collector/jobs/${id}/incomplete`, { reason }),
  },
}
