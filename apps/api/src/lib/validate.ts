import type { z } from "zod";
import { HttpError } from "./problem";
import type { AppContext } from "./db";

/** Lee el cuerpo con tope de bytes (no confia en Content-Length). 413 si se supera. */
export async function readBodyLimited(req: Request, max: number): Promise<Uint8Array<ArrayBuffer>> {
  const cl = req.headers.get("content-length");
  if (cl !== null && Number(cl) > max) throw new HttpError(413, `El cuerpo supera ${max} bytes`);
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new HttpError(413, `El cuerpo supera ${max} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const ch of chunks) {
    out.set(ch, off);
    off += ch.byteLength;
  }
  return out;
}

/** Cuerpo JSON validado con zod. ZodError lo convierte el onError global en 400. */
export async function jsonBody<S extends z.ZodType>(
  c: AppContext,
  schema: S,
  max = 16 * 1024,
): Promise<z.output<S>> {
  const bytes = await readBodyLimited(c.req.raw, max);
  if (bytes.length === 0) throw new HttpError(400, "Se requiere un cuerpo JSON");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new HttpError(400, "JSON invalido");
  }
  return schema.parse(parsed);
}

export function parseQuery<S extends z.ZodType>(c: AppContext, schema: S): z.output<S> {
  return schema.parse(c.req.query());
}
