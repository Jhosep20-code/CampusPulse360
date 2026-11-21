import type { ChatResponse } from "@campuspulse/contracts";
import { Bot, Box, Send, Sparkles, User } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useSpaceIndex } from "../app/context";
import { Notice, PageHeader, Panel } from "../components/ui";
import { api } from "../lib/api";

const SUGGESTIONS = [
  "¿Qué espacios tienen el CO₂ más alto ahora?",
  "¿Qué incidencias críticas siguen abiertas?",
  "¿Cuál es el espacio más ocupado respecto a su aforo?",
];

type Msg =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; res: ChatResponse };

const MODE_LABEL: Record<ChatResponse["meta"]["mode"], string> = {
  live: "En vivo",
  cached: "En caché",
  fallback: "Respaldo sin IA",
};

export default function Assistant() {
  const spaces = useSpaceIndex();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, busy]);

  async function ask(text: string) {
    const message = text.trim().slice(0, 500);
    if (!message || busy) return;
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    setMessages((m) => [...m, { role: "user", content: message }]);
    setInput("");
    setError(null);
    setBusy(true);
    try {
      const res = await api.chat({ message, history });
      setMessages((m) => [...m, { role: "assistant", content: res.answer, res }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar al asistente");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  return (
    <div>
      <PageHeader title="Asistente" subtitle="Consulta el estado del campus en lenguaje natural. Responde con datos simulados y cita los espacios." />
      <Panel bodyClassName="flex h-[calc(100dvh-17rem)] min-h-[420px] flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Conversación con el asistente">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="grid size-12 place-items-center rounded-2xl border border-line bg-panel-2 text-ok">
                <Sparkles size={22} aria-hidden="true" />
              </span>
              <p className="m-0 max-w-sm text-sm text-ink-2">Pregunta por CO₂, ocupación, temperatura o incidencias. Prueba con una sugerencia:</p>
              <div className="flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="btn btn-sm !h-auto !py-2 text-left" onClick={() => void ask(s)} disabled={busy}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end gap-2">
                  <p className="m-0 max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-sm text-white">{m.content}</p>
                  <User size={16} className="mt-2 shrink-0 text-ink-2" aria-label="Tú" />
                </div>
              ) : (
                <div key={i} className="flex gap-2">
                  <Bot size={16} className="mt-2 shrink-0 text-ok" aria-label="Asistente" />
                  <div className="max-w-[90%] space-y-2">
                    <p className="m-0 whitespace-pre-wrap rounded-2xl rounded-bl-md border border-line bg-panel-2 px-3.5 py-2 text-sm">{m.content}</p>
                    {m.res.citations.length > 0 ? (
                      <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0" aria-label="Espacios citados">
                        <li className="text-[11px] text-ink-2">Citas:</li>
                        {m.res.citations.map((c) => (
                          <li key={c}>
                            <Link
                              to={`/espacios/${encodeURIComponent(c)}`}
                              className="inline-flex items-center rounded-full border border-brand/50 bg-brand/15 px-2.5 py-0.5 text-xs font-medium text-link no-underline hover:border-link"
                            >
                              {spaces.get(c)?.name ?? c}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="num flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 font-medium ${
                          m.res.meta.mode === "fallback" ? "border-warn/40 bg-warn/10 text-warn" : "border-ok/40 bg-ok/10 text-ok"
                        }`}
                      >
                        {m.res.meta.provider === "mock" ? "IA simulada (mock)" : MODE_LABEL[m.res.meta.mode]}
                      </span>
                      <span>Modelo: {m.res.meta.model}</span>
                      {m.res.actions.map((a, k) => (
                        <button
                          key={k}
                          type="button"
                          className="btn btn-sm !min-h-7"
                          onClick={() => navigate("/", { state: { focusSpaceIds: a.ids } })}
                        >
                          <Box size={13} aria-hidden="true" /> Ver en el gemelo
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ),
            )
          )}
          {busy ? (
            <p role="status" className="m-0 flex items-center gap-2 text-sm text-ink-2">
              <Sparkles size={14} className="animate-pulse text-ok" aria-hidden="true" /> El asistente está respondiendo…
            </p>
          ) : null}
          <div ref={endRef} />
        </div>

        {error ? (
          <div className="px-4 pb-2">
            <Notice kind="error">{error}</Notice>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-line p-3">
          <label htmlFor="chat-input" className="sr-only">
            Mensaje para el asistente
          </label>
          <textarea
            id="chat-input"
            className="field max-h-32 min-h-[44px] flex-1 resize-none"
            rows={1}
            maxLength={500}
            value={input}
            placeholder="Escribe tu pregunta…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
          />
          <button type="submit" className="btn btn-primary h-[44px]" disabled={busy || input.trim().length === 0} aria-label="Enviar mensaje">
            <Send size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
      </Panel>
    </div>
  );
}
