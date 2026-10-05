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
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() || "",
    apiKey: process.env.CLOUDINARY_API_KEY?.trim() || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET?.trim() || "",
  },
}
