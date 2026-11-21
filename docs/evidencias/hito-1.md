# Evidencias — Hito 1: aplicación local integrada

- **Fecha:** 21-nov-2026
- **Entorno:** Windows 11, Node 24.16, pnpm 12.14, Docker 29.2.1
- **Alcance:** solo local. Nada desplegado ni publicado.
- **Clasificación:** Aprobada / Fallida / No ejecutada / Bloqueada (skill `verificar-modulo`).

## 1. Pruebas automáticas (salida real de `pnpm typecheck` y `pnpm test`)
| Paquete | Archivos | Pruebas | Resultado |
|---|---|---|---|
| packages/contracts | 1 | 9 | Aprobada |
| tools/simulator | 1 | 10 | Aprobada |
| apps/web (UI + gemelo 3D) | 9 | 58 | Aprobada |
| apps/api (workerd + D1 local) | 11 | 70 | Aprobada |
| **Total** | **22** | **147** | **Aprobada** |

`pnpm typecheck` (TypeScript 7) termina sin errores en los 4 paquetes.

## 2. Verificación manual contra el servidor local (`wrangler dev --local`, puerto 8787)
| Prueba | Resultado observado | Estado |
|---|---|---|
| Migraciones D1 locales 0001–0004 | Aplicadas | Aprobada |
| Simulador `backfill --minutes 90` (HMAC, gateway gw-sim-01) | 910 enviadas, 910 aceptadas, 0 rechazadas | Aprobada |
| Ingesta con firma falsa | HTTP 401 | Aprobada |
| Escenario sin sesión | HTTP 401 problem+json | Aprobada |
| Cabeceras de seguridad de la API | CSP `default-src 'none'`, nosniff, Referrer-Policy | Aprobada |
| `/live` repetido con ETag | HTTP 304 | Aprobada |
| Cadena escenario "aula-saturada" → bot de incidencias | 2 incidencias críticas en SPC_3_A301 (CO2 y sobreaforo), sin duplicados | Aprobada |
| Diagnóstico | `rules-fallback` rotulado "sin IA": no hay cuenta de Cloudflare ni Workers AI | Aprobada (respaldo) |
| Asistente `/ai/chat` | Respuesta determinista con cita SPC_3_A301 y acción `focus_spaces`; modo `fallback` | Aprobada (respaldo) |
| Telegram | `no-configurado`: falta el token del equipo | Bloqueada |
| UI de escritorio 1440 px | Centro de mando con KPIs reales, el aula crítica en rojo en el 3D, alertas activas, detalle de incidencia con diagnóstico | Aprobada |
| UI móvil 375 px | Sin scroll horizontal (`scrollWidth` = `clientWidth` = 375), barra inferior de pestañas | Aprobada |
| Vista de reloj `/watch` | 3 KPIs y la alerta más grave | Aprobada (solo navegador; reloj físico no probado) |
| Navegación SPA con desmontaje del gemelo | 0 errores de consola tras la corrección de portales de etiquetas | Aprobada |
| Imagen Docker del simulador | Construida (244 MB), usuario `node` (uid 1000), validación de variables obligatorias | Aprobada |
| Contenedor → API local | 27 aceptadas y 3 rechazadas por "escenario de demostración activo" (comportamiento esperado) | Aprobada |
| Bundle inicial de la web | ≈144 KB gzip de JS; el 3D (298 KB gzip) y las gráficas se cargan de forma diferida | Aprobada |

## 3. Defectos encontrados y corregidos durante la integración
1. Con el simulador en vivo activo, el escenario de demostración nunca cumplía la condición sostenida.
   - Solución: tabla `scenario_overrides`. El escenario mantiene su perfil 10 min y la ingesta ignora el simulador para ese dispositivo.
   - Cubierto por 3 pruebas de regresión.
2. Error `removeChild` de React al salir del gemelo 3D. Solución: las etiquetas `<Html>` de drei usan un contenedor DOM propio.
3. El chunk manual de gráficas arrastraba helpers al bundle inicial. Solución: se elimina el agrupado manual.
4. Frontend y API desalineados: rutas `/system/*`, `challenge_id` de passkeys, Content-Type en POST sin cuerpo y formato de reportes.
5. QA detectó dos fallos de prioridad media:
   - El proveedor `mock` podía rotularse como inferencia "en vivo". Ahora se muestra "IA simulada (mock)" y los diagnósticos guardados muestran modelo y fecha.
   - El deploy no configuraba WebAuthn para producción. Ahora usa la variable `PUBLIC_HOST`.

## 4. No ejecutado o bloqueado (depende del equipo)
- Llamada real a Workers AI (`gpt-oss-20b`): necesita la cuenta Cloudflare (D-22-03).
- Deploy público, migraciones remotas y medición de CPU con `wrangler tail`: necesitan la cuenta y el token.
- Registro e inicio de sesión completos con passkey en un dispositivo real: solo se probaron las opciones y los rechazos.
- Ejecución de GitHub Actions: el repositorio todavía no está publicado.
- Telegram y Galaxy Watch6: necesitan el token del bot.
- Pruebas en Galaxy S25 Ultra y Tab S7 FE; AR (Hito 2).
- Aspecto del gemelo reconocible como UTP Huancayo: faltan las fotos de referencia.
