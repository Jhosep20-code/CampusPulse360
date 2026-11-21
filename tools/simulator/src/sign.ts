/**
 * Firma del gateway: X-Signature = hex(HMAC-SHA256(clave, `${X-Timestamp}.${cuerpo_crudo}`)).
 * Mismo algoritmo que el servidor (apps/api/src/routes/ingest.ts). La clave se entrega
 * en hexadecimal y se usa decodificada a bytes. Solo WebCrypto, sin dependencias.
 */
const enc = new TextEncoder();

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("GATEWAY_KEY debe ser hexadecimal de longitud par");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

export async function signBody(keyHex: string, timestamp: string | number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", hexToBytes(keyHex), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${body}`));
  return bytesToHex(new Uint8Array(sig));
}

export async function signedHeaders(
  gatewayId: string,
  keyHex: string,
  timestamp: number,
  body: string,
): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    "x-gateway-id": gatewayId,
    "x-timestamp": String(timestamp),
    "x-signature": await signBody(keyHex, timestamp, body),
  };
}
