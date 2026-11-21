# ADR-001 — Arquitectura base

- **Estado:** aceptada (21-nov-2026)
- **Contexto:** presupuesto adicional S/ 0.00, entrega el 27-nov-2026, 5 ejes de la rúbrica.

## Decisión
- Un solo Cloudflare Worker (Hono) sirve la API `/api/v1` y la SPA React (Static Assets): un deploy y mismo origen, sin CORS.
- D1 (SQLite) como base de datos. Tabla ancha `readings` (una fila por dispositivo y lectura con 5 variables) para minimizar escrituras (límite Free: 100k filas/día).
- Sondeo de `/live` cada 10 s con ETag en lugar de WebSockets (estable, dentro de 100k peticiones/día).
- 2 Cron Triggers (de 5 permitidos): bot de incidencias cada minuto y bot de reportes diario.
- Monorepo pnpm con `packages/contracts` (zod) como única fuente de verdad de la API.
- Docker para el simulador IoT (también usado por CI) y para el modo local; Cloudflare Containers es de pago y no se usa.

## Hallazgos de versiones (21-nov-2026)
- `@cloudflare/vitest-pool-workers` está deprecado; se usa `@cloudflare/vitest-plugin` 1.9 (pruebas en workerd con D1 local).
- TypeScript 7 (compilador nativo), Vitest 5, Vite 8, React 19.3, react-router 8, Tailwind 4.3 y zod 4.6.

## Consecuencias
- Límite de 10 ms de CPU por invocación (también en Cron): las agregaciones van en SQL y el cron hace trabajo acotado.
