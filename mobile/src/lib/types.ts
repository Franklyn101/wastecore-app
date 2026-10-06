// Shapes returned by the WasteCore API (see backend/src/serializers.ts).

export type User = {
  id: string
  name: string
  phone: string
  address: string | null
  role: "CUSTOMER" | "ADMIN"
}

export type OrderType = "INSTANT_PICKUP" | "WEEKLY_PICKUP" | "UPGRADE" | "WASTE_BAGS"

export type OrderStatus = "AWAITING_PAYMENT" | "PENDING" | "ASSIGNED" | "COMPLETED" | "INCOMPLETE" | "CANCELLED"

export type Order = {
  id: string
  reference: string
  type: OrderType
  plan: string
  planLabel: string
  address: string
  wasteType: string | null
  scheduledDate: string
  quantity: number
  amount: number
  status: OrderStatus
  receiptUrl: string | null
  customerNote: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
}

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED"

export type SupportTicket = {
  id: string
  reference: string
  category: string
  message: string
  contactTime: string
  status: TicketStatus
  createdAt: string
}

export type Catalog = {
  instantPickup: { id: string; name: string; description: string; price: number }
  weeklyPlans: { id: string; name: string; pickupsPerWeek: number; price: number }[]
  upgradePlans: { id: string; name: string; price: number; features: string[] }[]
  bagSizes: { id: string; name: string; packSize: number; price: number }[]
  maxBagPacks: number
  wasteTypes: string[]
  supportCategories: string[]
  bank: { bankName: string; accountName: string; accountNumber: string }
}

// Staff-only shapes from /admin endpoints.

export type Customer = { id: string; name: string; phone: string }

export type Collector = { id: string; name: string; phone: string; area: string; active: boolean }

export type AdminOrder = Order & { adminNote: string | null; customer: Customer; collector: Collector | null }

export type AdminTicket = SupportTicket & { customer: Customer }

export type AdminSummary = { orders: Record<OrderStatus, number>; openTickets: number }
