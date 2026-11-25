/**
 * Autenticador WebAuthn SOLO DE PRUEBA (ECDSA P-256, atestacion "none") para ejercitar de punta a punta
 * register -> login -> vincular con la verificacion REAL de @simplewebauthn/server. Nunca se usa fuera de tests.
 */
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

/* --------------------------------------------------------- CBOR minimo */
type Cbor = number | string | Uint8Array | Map<number | string, Cbor>;

function head(major: number, n: number): Uint8Array {
  if (n < 24) return new Uint8Array([(major << 5) | n]);
  if (n < 256) return new Uint8Array([(major << 5) | 24, n]);
  return new Uint8Array([(major << 5) | 25, n >> 8, n & 0xff]);
}

function cbor(v: Cbor): Uint8Array {
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === "string") {
    const b = enc.encode(v);
    return concat(head(3, b.length), b);
  }
  if (v instanceof Uint8Array) return concat(head(2, v.length), v);
  const parts: Uint8Array[] = [head(5, v.size)];
  for (const [k, val] of v) parts.push(cbor(k), cbor(val));
  return concat(...parts);
}

/** Firma ECDSA cruda (r||s, 64 bytes) -> DER, como la entrega un autenticador real. */
function derSig(raw: Uint8Array): Uint8Array {
  const int = (x: Uint8Array) => {
    let i = 0;
    while (i < x.length - 1 && x[i] === 0) i++;
    let v: Uint8Array = x.slice(i);
    if (v[0]! & 0x80) v = concat(new Uint8Array([0]), v);
    return concat(new Uint8Array([0x02, v.length]), v);
  };
  const body = concat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

export interface SoftCredential {
  id: Uint8Array;
  keys: CryptoKeyPair;
  userHandle: string;
  counter: number;
}

export async function softRegister(
  options: { challenge: string; rp: { id: string }; user: { id: string } },
  origin: string,
): Promise<{ response: unknown; credential: SoftCredential }> {
  const keys = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", keys.publicKey)) as JsonWebKey;
  const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));
  const cose = cbor(
    new Map<number, Cbor>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, fromB64url(jwk.x!)],
      [-3, fromB64url(jwk.y!)],
    ]),
  );
  const id = crypto.getRandomValues(new Uint8Array(32));
  const authData = concat(
    await sha256(enc.encode(options.rp.id)),
    new Uint8Array([0x45]), // UP | UV | AT
    new Uint8Array([0, 0, 0, 0]),
    new Uint8Array(16), // AAGUID
    new Uint8Array([0, id.length]),
    id,
    cose,
  );
  const clientData = enc.encode(JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin, crossOrigin: false }));
  const attestationObject = cbor(
    new Map<string, Cbor>([
      ["fmt", "none"],
      ["attStmt", new Map()],
      ["authData", authData],
    ]),
  );
  return {
    credential: { id, keys, userHandle: options.user.id, counter: 0 },
    response: {
      id: b64url(id),
      rawId: b64url(id),
      type: "public-key",
      response: { clientDataJSON: b64url(clientData), attestationObject: b64url(attestationObject), transports: ["internal"] },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    },
  };
}

export async function softLogin(cred: SoftCredential, options: { challenge: string; rpId: string }, origin: string): Promise<unknown> {
  cred.counter += 1;
  const c = cred.counter;
  const authData = concat(await sha256(enc.encode(options.rpId)), new Uint8Array([0x05, (c >> 24) & 255, (c >> 16) & 255, (c >> 8) & 255, c & 255]));
  const clientData = enc.encode(JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin, crossOrigin: false }));
  const signed = concat(authData, await sha256(clientData));
  const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cred.keys.privateKey, signed));
  return {
    id: b64url(cred.id),
    rawId: b64url(cred.id),
    type: "public-key",
    response: {
      clientDataJSON: b64url(clientData),
      authenticatorData: b64url(authData),
      signature: b64url(derSig(raw)),
      userHandle: cred.userHandle,
    },
    clientExtensionResults: {},
    authenticatorAttachment: "platform",
  };
}
