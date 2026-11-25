# CampusPulse 360

Gemelo digital inteligente para la gestión predictiva y la automatización del campus UTP Huancayo, con IoT, IA generativa, realidad aumentada y DevOps.

> **Datos simulados.** Toda la telemetría actual viene de un simulador IoT y se rotula como `SIMULADO`. La geometría del edificio es un **modelo aproximado** hecho en Blender a partir de fotografías, no un plano oficial.

**Demo pública:** https://campuspulse.campuspulse-api.workers.dev (el visitante tiene solo lectura; el administrador entra con passkey).
**En producción (25-nov-2026):** commit `004eaa4`, Worker `182f079c` (clave del gateway rotada el 25-nov, sin cambios de código). Rollback de código: `d9180962` (commit `513ce1e`); tras un rollback hay que verificar la clave y volver a rotarla. El despliegue es manual; `main` no se ha fusionado.

## Ejes integrados
| Eje | Implementación y estado |
|---|---|
| IoT | **Dos vías de datos simulados.** Docker: simulador → ingesta firmada con HMAC por gateway → D1. Demo pública: el simulador en la nube escribe directo en D1 (sin HMAC) y se pausa si un gateway informa. Los escenarios del administrador entran con su sesión |
| RPA | Bot de incidencias (Cron cada minuto) y bot de reportes (diario). **Telegram no está configurado:** no se envían notificaciones |
| IA generativa | Diagnóstico de incidencias con JSON validado y asistente de solo lectura, con `@cf/openai/gpt-oss-20b` en Cloudflare Workers AI (modelo de OpenAI; **no** es la API oficial de OpenAI; ver ADR-002). Si no hay IA, respuesta por reglas rotulada «sin IA» |
| AR/VR | **Implementado:** WebXR AR en Android (nivel A), Scene Viewer (B), visor 3D (C) y **recorrido en primera persona** con colisiones (teclado y controles táctiles), publicado en producción. La AR física debe repetirse sobre la versión publicada. **No** es Unity ni VR con visor |
| CI/CD + Docker | GitHub Actions: gitleaks, tipos, pruebas, build, e2e con Docker Compose e imagen del simulador (se publica en GHCR solo desde `main`, aún no). El job de deploy está desactivado |

## Estructura
```
apps/api           Worker Cloudflare (Hono) + D1: API /api/v1, bots, IA
apps/web           SPA React + Tailwind + gemelo 3D (React Three Fiber)
packages/contracts Esquemas zod compartidos (fuente única de la API)
tools/simulator    Simulador IoT (Node 24, sin dependencias de ejecución) + Dockerfile
tools/e2e          Pruebas de extremo a extremo (Playwright)
assets/3d          Modelo de Blender y exportación GLB
infra/             Dockerfile de la API y claves locales
docs/              Decisiones (ADR), riesgos, evidencias y entregables
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
Levanta el Worker con D1 local, la SPA, el simulador IoT y el cron del bot. Sin internet, la IA usa el respaldo por reglas, rotulado «sin IA».

**1. Con internet, una vez por equipo.** Generar claves locales aleatorias (no las muestra ni sobrescribe un archivo existente):

```powershell
node infra/generar-env-local.mjs
```

Sin Node, con Docker:

```powershell
docker pull node:24-bookworm-slim
```

```powershell
docker run --rm -v "${PWD}\infra:/infra" node:24-bookworm-slim node /infra/generar-env-local.mjs
```

Descargar imágenes y construir con sus dependencias:

```powershell
docker compose pull cron
```

```powershell
docker compose build
```

**2. Arrancar (también sin internet):**

```powershell
docker compose up -d --no-build --pull never --wait
```

Abrir http://localhost:8787. Para lanzar escenarios, registra un administrador local en `/acceso` con el `BOOTSTRAP_TOKEN` de `infra/local.env` (un solo uso). Pasos completos y solución de fallos: [LEEME.txt](docs/entregables/FINAL/LEEME.txt).

**3. Pruebas e2e contra ese stack:**

```powershell
pnpm --filter @campuspulse/e2e e2e
```

## Presupuesto
S/ 0.00 adicionales. Plan Free de Cloudflare (Workers, D1, Workers AI) y GitHub Actions en repositorio público. No se activa facturación.
