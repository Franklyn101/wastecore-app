import { defineConfig } from "vitest/config"

// Tests run against a real PostgreSQL database named by TEST_DATABASE_URL.
// They wipe its tables, so never point it at a database you care about.
export default defineConfig({
  test: {
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5433/wastecore_test",
      JWT_SECRET: "test-secret-test-secret-test-secret-1234",
      RUN_JOBS: "false",
      PAYSTACK_SECRET_KEY: "sk_test_fake_key_for_tests",
      PAYSTACK_BASE_URL: "http://127.0.0.1:4599",
    },
  },
})
