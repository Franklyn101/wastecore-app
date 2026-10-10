import path from "node:path"
import cors from "cors"
import express from "express"
import helmet from "helmet"
import { errorHandler, HttpError } from "./http.ts"
import { adminRouter } from "./routes/admin.ts"
import { areasRouter } from "./routes/areas.ts"
import { authRouter } from "./routes/auth.ts"
import { catalogRouter } from "./routes/catalog.ts"
import { collectorRouter } from "./routes/collector.ts"
import { notificationsRouter } from "./routes/notifications.ts"
import { operationsRouter } from "./routes/operations.ts"
import { ordersRouter } from "./routes/orders.ts"
import { quotesRouter } from "./routes/quotes.ts"
import { staffRouter } from "./routes/staff.ts"
import { wasteRouter } from "./routes/waste.ts"
import { passwordRouter } from "./routes/password.ts"
import { paymentsRouter, paystackWebhook } from "./routes/payments.ts"
import { pricingRouter } from "./routes/pricing.ts"
import { subscriptionsRouter } from "./routes/subscriptions.ts"
import { supportRouter } from "./routes/support.ts"
import { verifyRouter } from "./routes/verify.ts"
import { refreshPricing } from "./pricing.ts"
import { UPLOAD_DIR } from "./storage.ts"

export function createApp() {
  const app = express()
  app.set("trust proxy", 1)
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }))
  // The mobile app sends no Origin header; CORS only matters for a future web dashboard.
  app.use(cors())
  app.use(paystackWebhook) // needs the raw body, so it comes before express.json()
  app.use(express.json({ limit: "100kb" }))
  // Prices the main admin set (cached for a few seconds).
  app.use((_req, _res, next) => {
    refreshPricing().then(() => next(), next)
  })

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" })
  })
  app.use("/uploads", express.static(UPLOAD_DIR, { fallthrough: false, index: false }))
  // The logo, for emails.
  app.use("/brand", express.static(path.resolve("public/brand"), { fallthrough: false, index: false, maxAge: "7d" }))

  app.use(authRouter, passwordRouter, verifyRouter, areasRouter, catalogRouter, ordersRouter, subscriptionsRouter, paymentsRouter, supportRouter, pricingRouter, adminRouter, operationsRouter, staffRouter, quotesRouter, wasteRouter, collectorRouter, notificationsRouter)

  app.use((_req, _res, next) => next(new HttpError(404, "Not found.")))
  app.use(errorHandler)
  return app
}
