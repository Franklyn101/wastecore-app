// Shapes returned by the WasteCore API (see backend/src/serializers.ts).

export type User = {
  id: string
  name: string
  phone: string
  phoneVerified: boolean
  email: string | null
  address: string | null
  role: "CUSTOMER" | "ADMIN" | "COLLECTOR"
  /** Admins only: the main admin (OWNER) can also handle money, accounts and settings. */
  staffRole: "OWNER" | "STAFF" | null
}

export type TimeWindow = "MORNING" | "AFTERNOON"

export type OrderType = "INSTANT_PICKUP" | "PLAN_PICKUP" | "WASTE_BAGS" | "SPECIAL_PICKUP"

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
  timeWindow: TimeWindow | null
  skippedAt: string | null
  rating: number | null
  ratingComment: string | null
  quantity: number
  /** WasteCore bags the collector brings (paid for when booking). */
  wastecoreBags: number
  /** The collector came but there was no waste or nobody home; `extraAmount` is the fee. */
  wastedTrip: boolean
  /** Bags the collector actually took; extra bags are owed as `extraAmount`. */
  bagsCollected: number | null
  weightKg: number | null
  extraAmount: number
  extraPaidAt: string | null
  extraPaymentMethod: "PAYSTACK" | "TRANSFER" | "CASH" | null
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
  bagsPerPickup: number
  price: number
  periodLabel: string
  status: SubscriptionStatus
  address: string
  landmark: string | null
  lat: number | null
  lng: number | null
  wasteType: string
  timeWindow: TimeWindow | null
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
  orderId: string | null
  status: TicketStatus
  createdAt: string
}

export type Plan = {
  id: string
  group: "weekly" | "premium"
  name: string
  pickupsPerWeek: number
  bagsPerPickup: number
  price: number
  periodLabel: string
  priceNote?: string
  features: string[]
}

/** Customer prices for a one-off pickup at one speed. */
export type SpeedPrices = { firstBags: number; extraBag: number; minimum: number }

export type PickupPricing = {
  scheduled: SpeedPrices
  instant: SpeedPrices
  /** How many bags are charged at the first-bags price. */
  tierBags: number
  wastecoreBag: number
  wastedTripFee: number
}

export type Catalog = {
  instantPickup: {
    id: string
    name: string
    description: string
    maxBags: number
    maxWastecoreBags: number
    asapCutoffHour: number
  }
  scheduledPickup: { id: string; name: string; description: string }
  pickupPricing: PickupPricing
  plans: Plan[]
  bagSizes: { id: string; name: string; packSize: number; price: number }[]
  maxBagPacks: number
  wasteTypes: string[]
  timeWindows: { id: TimeWindow; label: string; hours: string }[]
  specialWasteCategories: string[]
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
  onDuty: boolean
  /** Signed up in the app and waiting for staff approval. */
  pending: boolean
  hasLogin: boolean
}

export type AdminOrder = Order & { adminNote: string | null; customer: Customer; collector: Collector | null }

export type AdminSubscription = Subscription & { customer: Customer; collector: Collector | null }

export type AdminTicket = SupportTicket & { customer: Customer; order: { id: string; reference: string } | null }

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
  timeWindow: TimeWindow | null
  quantity: number
  /** Bags the customer has paid for; more are charged as extra bags. */
  includedBags: number
  /** Booked "as soon as possible" (instant prices). */
  instant: boolean
  wastecoreBags: number
  wastedTrip: boolean
  status: OrderStatus
  notes: string | null
  customer: { name: string; phone: string }
  onTheWayAt: string | null
  completedAt: string | null
  collectorNote: string | null
  proofPhotoUrl: string | null
  rating: number | null
  ratingComment: string | null
  bagsCollected: number | null
  weightKg: number | null
  extraAmount: number
  extraPaid: boolean
  /** What the collector earns for it, once completed. */
  pay: number | null
}

