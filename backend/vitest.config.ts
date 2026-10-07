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
      AUTH_RATE_LIMIT: "10000",
      EXPO_PUSH_URL: "http://127.0.0.1:4598/push",
      TERMII_API_KEY: "test-termii-key",
      TERMII_SENDER_ID: "WasteCore",
      TERMII_BASE_URL: "http://127.0.0.1:4597",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "4596",
      EMAIL_FROM: "WasteCore <no-reply@wastecore.test>",
      PAYSTACK_SECRET_KEY: "sk_test_fake_key_for_tests",
      PAYSTACK_BASE_URL: "http://127.0.0.1:4599",
    },
  },
})
