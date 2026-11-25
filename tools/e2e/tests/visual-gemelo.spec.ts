import { expect, test, type Page } from "@playwright/test";

/**
 * Pruebas VISUALES del gemelo sobre el fotograma WebGL real (no DOM).
 * Regresion de las "losas negras" al aislar pisos: los pisos ocultos se aplastaban
 * en Y (escala 0) conservando X/Z -> planos de tamano completo con normales NaN
 * (division por la escala^2 en el shader de instancing de three) -> negro.
 *
 * Requiere ?visualtest (preserveDrawingBuffer) y un navegador con WebGL. En CI/local
 * sin GPU se usa SwiftShader (lento): por eso los tiempos de espera son largos.
 * Ejecutar: E2E_BASE_URL=<url> pnpm --filter @campuspulse/e2e exec playwright test tests/visual-gemelo.spec.ts --project=escritorio
 */
const SETTLE = Number(process.env.VISUAL_SETTLE_MS ?? 9000);

async function openTwin(page: Page) {
  await page.goto("/?visualtest=1");
  await page.waitForSelector("canvas", { timeout: 60_000 });
  await page.evaluate(() =>
    document.querySelector('[role="img"][aria-label^="Gemelo"]')?.parentElement?.scrollIntoView({ block: "center" }),
  );
  await page.waitForTimeout(20_000);
}

/** Fraccion de pixeles casi negros (luminancia < 24) en el lienzo WebGL. */
async function darkRatio(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector("canvas") as HTMLCanvasElement;
    const w = 200;
    const h = Math.round((c.height / c.width) * w);
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d")!;
    ctx.drawImage(c, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      if (lum < 24) dark++;
    }
    return dark / (w * h);
  });
}

async function shot(page: Page, name: string) {
  const box = await page.evaluate(() => {
    const b = document.querySelector('[role="img"][aria-label^="Gemelo"]')!.parentElement!.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  await page.screenshot({ path: `../../docs/entregables/FINAL/capturas/visual-${name}.png`, clip: box, timeout: 180_000 });
}

const floorSelect = (page: Page) => page.locator("select").filter({ has: page.locator('option[value="all"]') });
const viewBtn = (page: Page, name: RegExp) => page.getByRole("group", { name: "Vistas de cámara" }).getByRole("button", { name });

test.describe("Gemelo: render real al aislar pisos", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "escritorio" && !process.env.VISUAL_MOBILE, "visual en escritorio (movil con VISUAL_MOBILE=1)");
  });

  test("P6 y P9 aislados no dejan losas negras; Referencia limpia el aislamiento", async ({ page }) => {
    test.setTimeout(900_000);
    await openTwin(page);
    const base = await darkRatio(page);
    await shot(page, "todos");
    const results: Record<string, number> = { todos: base };

    await floorSelect(page).selectOption("6");
    await page.waitForTimeout(SETTLE);
    results.p6 = await darkRatio(page);
    await shot(page, "p6");

    await floorSelect(page).selectOption("9");
    await page.waitForTimeout(SETTLE);
    results.p9 = await darkRatio(page);
    await shot(page, "p9");

    await viewBtn(page, /Referencia/).click();
    await page.waitForTimeout(SETTLE);
    results.referencia = await darkRatio(page);
    await shot(page, "referencia");
    await expect(floorSelect(page)).toHaveValue("all");

    console.log("fraccion de pixeles negros:", JSON.stringify(results));
    for (const [k, v] of Object.entries(results)) expect(v, `pixeles negros en ${k}`).toBeLessThan(0.08);
  });
});
