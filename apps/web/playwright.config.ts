import {defineConfig, devices} from "@playwright/test";

/**
 * End-to-end suite for the authenticated product flows. It expects a running Supabase stack
 * (`supabase start`, local Mailpit for OTP e-mails) and a production build of the app made with
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY pointing at that stack.
 * CI wires all of this in `.github/workflows/quality.yml` (job `e2e`).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 240_000,
  expect: {timeout: 30_000},
  reporter: process.env.CI ? [["list"], ["html", {open: "never", outputFolder: "playwright-report"}]] : "list",
  use: {
    baseURL,
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{name: "chromium", use: {...devices["Desktop Chrome"]}}],
  webServer: {
    command: "pnpm exec next start -p 3000",
    url: `${baseURL}/pt-BR`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Surface server-side logs (structured error lines) in the CI output.
    stdout: "pipe",
    stderr: "pipe",
  },
});
