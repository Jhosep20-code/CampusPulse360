import { expect, test, type Page } from "@playwright/test";

/**
 * Regresion del defecto movil "Error al mostrar la pagina / l is not a function".
 * Recorrido completo en un telefono tactil emulado: navegacion, vistas 3D,
 * dia/noche, pisos P1-P10, regreso, orientacion y sesion prolongada.
 * Falla si aparece cualquier excepcion no capturada o el fallback de error.
 */
const PAGES = ["/", "/incidentes", "/asistente", "/iot", "/automatizaciones", "/sistema", "/acceso", "/ar", "/reloj"];

function track(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}\n${e.stack ?? ""}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function noFallback(page: Page) {
  await expect(page.getByText("Error al mostrar la página")).toHaveCount(0);
}

test.describe("Estabilidad movil (tactil)", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "movil", "solo en el proyecto movil");
  });

  test("navegacion completa, vistas 3D, dia/noche, pisos y regreso", async ({ page }) => {
    // El 3D con renderizado por software es lento en CI: esta prueba tardo 2,7 min en verde y supero 4 min otras veces.
    test.setTimeout(480_000);
    const errors = track(page);
    for (const p of PAGES) {
      await page.goto(p);
      await page.waitForLoadState("networkidle").catch(() => {});
      await noFallback(page);
    }
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Centro de mando" })).toBeVisible();
    const views = page.getByRole("group", { name: "Vistas de cámara" });
    await expect(views).toBeVisible({ timeout: 30_000 });
    for (const name of await views.getByRole("button").allInnerTexts()) {
      await views.getByRole("button", { name: name.trim() }).click();
      await page.waitForTimeout(600);
      await noFallback(page);
    }
    const night = page.getByRole("button", { name: /Modo noche/ });
    for (let i = 0; i < 4; i++) {
      await night.click();
      await page.waitForTimeout(300);
    }
    const floor = page.locator("select").filter({ has: page.locator('option[value="all"]') });
    for (const v of ["1", "5", "6", "10", "all", "3"]) {
      await floor.selectOption(v);
      await page.waitForTimeout(400);
      await noFallback(page);
    }
    await page.goto("/incidentes");
    await page.goBack();
    await page.goForward();
    await page.goBack();
    await noFallback(page);
    // Orientacion horizontal y vuelta
    await page.setViewportSize({ width: 915, height: 412 });
    await page.waitForTimeout(800);
    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForTimeout(800);
    await noFallback(page);
    expect(errors, errors.join("\n\n")).toEqual([]);
  });

  test("sesion prolongada con actualizacion de datos (polling)", async ({ page }) => {
    test.setTimeout(150_000);
    const errors = track(page);
    await page.goto("/");
    await page.waitForTimeout(65_000); // ~6 ciclos de sondeo de /live
    await page.goto("/reloj");
    await page.waitForTimeout(25_000);
    await noFallback(page);
    expect(errors, errors.join("\n\n")).toEqual([]);
  });
});
