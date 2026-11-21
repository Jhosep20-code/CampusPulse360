/**
 * Evaluacion del asistente: llama a BASE_URL/api/v1/ai/chat con las preguntas de
 * eval/dataset.json y calcula la tasa de aciertos. Escribe eval/results-<fecha>.json.
 *
 *   BASE_URL=http://localhost:8787 node eval/run.ts
 *
 * Los datos del campus son SIMULADOS. Con AI_PROVIDER=mock mide el contrato del
 * flujo; solo con un proveedor real mide la calidad del modelo. No ejecutar contra
 * servicios de pago. La funcion judge() es pura y tambien la usan las pruebas.
 */
import dataset from "./dataset.json" with { type: "json" };

export interface ChatCase {
  id: string;
  question: string;
  expected_space_ids: string[];
  keywords_any: string[];
}

export interface ChatLike {
  answer: string;
  citations: string[];
  actions: Array<{ type: string; ids: string[] }>;
  meta?: { mode?: string; provider?: string; latency_ms?: number | null };
}

/** Acierta si aparecen TODOS los ids esperados (citas, acciones o texto) y alguna palabra clave (si se pide). */
export function judge(c: ChatCase, r: ChatLike): { pass: boolean; missing_ids: string[]; keyword_ok: boolean } {
  const haystack = new Set<string>([...r.citations, ...r.actions.flatMap((a) => a.ids)]);
  const text = r.answer.toLowerCase();
  const missing = c.expected_space_ids.filter((id) => !haystack.has(id) && !r.answer.includes(id));
  const keywordOk = c.keywords_any.length === 0 || c.keywords_any.some((k) => text.includes(k.toLowerCase()));
  return { pass: missing.length === 0 && keywordOk, missing_ids: missing, keyword_ok: keywordOk };
}

declare const process: { env: Record<string, string | undefined>; argv: string[]; exit(code: number): never };

async function main(): Promise<void> {
  const base = (process.env.BASE_URL ?? "http://localhost:8787").replace(/\/$/, "");
  const delayMs = Number(process.env.EVAL_DELAY_MS ?? 1500);
  const cases = dataset.chat as ChatCase[];
  const rows: Array<Record<string, unknown>> = [];
  let passed = 0;
  for (const c of cases) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${base}/api/v1/ai/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: c.question, history: [] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`http-${res.status}`);
      const body = (await res.json()) as ChatLike;
      const j = judge(c, body);
      if (j.pass) passed++;
      rows.push({ id: c.id, question: c.question, pass: j.pass, missing_ids: j.missing_ids, keyword_ok: j.keyword_ok, mode: body.meta?.mode, provider: body.meta?.provider, ms: Date.now() - t0 });
    } catch (e) {
      rows.push({ id: c.id, question: c.question, pass: false, error: e instanceof Error ? e.message : "error", ms: Date.now() - t0 });
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  const date = new Date().toISOString().slice(0, 10);
  const result = {
    date,
    base_url: base,
    simulated_data: true,
    total: cases.length,
    passed,
    hit_rate: cases.length ? Math.round((passed / cases.length) * 1000) / 1000 : 0,
    cases: rows,
  };
  // @ts-ignore node:fs no esta en los tipos del Worker; el script corre en Node 24.
  const { writeFileSync } = await import("node:fs");
  const out = new URL(`./results-${date}.json`, (import.meta as unknown as { url: string }).url);
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(`aciertos ${passed}/${cases.length} (${result.hit_rate}) -> eval/results-${date}.json`);
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("run.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
