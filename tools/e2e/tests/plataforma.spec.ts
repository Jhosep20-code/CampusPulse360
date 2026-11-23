import { expect, test } from "@playwright/test";

test.describe("Plataforma publica (visitante)", () => {
  test("centro de mando con datos simulados en vivo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Centro de mando" })).toBeVisible();
    await expect(page.getByText(/simulado/i).first()).toBeVisible();
    // KPI con valor real del simulador (no esqueleto)
    await expect(page.getByText("Espacios normales")).toBeVisible();
    await expect(page.getByText(/En vivo/).first()).toBeVisible();
  });

  test("sin scroll horizontal", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Centro de mando" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("pagina AR ofrece los tres niveles", async ({ page }) => {
    await page.goto("/ar");
    await expect(page.getByRole("heading", { name: /Realidad aumentada/ })).toBeVisible();
    await expect(page.getByText(/Nivel A/)).toBeVisible();
    await expect(page.getByText(/Nivel B/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Vista 3D \(no es AR\)/ })).toBeVisible();
  });

  test("vista de reloj", async ({ page }) => {
    await page.goto("/watch");
    await expect(page.getByText(/simulado/i).first()).toBeVisible();
    await expect(page.getByText(/CO₂ medio|CO2 medio/)).toBeVisible();
  });

  test("API: firma de ingesta invalida rechazada y cabeceras de seguridad", async ({ request }) => {
    const ts = Date.now();
    const r = await request.post("/api/v1/ingest", {
      headers: { "X-Gateway-Id": "gw-sim-01", "X-Timestamp": String(ts), "X-Signature": "deadbeef" },
      data: { gateway_id: "gw-sim-01", readings: [] },
    });
    expect(r.status()).toBe(401);
    const h = await request.get("/api/v1/system/health");
    expect(h.headers()["x-content-type-options"]).toBe("nosniff");
    expect(h.headers()["content-security-policy"]).toContain("default-src 'none'");
  });

  test("API: escenario exige sesion", async ({ request }) => {
    const r = await request.post("/api/v1/scenarios/aula-saturada", { data: {} });
    expect(r.status()).toBe(401);
  });
});
