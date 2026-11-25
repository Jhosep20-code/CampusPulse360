/** Bindings y variables del Worker. Los secretos nunca se versionan. */
export interface Env {
  DB: D1Database;
  /** Workers AI (plan Free: 10.000 neuronas/dia). Ausente en pruebas. */
  AI?: Ai;
  ASSETS?: Fetcher;
  ENVIRONMENT: "local" | "preview" | "production";
  APP_VERSION: string;
  GIT_COMMIT: string;
  /** workers-ai | openai | mock. "openai" solo si existe OPENAI_API_KEY aportada por el equipo. */
  AI_PROVIDER: "workers-ai" | "openai" | "mock";
  AI_MODEL: string;
  AI_DAILY_LIMIT: string;
  /** "on" activa el simulador en la nube (demo publica); por defecto apagado. */
  CLOUD_SIM?: string;
  WEBAUTHN_RP_ID: string;
  WEBAUTHN_RP_NAME: string;
  WEBAUTHN_ORIGIN: string;
  /** Secreto JSON: {"gw-sim-01":"<clave hex>"} */
  GATEWAY_KEYS?: string;
  /** Secreto: token de arranque de un solo uso para dar de alta la primera passkey. */
  BOOTSTRAP_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  OPENAI_API_KEY?: string;
}
