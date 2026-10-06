import { Platform } from "react-native"
import type {
  AdminOrder,
  AdminSummary,
  AdminTicket,
  Catalog,
  Collector,
  Order,
  OrderStatus,
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

export type AuthResponse = { token: string; user: User }

export type NewOrder =
  | { type: "INSTANT_PICKUP"; address: string; wasteType: string; pickupDate: string }
  | { type: "WEEKLY_PICKUP"; plan: string; address: string; wasteType: string; pickupDate: string }
  | { type: "UPGRADE"; plan: string; address: string; startDate: string }
  | { type: "WASTE_BAGS"; bagSize: string; quantity: number; address: string }

export const api = {
  register: (body: { name: string; phone: string; password: string }) => post<AuthResponse>("/auth/register", body),
  login: (body: { phone: string; password: string }) => post<AuthResponse>("/auth/login", body),
  me: () => request<{ user: User }>("/me"),
  updateProfile: (body: { name?: string; address?: string }) => patch<{ user: User }>("/me", body),

  catalog: () => request<Catalog>("/catalog"),

  createOrder: (body: NewOrder) => post<{ order: Order }>("/orders", body),
  orders: () => request<{ orders: Order[] }>("/orders"),
  order: (id: string) => request<{ order: Order }>(`/orders/${id}`),
  cancelOrder: (id: string) => post<{ order: Order }>(`/orders/${id}/cancel`),
  async uploadReceipt(id: string, image: { uri: string; mimeType?: string | null; fileName?: string | null }) {
    const type = image.mimeType ?? "image/jpeg"
    const name = image.fileName ?? `receipt.${type.split("/")[1] ?? "jpg"}`
    const form = new FormData()
    if (Platform.OS === "web") {
      form.append("receipt", await (await fetch(image.uri)).blob(), name)
    } else {
      // React Native's FormData accepts a { uri, name, type } file descriptor.
      form.append("receipt", { uri: image.uri, name, type } as unknown as Blob)
    }
    return request<{ order: Order }>(`/orders/${id}/receipt`, { method: "POST", body: form })
  },

  createTicket: (body: { category: string; message: string; contactTime: string }) =>
    post<{ ticket: SupportTicket }>("/support-tickets", body),
  tickets: () => request<{ tickets: SupportTicket[] }>("/support-tickets"),

  admin: {
    summary: () => request<AdminSummary>("/admin/summary"),
    orders: (params: { status?: OrderStatus; q?: string } = {}) =>
      request<{ orders: AdminOrder[] }>(`/admin/orders${query(params)}`),
    order: (id: string) => request<{ order: AdminOrder }>(`/admin/orders/${id}`),
    updateOrder: (
      id: string,
      body: { status?: OrderStatus; collectorId?: string | null; adminNote?: string | null; customerNote?: string | null },
    ) => patch<{ order: AdminOrder }>(`/admin/orders/${id}`, body),
    collectors: () => request<{ collectors: Collector[] }>("/admin/collectors"),
    createCollector: (body: { name: string; phone: string; area: string }) =>
      post<{ collector: Collector }>("/admin/collectors", body),
    updateCollector: (id: string, body: Partial<Omit<Collector, "id">>) =>
      patch<{ collector: Collector }>(`/admin/collectors/${id}`, body),
    tickets: (status?: TicketStatus) => request<{ tickets: AdminTicket[] }>(`/admin/support-tickets${query({ status })}`),
    updateTicket: (id: string, status: TicketStatus) =>
      patch<{ ticket: SupportTicket }>(`/admin/support-tickets/${id}`, { status }),
  },
}
