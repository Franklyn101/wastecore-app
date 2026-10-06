// Runs the billing jobs once (automatic renewals, then expiry).
// The API server already runs them hourly; use this from a cron job if you
// run the API with RUN_JOBS=false or on a platform that sleeps when idle.
import { runBillingJobs } from "../src/billing.ts"
import { prisma } from "../src/db.ts"

await runBillingJobs()
await prisma.$disconnect()
