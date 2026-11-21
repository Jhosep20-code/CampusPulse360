import { newId } from "./ids";

function fmt(detail: unknown): string | null {
  if (detail === undefined || detail === null) return null;
  const s = typeof detail === "string" ? detail : JSON.stringify(detail);
  return s.length > 1000 ? s.slice(0, 1000) : s;
}

/** Sentencia de auditoria para incluirla en un db.batch (atomica con la operacion). */
export function auditStmt(
  db: D1Database,
  now: number,
  actor: string,
  action: string,
  target?: string | null,
  detail?: unknown,
): D1PreparedStatement {
  return db
    .prepare("INSERT INTO audit_log (id, ts, actor, action, target, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(newId("aud"), now, actor, action, target ?? null, fmt(detail));
}

export async function audit(
  db: D1Database,
  now: number,
  actor: string,
  action: string,
  target?: string | null,
  detail?: unknown,
): Promise<void> {
  await auditStmt(db, now, actor, action, target, detail).run();
}
