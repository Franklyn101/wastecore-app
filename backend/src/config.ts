import "dotenv/config"

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable ${name}. See .env.example.`)
  return value
}

const jwtSecret = required("JWT_SECRET")
if (jwtSecret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters long.")

const port = Number(process.env.PORT) || 4000

export const config = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret,
  port,
  publicUrl: (process.env.PUBLIC_URL?.trim() || `http://localhost:${port}`).replace(/\/$/, ""),
  bank: {
    bankName: process.env.BANK_NAME?.trim() || "Moniepoint",
    accountName: process.env.BANK_ACCOUNT_NAME?.trim() || "WasteCore Limited",
    accountNumber: process.env.BANK_ACCOUNT_NUMBER?.trim() || "6614999315",
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY?.trim() || "",
    baseUrl: (process.env.PAYSTACK_BASE_URL?.trim() || "https://api.paystack.co").replace(/\/$/, ""),
  },
  // Where Paystack checkout may send customers back to: the app's own scheme,
  // Expo Go during development, and the web app's address.
  appReturnUrls: (process.env.APP_RETURN_URLS?.trim() || "wastecore://,exp://,exps://,http://localhost:8081/")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean),
  // Background billing (renewals and expiry). Off in tests.
  runJobs: process.env.RUN_JOBS !== "false",
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() || "",
    apiKey: process.env.CLOUDINARY_API_KEY?.trim() || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET?.trim() || "",
  },
}