export type CollectorJobs = {
  open: CollectorJob[]
  history: CollectorJob[]
  stats: { doneToday: number; doneThisWeek: number; rating: number | null; ratings: number }
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
  autoAssign: boolean
  /** Most pickups per day; null means no limit. */
  dailyCapacity: number | null
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

/** One line of the customer's payment history. */
export type PaymentRecord = {
  id: string
  reference: string
  description: string
  amount: number
  method: string
  paidAt: string
  orderId: string | null
  subscriptionId: string | null
}

export type RouteStop = CollectorJob & { legKm: number | null }

export type Earnings = {
  rates: CollectorRates
  unpaid: { jobs: number; earned: number; cashHeld: number; due: number }
  lastSevenDays: { jobs: number; earned: number }
  payouts: { id: string; amount: number; jobs: number; note: string | null; createdAt: string }[]
}

export type CollectorProfile = {
  id: string
  name: string
  phone: string
  area: string
  status: "PENDING" | "APPROVED"
  onDuty: boolean
  onDutySince: string | null
}

export type Refund = {
  id?: string
  amount: number
  reason: string
  method: "PAYSTACK" | "MANUAL"
  status: "PENDING" | "PROCESSED" | "FAILED"
  createdAt: string
}

export type AdminRefund = Refund & {
  id: string
  order: { id: string; reference: string }
  user: { name: string; phone: string }
}

export type Dashboard = {
  today: { due: number; done: number; notDone: number; unassigned: number; waitingPayment: number }
  /** Main admin only; null for staff. */
  revenue: { today: number; last7Days: number; last30Days: number } | null
  activePlans: number
  newCustomers7Days: number
  collectorsOnDuty: number
  openTickets: number
  rating: { average: number | null; count: number }
  areas: { id: string; name: string; today: number; capacity: number | null; autoAssign: boolean }[]
  stock: StockLevel[]
  quotesWaiting: number
}

export type StockLevel = { size: string; name: string; packs: number; onOrder: number; available: number; lowAt: number }

export type StockSize = StockLevel | { size: string; name: string; tracked: false }

export type StockMovement = { id: string; size: string; change: number; reason: string; createdAt: string }

export type CustomerSummary = {
  id: string
  name: string
  phone: string
  email: string | null
  createdAt: string
  orders: number
  activePlan: string | null
  suspended: boolean
}

export type CustomerDetail = {
  customer: {
    id: string
    name: string
    phone: string
    email: string | null
    createdAt: string
    phoneVerified: boolean
    suspendedAt: string | null
    suspendedReason: string | null
    paidOnline: number
    tickets: number
  }
  orders: Order[]
  plans: { id: string; plan: string; status: SubscriptionStatus; currentPeriodEnd: string | null }[]
  addresses: { id: string; label: string; address: string; landmark: string | null }[]
}

export type ExportKind = "orders" | "payments" | "customers" | "payouts" | "refunds" | "disposals"

export type QuoteStatus = "NEW" | "QUOTED" | "ACCEPTED" | "DECLINED" | "CANCELLED"

export type Quote = {
  id: string
  reference: string
  category: string
  description: string
  photoUrl: string | null
  address: string
  landmark: string | null
  lat: number
  lng: number
  preferredDate: string
  status: QuoteStatus
  amount: number | null
  staffNote: string | null
  quotedAt: string | null
  orderId: string | null
  createdAt: string
}

export type AdminQuote = Quote & { customer: Customer }

export type StaffMember = { id: string; name: string; phone: string; staffRole: "OWNER" | "STAFF"; disabled: boolean; createdAt: string }

export type AuditEntry = { id: string; actorName: string; action: string; targetType: string; targetId: string | null; summary: string; createdAt: string }

export type DisposalKind = "LANDFILL" | "RECYCLER" | "COMPOST" | "OTHER"

export type Disposal = {
  id: string
  site: string
  kind: DisposalKind
  wasteType: string
  weightKg: number
  ticketNo: string | null
  photoUrl: string | null
  note: string | null
  disposedAt: string
  collector: string | null
}

export type DisposalList = { disposals: Disposal[]; recentSites: { site: string; kind: DisposalKind }[] }

export type WasteReport = {
  collected: {
    pickups: number
    bags: number
    weighedPickups: number
    kg: number
    byWasteType: { name: string; pickups: number; bags: number; kg: number }[]
    byArea: { name: string; pickups: number; bags: number; kg: number }[]
  }
  disposed: {
    loads: number
    kg: number
    divertedPercent: number | null
    byKind: { kind: DisposalKind; loads: number; kg: number }[]
    bySite: { site: string; kind: DisposalKind; loads: number; kg: number }[]
  }
}

export type CollectorRates = {
  scheduled: { perStop: number; perBag: number }
  instant: { perStop: number; perBag: number }
  perBagHandedOut: number
  wastedTrip: number
  bagDelivery: number
  specialPickup: number
}

/** Everything the main admin can change on the Pricing screen. */
export type Pricing = PickupPricing & {
  collector: CollectorRates
  plans: Record<string, { price: number; bagsPerPickup: number }>
}

export type PricingView = {
  pricing: Pricing
  defaults: Pricing
  plans: { id: string; name: string; periodLabel: string; pickupsPerWeek: number }[]
}
