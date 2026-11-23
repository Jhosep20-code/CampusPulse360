import { expect, test, type Page } from "@playwright/test";

/**
 * Bateria GLOBAL de aislamiento P1-P10 (regresion de las "losas negras").
 * Por cada estado comprueba:
 *  1) GEOMETRIA real de las InstancedMesh (inspector window.__twinDebug, solo con ?visualtest):
 *     - 0 instancias "degeneradas" (algun eje con escala 0 pero no todos -> planos con normal NaN);
 *     - con un piso aislado, ninguna instancia visible de otro piso;
 *     - volumenes de espacio dibujados solo del piso aislado;
 *  2) PIXELES del fotograma WebGL (fraccion casi negra) como senal secundaria;
 *  3) ESTADO de la interfaz (selector de piso y preset).
 *
 * Configuracion: Chromium headless con WebGL por software (SwiftShader) y
 * prefers-reduced-motion para que las transiciones sean inmediatas. Movil = viewport 412x915
 * (perfil movil del gemelo), densidad 1.
 */
type Debug = {
  isolatedLevel: number | null;
  preset: string;
  exploded: boolean;
  degenerate: number;
  visibleByLevel: Record<string, number>;
  hiddenByLevel: Record<string, number>;
  spacesDrawn: string[];
};

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const WAIT = Number(process.env.VISUAL_WAIT_MS ?? 3500);
const SHOTS = process.env.VISUAL_SHOTS !== "0";

const floorSelect = (page: Page) => page.locator("select#aislar-piso");
const viewBtn = (page: Page, name: RegExp) => page.getByRole("group", { name: "Vistas de cámara" }).getByRole("button", { name });

async function open(page: Page) {
  await page.goto("/?visualtest=1");
  await page.waitForFunction(() => typeof (window as unknown as { __twinDebug?: unknown }).__twinDebug === "function", null, {
    timeout: 120_000,
  });
  await page.evaluate(() =>
    document.querySelector('[role="img"][aria-label^="Gemelo"]')?.parentElement?.scrollIntoView({ block: "center" }),
  );
  await page.waitForTimeout(8000);
}

async function debug(page: Page): Promise<Debug> {
  return page.evaluate(() => (window as unknown as { __twinDebug: () => Debug }).__twinDebug());
}

