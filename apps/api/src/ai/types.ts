import type { AiProviderName } from "@campuspulse/contracts";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiTool {
  name: string;
  description: string;
  /** JSON Schema de los argumentos. */
  parameters: Record<string, unknown>;
}

export interface AiToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiCompleteOpts {
  /** Tope de tokens de salida. En gpt-oss el razonamiento tambien consume este tope. */
  maxTokens: number;
  tools?: AiTool[];
  /** Pide salida JSON (se refuerza en el prompt; el parseo siempre se valida en servidor). */
  json?: boolean;
}

export interface AiCompletion {
  text: string;
  toolCalls?: AiToolCall[];
  usage?: { input_tokens: number; output_tokens: number };
  latencyMs: number;
}

export interface AIProvider {
  name: AiProviderName;
  model: string;
  complete(messages: AiMessage[], opts: AiCompleteOpts): Promise<AiCompletion>;
}
