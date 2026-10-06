import { createApp } from "./app.ts"
import { startBillingJobs } from "./billing.ts"
import { config } from "./config.ts"

createApp().listen(config.port, () => {
  console.log(`WasteCore API listening on http://localhost:${config.port}`)
  startBillingJobs()
})
