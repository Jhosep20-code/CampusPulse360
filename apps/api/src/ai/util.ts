/** Utilidades puras de IA (sin E/S). */

/** Extrae el primer objeto JSON balanceado de un texto (tolera ``` y texto alrededor). */
export function extractJsonObject(text: string): string | null {
  const s = text.replace(/```(?:json)?/gi, "");
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export function parseJsonLoose(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const raw = extractJsonObject(text);
  if (!raw) return { ok: false, error: "no se encontro ningun objeto JSON en la respuesta" };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: `JSON malformado: ${e instanceof Error ? e.message : "error de sintaxis"}` };
  }
}

const LIMA_OFFSET_MS = -5 * 3_600_000; // America/Lima: UTC-5 todo el ano (sin horario de verano)
const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

/** Hora local de Lima legible, p. ej. "2026-11-21 14:35 (viernes, hora de Lima UTC-5)". */
export function limaTime(ms: number): string {
  const d = new Date(ms + LIMA_OFFSET_MS);
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} (${DIAS[d.getUTCDay()]}, hora de Lima UTC-5)`;
}

export function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Estimacion gruesa de tokens (~4 caracteres por token) solo para el proveedor mock. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
