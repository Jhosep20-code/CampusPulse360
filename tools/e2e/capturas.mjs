// Capturas reales del gemelo (escritorio y movil) para evidencia. Uso:
//   node tools/e2e/capturas.mjs <baseURL> <carpeta-salida>
import { chromium, devices } from "@playwright/test";
const [base = "http://localhost:5173", out = "docs/entregables/FINAL/capturas"] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];

async function waitRender(page) {
  // El buffer WebGL no se conserva fuera del frame: se espera un tiempo fijo tras montar el canvas.
  await page.waitForSelector("canvas", { timeout: 60000 });
  await page.waitForTimeout(20000);
}
async function twinShot(page, file) {
  // Recorte directo: la comprobacion de "estabilidad" de Playwright depende de rAF y no
  // termina con el renderizado WebGL por software (muy lento) del navegador de pruebas.
  const box = await page.evaluate(() => {
    const el = document.querySelector('[role="img"][aria-label^="Gemelo"]').parentElement;
    el.scrollIntoView({ block: "center" });
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${file}`, clip: box, timeout: 180000 });
  console.log("captura:", file);
}
async function view(page, name) {
  await page.getByRole("group", { name: "Vistas de cámara" }).getByRole("button", { name }).click();
  await page.waitForTimeout(3500);
}

const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
desk.on("pageerror", (e) => errors.push(e.message));
await desk.goto(base + "/");
await waitRender(desk);
await twinShot(desk, "gemelo-fachada-escritorio.png");
await view(desk, "Atrio");
await twinShot(desk, "gemelo-atrio-escritorio.png");
await view(desk, "Referencia");
await twinShot(desk, "gemelo-referencia-escritorio.png");
await view(desk, "Aérea");
await twinShot(desk, "gemelo-aerea-escritorio.png");
await view(desk, "Fachada");
await desk.getByRole("button", { name: /Modo noche/ }).click();
await desk.waitForTimeout(3500);
await twinShot(desk, "gemelo-noche-escritorio.png");
await desk.getByRole("button", { name: /Modo noche/ }).click();
await desk.locator("select").filter({ has: desk.locator('option[value="all"]') }).selectOption("8");
await desk.waitForTimeout(3500);
await twinShot(desk, "gemelo-piso-P8-escritorio.png");

await desk.close(); // libera la GPU por software antes del movil
// Densidad 1: con renderizado por software, la densidad 2,6x del Pixel 7 agota el tiempo de captura.
const mob = await browser.newPage({ ...devices["Pixel 7"], deviceScaleFactor: 1 });
mob.on("pageerror", (e) => errors.push(e.message));
await mob.goto(base + "/");
await waitRender(mob);
await mob.screenshot({ path: `${out}/movil-mando.png`, fullPage: false });
await twinShot(mob, "gemelo-fachada-movil.png");
await mob.goto(base + "/ar");
await mob.waitForTimeout(2000);
await mob.screenshot({ path: `${out}/movil-ar.png`, timeout: 180000 });
await browser.close();
console.log("errores de pagina:", errors.length ? errors : "ninguno");
