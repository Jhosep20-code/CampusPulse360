import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Las pruebas corren en workerd (Miniflare) con D1 local. Sin binding AI:
// el proveedor de IA en pruebas es "mock" (nunca se llama a servicios externos).
export default defineConfig(async () => {
  const migrations = await readD1Migrations(fileURLToPath(new URL("migrations", import.meta.url)));
  return {
    plugins: [
      cloudflareTest({
        main: "./src/index.ts",
        miniflare: {
          compatibilityDate: "2026-11-01",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          bindings: {
            TEST_MIGRATIONS: migrations,
            ENVIRONMENT: "local",
            APP_VERSION: "0.1.0-test",
            GIT_COMMIT: "test",
            AI_PROVIDER: "mock",
            AI_MODEL: "mock-model",
            AI_DAILY_LIMIT: "60",
            WEBAUTHN_RP_ID: "localhost",
            WEBAUTHN_RP_NAME: "CampusPulse 360",
            WEBAUTHN_ORIGIN: "http://localhost:5173",
            GATEWAY_KEYS: JSON.stringify({ "gw-test": "746573742d6b65792d6e6f742d736563726574" }),
            BOOTSTRAP_TOKEN: "test-bootstrap-token",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
