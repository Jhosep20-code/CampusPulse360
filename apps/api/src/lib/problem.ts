/** Errores HTTP con formato RFC 7807 (application/problem+json). */
const TITLES: Record<number, string> = {
  400: "Solicitud invalida",
  401: "No autenticado",
  403: "Prohibido",
  404: "No encontrado",
  409: "Conflicto",
  413: "Cuerpo demasiado grande",
  415: "Tipo de contenido no soportado",
  429: "Demasiadas solicitudes",
  500: "Error interno",
  503: "Servicio no disponible",
};

export interface ProblemError {
  path: string;
  message: string;
}

export class HttpError extends Error {
  readonly status: number;
  readonly detail: string | undefined;
  readonly headers: Record<string, string>;
  readonly errors: ProblemError[] | undefined;
  constructor(
    status: number,
    detail?: string,
    opts: { headers?: Record<string, string>; errors?: ProblemError[]; title?: string } = {},
  ) {
    super(opts.title ?? TITLES[status] ?? "Error");
    this.status = status;
    this.detail = detail;
    this.headers = opts.headers ?? {};
    this.errors = opts.errors;
  }
}

export function problemResponse(
  status: number,
  title: string,
  detail?: string,
  errors?: ProblemError[],
  headers: Record<string, string> = {},
): Response {
  const body: Record<string, unknown> = { type: "about:blank", title, status };
  if (detail) body.detail = detail;
  if (errors && errors.length > 0) body.errors = errors;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json; charset=utf-8", ...headers },
  });
}
