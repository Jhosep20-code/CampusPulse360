// Genera infra/local.env con claves LOCALES aleatorias para el modo Docker (contingencia sin internet).
// No usa ni toca las claves de produccion, no sobrescribe un archivo existente y no imprime ningun valor.
// Uso (desde la raiz del proyecto):  node infra/generar-env-local.mjs
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("./local.env", import.meta.url));
if (existsSync(out)) {
  console.log("infra/local.env ya existe: no se modifica.");
  process.exit(0);
}
const key = randomBytes(32).toString("hex");
const lines = [
  "# Valores LOCALES generados automaticamente. No copiar a produccion ni subir a git.",
  `GATEWAY_KEYS=${JSON.stringify({ "gw-sim-01": key })}`,
  `GATEWAY_KEY=${key}`,
  `BOOTSTRAP_TOKEN=${randomBytes(24).toString("base64url")}`,
  "TELEGRAM_BOT_TOKEN=",
  "TELEGRAM_CHAT_ID=",
];
writeFileSync(out, lines.join("\n") + "\n", { flag: "wx" });
console.log("infra/local.env creado (los valores no se muestran).");
