import { expect, test } from "@playwright/test";
import { ADMIN_STATE } from "../global-setup";

// Cadena completa: escenario IoT (simulado) -> bot RPA -> incidencia -> diagnostico -> UI.
test.describe("Cadena IoT -> RPA -> diagnostico -> interfaz", () => {
  test.use({ storageState: ADMIN_STATE });
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "escritorio", "una sola ejecucion de la cadena");
  });

  test("aula saturada genera incidencias diagnosticadas visibles en la UI", async ({ page, request }) => {
    const sc = await page.request.post("/api/v1/scenarios/aula-saturada", { data: {} });
    expect(sc.status()).toBe(200);
    const bot1 = await page.request.post("/api/v1/bots/incident-bot/run", { data: {} });
    expect(bot1.status()).toBe(200);
    await page.request.post("/api/v1/bots/incident-bot/run", { data: {} });

    const list = await (await request.get("/api/v1/incidents?space_id=SPC_3_A301")).json();
    const active = list.items.filter((i: { status: string }) => i.status !== "resolved");
    expect(active.length).toBeGreaterThanOrEqual(1);
    const withDiag = active.find((i: { diagnosis: unknown }) => i.diagnosis);
    expect(withDiag, "al menos una incidencia diagnosticada").toBeTruthy();

    await page.goto(`/incidentes/${withDiag.id}`);
    await expect(page.getByRole("heading", { name: withDiag.title })).toBeVisible();
    // Etiqueta honesta del modo: en local sin Workers AI debe ser el respaldo "sin IA".
    await expect(page.getByText(/sin IA|Inferencia de IA/).first()).toBeVisible();

    await page.goto("/");
    await expect(page.getByText(/Aula A301/).first()).toBeVisible();

    // Limpieza: normalizar resuelve las incidencias activas.
    const norm = await page.request.post("/api/v1/scenarios/normalizar", { data: {} });
    expect(norm.status()).toBe(200);
  });
});
