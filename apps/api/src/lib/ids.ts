/** Identificador aleatorio con prefijo legible, p. ej. inc_3f2a... */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Dia UTC YYYY-MM-DD (las cuotas de Cloudflare se reinician a las 00:00 UTC). */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
