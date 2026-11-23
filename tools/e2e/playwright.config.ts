import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas e2e contra el stack completo en Docker Compose (Worker + D1 local +
 * simulador + cron). Requiere `docker compose up -d` en la raiz del repo.
 * E2E_BASE_URL permite apuntar a otro entorno (por defecto, el stack local).
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8787",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "movil", use: { ...devices["Pixel 7"] } },
  ],
});
