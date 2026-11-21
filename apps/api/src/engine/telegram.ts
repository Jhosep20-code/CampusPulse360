import type { Env } from "../env";

export interface TelegramResult {
  sent: boolean;
  reason?: string;
}

/**
 * Envia un mensaje por Telegram (E/S, no consume CPU relevante). Nunca registra
 * ni devuelve el token: los errores de red se reducen a un motivo generico.
 */
export async function sendTelegram(env: Env, text: string): Promise<TelegramResult> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { sent: false, reason: "no-configurado" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3500), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { sent: false, reason: `http-${res.status}` };
    return { sent: true };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { sent: false, reason: timeout ? "timeout" : "error-de-red" };
  }
}
