# CampusPulse 360

Gemelo digital inteligente para la gestión predictiva y la automatización del campus UTP Huancayo, con IoT, IA generativa, realidad aumentada y DevOps.

> **Datos simulados.** Toda la telemetría actual viene de un simulador IoT y se rotula como `SIMULADO`. La geometría del edificio es un **modelo representativo provisional**, no un plano oficial.

## Ejes integrados
| Eje | Implementación |
|---|---|
| IoT | Simulador (Docker) → ingesta firmada con HMAC por gateway → D1 → `/live` → dashboard y gemelo 3D |
| RPA | Bot de incidencias (Cron cada minuto), bot de reportes (diario), notificación por Telegram |
| IA generativa | Diagnóstico de incidencias con JSON validado y asistente con herramientas de solo lectura (Workers AI, `gpt-oss-20b`; ver ADR-002) |
| AR/VR | WebXR AR en Android (siguiente hito) |
| CI/CD + Docker | GitHub Actions: gitleaks, tipos, pruebas, build, imagen GHCR, deploy condicionado |

## Estructura
```
apps/api           Worker Cloudflare (Hono) + D1: API /api/v1, bots, IA
apps/web           SPA React + Tailwind + gemelo 3D (React Three Fiber)
packages/contracts Esquemas zod compartidos (fuente única de la API)
tools/simulator    Simulador IoT (Node 24, sin dependencias de ejecución) + Dockerfile
docs/              Decisiones (ADR), riesgos, evidencias
```

## Desarrollo local
Requisitos: Node 24, pnpm 12 y Docker (opcional).

```powershell
pnpm install
```

```powershell
Copy-Item apps/api/.dev.vars.example apps/api/.dev.vars   # y completar valores locales
```

```powershell
pnpm --filter @campuspulse/api db:migrate:local
```

```powershell
pnpm dev:api    # http://localhost:8787
```

```powershell
pnpm dev:web    # http://localhost:5173 (proxy /api → 8787)
```

Pruebas: `pnpm typecheck` y `pnpm test`.

## Modo local de contingencia (Docker Compose)
Levanta el Worker con D1 local, la SPA, el simulador IoT y el cron del bot. No depende de servicios externos. Sin internet, el diagnóstico usa el respaldo por reglas, rotulado "sin IA".

```powershell
Copy-Item infra/local.env.example infra/local.env   # completar con valores aleatorios locales
```

```powershell
docker compose up -d --build --wait
```

Abrir http://localhost:8787. Pruebas e2e contra ese stack:

```powershell
pnpm --filter @campuspulse/e2e e2e
```

## Presupuesto
S/ 0.00 adicionales. Plan Free de Cloudflare (Workers, D1, Workers AI) y GitHub Actions en repositorio público. No se activa facturación.
