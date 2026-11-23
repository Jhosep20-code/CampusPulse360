import { expect, test, type Page } from "@playwright/test";

/**
 * Bloques RESTANTES de la bateria de aislamiento (los casos P1-P10 desde el estado inicial
 * ya pasaron en escritorio y movil: ver docs/evidencias). Cada bloque es corto, con tiempo
 * maximo propio, solo aserciones geometricas (inspector ?visualtest) y pocas capturas.
 */
type Debug = { isolatedLevel: number | null; preset: string; exploded: boolean; degenerate: number; visibleByLevel: Record<string, number>; spacesDrawn: string[] };
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const WAIT = Number(process.env.VISUAL_WAIT_MS ?? 2500);
const sel = (p: Page) => p.locator("select#aislar-piso");
const view = (p: Page, n: RegExp) => p.getByRole("group", { name: "Vistas de cámara" }).getByRole("button", { name: n });
const dbg = (p: Page) => p.evaluate(() => (window as unknown as { __twinDebug: () => Debug }).__twinDebug());

async function open(p: Page) {
  await p.goto("/?visualtest=1");
  await p.waitForFunction(() => typeof (window as unknown as { __twinDebug?: unknown }).__twinDebug === "function", null, { timeout: 120_000 });
  await p.waitForTimeout(6000);
}
function only(d: Debug, l: number, c: string) {
  expect(d.degenerate, `${c}: degeneradas`).toBe(0);
  for (const [k, n] of Object.entries(d.visibleByLevel)) if (Number(k) !== l) expect(n, `${c}: visibles del piso ${k}`).toBe(0);
  expect(d.visibleByLevel[String(l)] ?? 0, `${c}: geometria del piso`).toBeGreaterThan(0);
  for (const id of d.spacesDrawn) expect(id.startsWith(`SPC_${l}_`), `${c}: ${id}`).toBe(true);
}
function full(d: Debug, c: string) {
  expect(d.degenerate, `${c}: degeneradas`).toBe(0);
  expect(d.isolatedLevel, `${c}: sin aislamiento`).toBeNull();
  for (const l of LEVELS) expect(d.visibleByLevel[String(l)] ?? 0, `${c}: piso ${l}`).toBeGreaterThan(0);
}
async function step(p: Page, f: () => Promise<unknown>) {
  await f();
  await p.waitForTimeout(WAIT);
}
const reset = (p: Page) => step(p, () => p.getByRole("button", { name: /Restablecer vista/ }).click({ force: true }));

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
test.beforeEach(({}, info) => test.skip(info.project.name !== "escritorio", "bloques en el proyecto escritorio"));

test("B2: transiciones consecutivas y no consecutivas", async ({ page }) => {
  test.setTimeout(480_000);
  await open(page);
  for (const l of [1, 2, 3, 10, 4, 9, 5, 6, 8, 7]) {
    await step(page, () => sel(page).selectOption(String(l)));
    only(await dbg(page), l, `->P${l}`);
  }
  await reset(page);
  full(await dbg(page), "reset");
});

for (const group of [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]]) {
  test(`B3: vistas y explosion con P${group[0]}-P${group.at(-1)} (incluye incompatibles)`, async ({ page }) => {
    test.setTimeout(600_000);
    await open(page);
    for (const l of group) {
      await step(page, () => sel(page).selectOption(String(l)));
      await step(page, () => view(page, /Aérea/).click({ force: true }));
      only(await dbg(page), l, `P${l}+Aerea`);
      await step(page, () => page.getByRole("button", { name: /Pisos explotados/ }).click({ force: true }));
      only(await dbg(page), l, `P${l}+Explotado`);
      await step(page, () => view(page, /Atrio/).click({ force: true }));
      let d = await dbg(page);
      full(d, `P${l}->Atrio`);
      expect(d.exploded).toBe(false);
      await step(page, () => sel(page).selectOption(String(l)));
      d = await dbg(page);
      expect(d.preset).toBe("facade");
      only(d, l, `Atrio->P${l}`);
      await step(page, () => view(page, /Referencia/).click({ force: true }));
      full(await dbg(page), `P${l}->Referencia`);
      await expect(sel(page)).toHaveValue("all");
      await reset(page);
      d = await dbg(page);
      full(d, `reset P${l}`);
      expect(d.preset).toBe("facade");
    }
  });
}

test("B4: Atrio, noche y dia, Fachada y Referencia tras P6/P9 (capturas)", async ({ page }) => {
  test.setTimeout(480_000);
  await open(page);
  for (const l of [6, 9]) {
    await step(page, () => sel(page).selectOption(String(l)));
    await step(page, () => view(page, /Referencia/).click({ force: true }));
    full(await dbg(page), `Referencia tras P${l}`);
    await page.screenshot({ path: `../../docs/entregables/FINAL/capturas/pisos/escritorio-referencia-tras-P${l}.png`, timeout: 180_000 });
    await reset(page);
  }
  await step(page, () => view(page, /Atrio/).click({ force: true }));
  full(await dbg(page), "Atrio");
  await page.screenshot({ path: "../../docs/entregables/FINAL/capturas/pisos/escritorio-atrio.png", timeout: 180_000 });
  await step(page, () => page.getByRole("button", { name: /Modo noche/ }).click({ force: true }));
  await step(page, () => page.getByRole("button", { name: /Modo noche/ }).click({ force: true }));
  await step(page, () => view(page, /Fachada/).click({ force: true }));
  full(await dbg(page), "Atrio->noche->dia->Fachada");
});