async function darkRatio(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector("canvas") as HTMLCanvasElement;
    const w = 160;
    const h = Math.round((c.height / c.width) * w);
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d")!;
    ctx.drawImage(c, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]! < 24) dark++;
    return dark / (w * h);
  });
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  const box = await page.evaluate(() => {
    const b = document.querySelector('[role="img"][aria-label^="Gemelo"]')!.parentElement!.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  await page.screenshot({ path: `../../docs/entregables/FINAL/capturas/pisos/${name}.png`, clip: box, timeout: 180_000 });
}

/** Comprobacion geometrica estricta del estado "solo el piso L". */
function expectOnly(d: Debug, level: number, ctx: string) {
  expect(d.degenerate, `${ctx}: instancias degeneradas`).toBe(0);
  for (const [l, n] of Object.entries(d.visibleByLevel)) {
    if (Number(l) !== level) expect(n, `${ctx}: instancias visibles del piso ${l}`).toBe(0);
  }
  expect(d.visibleByLevel[String(level)] ?? 0, `${ctx}: el piso aislado debe tener geometria`).toBeGreaterThan(0);
  for (const id of d.spacesDrawn) expect(id.startsWith(`SPC_${level}_`), `${ctx}: espacio dibujado ${id}`).toBe(true);
}

function expectFull(d: Debug, ctx: string) {
  expect(d.degenerate, `${ctx}: instancias degeneradas`).toBe(0);
  for (const l of LEVELS) expect(d.visibleByLevel[String(l)] ?? 0, `${ctx}: piso ${l} visible`).toBeGreaterThan(0);
  expect(d.isolatedLevel, `${ctx}: sin aislamiento`).toBeNull();
}

for (const device of ["escritorio", "movil"] as const) {
  test.describe(`Aislamiento P1-P10 (${device})`, () => {
    test.use(
      device === "movil"
        ? { viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, reducedMotion: "reduce" }
        : { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" },
    );
    test.beforeEach(({}, info) => {
      test.skip(info.project.name !== "escritorio", "el dispositivo se define dentro del describe");
    });

    test(`cada piso aislado desde el estado inicial y transiciones (${device})`, async ({ page }) => {
      test.setTimeout(1_800_000);
      await open(page);
      const report: Record<string, unknown> = {};
      const base = await debug(page);
      expectFull(base, "inicial");
      report.inicial = { dark: await darkRatio(page) };
      await shot(page, `${device}-todos`);

      // 1) Cada piso desde el estado inicial (Restablecer entre medio).
      for (const l of LEVELS) {
        await floorSelect(page).selectOption(String(l));
        await page.waitForTimeout(WAIT);
        const d = await debug(page);
        expectOnly(d, l, `P${l}`);
        const dark = await darkRatio(page);
        report[`P${l}`] = { dark, visibles: d.visibleByLevel[String(l)], espacios: d.spacesDrawn.length };
        expect(dark, `P${l}: fraccion negra`).toBeLessThan(0.08);
        await shot(page, `${device}-P${l}`);
        await page.getByRole("button", { name: /Restablecer vista/ }).click({ force: true });
        await page.waitForTimeout(WAIT);
        expectFull(await debug(page), `restablecer tras P${l}`);
      }

      // 2) Transiciones consecutivas y no consecutivas sin pasar por "Todos".
      for (const l of [1, 2, 3, 10, 4, 9, 5, 6, 8, 7]) {
        await floorSelect(page).selectOption(String(l));
        await page.waitForTimeout(WAIT);
        expectOnly(await debug(page), l, `transicion a P${l}`);
      }

      // 3) Cada piso combinado con las vistas y la explosion, incluidas incompatibles.
      for (const l of LEVELS) {
        await floorSelect(page).selectOption(String(l));
        await page.waitForTimeout(WAIT);
        await viewBtn(page, /Aérea/).click({ force: true });
        await page.waitForTimeout(WAIT);
        expectOnly(await debug(page), l, `P${l}+Aerea`);
        await page.getByRole("button", { name: /Pisos explotados/ }).click({ force: true });
        await page.waitForTimeout(WAIT);
        expectOnly(await debug(page), l, `P${l}+Explotado`);
        // Incompatible: Atrio quita aislamiento y explosion (modelo completo en corte).
        await viewBtn(page, /Atrio/).click({ force: true });
        await page.waitForTimeout(WAIT);
        let d = await debug(page);
        expectFull(d, `P${l}->Atrio`);
        expect(d.exploded, `P${l}->Atrio sin explosion`).toBe(false);
        // Incompatible: aislar desde Atrio vuelve a Fachada con ese piso.
        await floorSelect(page).selectOption(String(l));
        await page.waitForTimeout(WAIT);
        d = await debug(page);
        expect(d.preset).toBe("facade");
        expectOnly(d, l, `Atrio->P${l}`);
        // Referencia: modelo completo, sin aislamiento residual.
        await viewBtn(page, /Referencia/).click({ force: true });
        await page.waitForTimeout(WAIT);
        d = await debug(page);
        expectFull(d, `P${l}->Referencia`);
        await expect(floorSelect(page)).toHaveValue("all");
        if (l === 6 || l === 9) {
          report[`P${l}->Referencia`] = { dark: await darkRatio(page) };
          await shot(page, `${device}-referencia-tras-P${l}`);
        }
        await page.getByRole("button", { name: /Restablecer vista/ }).click({ force: true });
        await page.waitForTimeout(WAIT);
        d = await debug(page);
        expectFull(d, `restablecer tras combinaciones P${l}`);
        expect(d.preset).toBe("facade");
        expect(d.exploded).toBe(false);
      }

      // 4) Atrio completo y noche/dia.
      await viewBtn(page, /Atrio/).click({ force: true });
      await page.waitForTimeout(WAIT);
      expectFull(await debug(page), "Atrio");
      await shot(page, `${device}-atrio`);
      await page.getByRole("button", { name: /Modo noche/ }).click({ force: true });
      await page.waitForTimeout(WAIT);
      await page.getByRole("button", { name: /Modo noche/ }).click({ force: true });
      await viewBtn(page, /Fachada/).click({ force: true });
      await page.waitForTimeout(WAIT);
      expectFull(await debug(page), "Atrio->noche->dia->Fachada");

      console.log(`[${device}] metricas:`, JSON.stringify(report));
    });
  });
}
