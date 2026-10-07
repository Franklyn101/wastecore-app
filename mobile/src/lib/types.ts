// Shapes returned by the WasteCore API (see backend/src/serializers.ts).

export type User = {
  id: string
  name: string
  phone: string
  phoneVerified: boolean
  email: string | null
  address: string | null
  role: "CUSTOMER" | "ADMIN" | "COLLECTOR"
}

export type OrderType = "INSTANT_PICKUP" | "PLAN_PICKUP" | "WASTE_BAGS"

export type OrderStatus = "AWAITING_PAYMENT" | "PENDING" | "ASSIGNED" | "COMPLETED" | "INCOMPLETE" | "CANCELLED"

export type Order = {
  id: string
  reference: string
  type: OrderType
  plan: string
  planLabel: string
  address: string
  landmark: string | null
  lat: number | null
  lng: number | null
  areaId: string | null
  wasteType: string | null
  scheduledDate: string
  asap: boolean
  quantity: number
  amount: number
  status: OrderStatus
  paymentMethod: "PAYSTACK" | "TRANSFER" | null
  receiptUrl: string | null
  customerNote: string | null
  onTheWayAt: string | null
  completedAt: string | null
  collectorNote: string | null
  proofPhotoUrl: string | null
  subscriptionId: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
}

export type SubscriptionStatus = "PENDING_PAYMENT" | "ACTIVE" | "EXPIRED" | "CANCELLED" | "REPLACED"

export type Subscription = {
  id: string
  plan: string
  planName: string
  planGroup: "weekly" | "premium"
  pickupsPerWeek: number
  price: number
  periodLabel: string
  status: SubscriptionStatus
  address: string
  landmark: string | null
  lat: number | null
  lng: number | null
  wasteType: string
  startDate: string
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  autoRenew: boolean
  hasSavedCard: boolean
  cardLabel: string | null
  credit: number
  replacesId: string | null
  createdAt: string
}

export type PlanChangeQuote = { plan: string; credit: number; amountDue: number; allowed: boolean; message: string | null }

export type Payment = {
  reference: string
  purpose: "ORDER" | "SUBSCRIPTION_START" | "SUBSCRIPTION_RENEWAL"
  amount: number
  status: "INITIALIZED" | "SUCCESS" | "FAILED"
  orderId: string | null
  subscriptionId: string | null
  paidAt: string | null
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

export type Plan = {
  id: string
  group: "weekly" | "premium"
  name: string
  pickupsPerWeek: number
  price: number
  periodLabel: string
  priceNote?: string
  features: string[]
}

export type Catalog = {
  instantPickup: {
    id: string
    name: string
    description: string
    pricePerBag: number
    maxBags: number
    asapCutoffHour: number
  }
  plans: Plan[]
  bagSizes: { id: string; name: string; packSize: number; price: number }[]
  maxBagPacks: number
  wasteTypes: string[]
  supportCategories: string[]
  bank: { bankName: string; accountName: string; accountNumber: string }
  onlinePayments: boolean
}

// Staff-only shapes from /admin endpoints.

export type Customer = { id: string; name: string; phone: string }

export type Collector = {
  id: string
  name: string
  phone: string
  area: string
  serviceAreaId: string | null
  active: boolean
  /** Signed up in the app and waiting for staff approval. */
  pending: boolean
  hasLogin: boolean
}

export type AdminOrder = Order & { adminNote: string | null; customer: Customer; collector: Collector | null }

export type AdminSubscription = Subscription & { customer: Customer; collector: Collector | null }

export type AdminTicket = SupportTicket & { customer: Customer }

export type AdminSummary = { orders: Record<OrderStatus, number>; openTickets: number; activePlans: number }

// Collector app shapes from /collector endpoints.

export type CollectorJob = {
  id: string
  reference: string
  type: OrderType
  planLabel: string
  address: string
  landmark: string | null
  lat: number | null
  lng: number | null
  wasteType: string | null
  scheduledDate: string
  asap: boolean
  quantity: number
  status: OrderStatus
  notes: string | null
  customer: { name: string; phone: string }
  onTheWayAt: string | null
  completedAt: string | null
  collectorNote: string | null
  proofPhotoUrl: string | null
}

export type CollectorJobs = {
  open: CollectorJob[]
  history: CollectorJob[]
  stats: { doneToday: number; doneThisWeek: number }
}

export type AppNotification = {
  id: string
  title: string
  body: string
  url: string | null
  read: boolean
  createdAt: string
}

// Where WasteCore works. Yenagoa (Bayelsa) launches first, then Port Harcourt and Lagos.
export type ServiceArea = {
  id: string
  slug: string
  name: string
  state: string
  centerLat: number
  centerLng: number
  radiusKm: number
  active: boolean
}

export type AreaCheck = {
  /** The area the spot is inside, live or not. */
  area: ServiceArea | null
  served: boolean
  nearest: ServiceArea | null
  nearestKm: number | null
}

export type SavedAddress = {
  id: string
  label: string
  address: string
  landmark: string | null
  lat: number
  lng: number
  areaId: string
  areaName?: string
}

export type AdminArea = ServiceArea & { savedAddresses: number; waitingCustomers: number; openOrders: number }
