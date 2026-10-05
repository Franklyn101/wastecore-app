import { execSync } from "node:child_process"

// Applies migrations to the test database before any test runs.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5433/wastecore_test"
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" })
}
