# Evidencias — Despliegue público y gemelo de 10 pisos

- **Fecha:** 22-nov-2026
- **Rama:** `feature/hito-2`
- **URL pública:** https://campuspulse.campuspulse-api.workers.dev
- **Plan:** Cloudflare Workers Free, sin facturación ni servicios de pago.

## 1. Cuenta de Cloudflare (incidencia resuelta)
| Comprobación | Resultado |
|---|---|
| Sesión `default` de wrangler en este equipo | Cuenta antigua de OTRO proyecto (id omitido). Credenciales en `AppData\Roaming\xdg.config\.wrangler\config\default.toml`, sin cambios desde las 20:29 |
| Variables `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `XDG_CONFIG_HOME` | No definidas |
| Causa | El login con la cuenta nueva no quedó en el archivo que usa este entorno |
| Corrección 1 | `account_id: 5ca2972899cf96e5009864b8549b2a89` fijado en `apps/api/wrangler.jsonc`. Con la sesión antigua, wrangler falla con "Authentication error" y no toca la otra cuenta |
| Corrección 2 | Perfil `campuspulse` (`wrangler auth create`) asociado solo a `C:\Proyectos\CampusPulse360` |
| Verificación | Dentro del repo: `5ca297…9b2a89`. Fuera del repo: se mantiene (cuenta de otro proyecto, id omitido). la base de datos del otro proyecto no se tocó |

## 2. Recursos creados (solo en la cuenta nueva)
| Recurso | Detalle |
|---|---|
| D1 `campuspulse-db` | `fba88b80-4846-4f5c-b7ef-d3578dc2390b`, región ENAM, migraciones 0001–0004 aplicadas |
| Worker `campuspulse` | API + SPA (87 assets), Cron `* * * * *` y `0 12 * * *` |
| Secretos | `GATEWAY_KEYS` y `BOOTSTRAP_TOKEN`, cargados con `wrangler secret bulk`. Copia local en `infra/production.secrets.local.env`, ignorada por git |
| Variables | `ENVIRONMENT=production`, `WEBAUTHN_RP_ID` y `WEBAUTHN_ORIGIN` = host workers.dev, `CLOUD_SIM=on` |

## 3. Verificación pública (salidas reales)
| Prueba | Resultado |
|---|---|
| `GET /` y `/ar` | HTTP 200 (tras unos 80 s de propagación del DNS de workers.dev) |
| `GET /api/v1/system/health` | `{"status":"ok","checks":{"db":true,"ai":"available"}}` |
| `GET /api/v1/system/info` | `environment: production`, commit desplegado, `telemetry_simulated: true` |
| Cabeceras | `Strict-Transport-Security: max-age=31536000; includeSubDomains` y CSP `default-src 'none'` en la API |
| GLB de AR | `/models/campus-ar.glb` HTTP 200 |
| Ingesta HMAC (simulador → producción) | Backfill de 910/910 lecturas aceptadas |
| Cron Triggers | Al principio sin ejecuciones (propagación); luego `bot_runs` cada minuto con resultado `ok` (observado con `wrangler tail`) |
| Simulador en la nube | `spaces_offline: 0` y KPIs vivos sin ningún gateway externo |
| **IA real (Workers AI)** | `/ai/chat`: `provider workers-ai`, `model @cf/openai/gpt-oss-20b`, `mode live`, latencia de 2,7 s, cita correcta de `SPC_3_A301` |
| **Cadena completa en producción** | Ingesta firmada (CO₂ alto simulado en A301) → cron → 2 incidencias críticas (CO₂ y sobreaforo) → diagnóstico `live` con gpt-oss-20b (1,8 s y 2,4 s) que cita 1.700–1.725 ppm y 52/45 personas → `bot_runs` con "diagnosticada (live)" |
| Consumo de IA | 5 llamadas y ~98 neuronas estimadas (≈1 % de las 10.000 diarias) |
| Telegram | `no-configurado` (falta el token del bot) |

## 4. Gemelo de 10 pisos
- **Modelo:** 10 niveles P1–P10, fachada según `docs/referencias/especificacion-3d.md`, interiores, día/noche, presets de cámara y selector P1–P10.
- **Ajuste visual tras compararlo con la foto real:** vidrio azul saturado y contexto urbano de ladrillo.
- **Pruebas:** 199 unitarias (antes 168), más 5 del simulador en la nube (204 en total), y 13 e2e en verde contra el stack Docker reconstruido.
- **Pendiente:**
  - comparación formal foto/render con los 8 rasgos de la §7;
  - medición de FPS en un navegador visible y en el Galaxy S25 Ultra (el panel oculto del navegador frena el renderizado y no sirve para medir).

## 5. GitHub Actions
- **Ejecución existente** [44971148478](https://github.com/Jhosep20-code/CampusPulse360/actions/runs/44971148478) sobre `main@6dd17a4`:
  - Tipos, pruebas y build: **success**.
  - gitleaks: failure. Era un falso positivo en la documentación de una skill de terceros.
  - Imagen Docker: failure. El owner del repositorio tiene mayúsculas.
- **Correcciones:** commit `ddefb1a`, todavía no publicado en GitHub. gitleaks local con la nueva configuración: "no leaks found".
