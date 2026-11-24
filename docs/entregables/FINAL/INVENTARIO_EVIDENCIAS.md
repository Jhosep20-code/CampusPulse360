# Inventario de evidencias y archivos de entrega (24-nov-2026)

**Reglas:**
- Cada evidencia es real y lleva su fecha. No se inventan capturas.
- Las capturas de producción tienen recortada la cabecera y tapado el nombre de la sesión, porque el repositorio es público.
- Los respaldos de D1 y los secretos **no** se publican.

## 1. Capturas existentes y qué demuestran
| Archivo (`capturas/…`) | Demuestra | Informe |
|---|---|---|
| `produccion/01-centro-de-mando-admin.jpg` | Dashboard en vivo (KPIs, SIMULADO), gemelo y panel Demostración (sesión de administrador) | §7.2 |
| `produccion/02-incidencias.jpg` | Incidencias abiertas por el bot en A301, A401, BIB y LOBBY, con severidad y estado | §9 |
| `produccion/03-incidencia-a401-diagnostico-ia.jpg` | Diagnóstico **en vivo** de `@cf/openai/gpt-oss-20b` (2.092 ms): causa, acciones, evidencia y línea de tiempo bot → IA | §6.4, §9 |
| `produccion/04-automatizaciones-reglas-bot.jpg` | 7 reglas activas y ejecuciones del bot cada minuto («reglas=7») y reportes diarios | §6.3 |
| `produccion/05-sistema-version-ia.jpg` | Commit `513ce1e` en producción, salud de D1 e IA, y consumo de IA (46/250 llamadas, 821/10.000 neuronas) | §6.4, §10 |
| `produccion/06-iot-telemetria.jpg` | 10 espacios con telemetría simulada en línea (CO₂, °C, ocupación, W) | §6.1 |
| `produccion/07-asistente-ia.jpg` | Asistente «En vivo · gpt-oss-20b» con ranking por aforo y CO₂, citas y «Ver en el gemelo» | §6.4 |
| `produccion/08-ar-niveles.jpg` | Página AR con los niveles A, B y C (en escritorio, sin WebXR) | §7.5 |
| `produccion/09-reloj.jpg` | Vista de reloj (simulada en el navegador) | §7.5 |
| `produccion/10-github-actions-ci.jpg` | CI en verde: gitleaks, tipos/pruebas/build, e2e Docker Compose + Playwright e imagen del simulador | §6.5 |
| `primera-persona/01…03` | Recorrido FPS: hall de P1, pasillo y atrio de P5, aula A201 | §7.4 |
| `demo-animada/00…05` | Estado normal → A401 en crítico → ventana roja y flujo completo → indicador del ascensor → móvil → hoja de contacto del video | §7.2–7.3 |
| `video/demo-animada-local.webm` | Grabación real de 55 s del lienzo (recorrido y anomalía) | §7.3 |
| `blender/*.png`, `blender/v1`, `blender/v2` | Renders y comparación con las referencias | §7.1 |
| `glb/*.jpg`, `pisos/*.png`, `gemelo-*.png` | Vistas del GLB: pisos P1–P10 en escritorio y móvil, atrio, noche y referencia | §7.2 |

**Registros escritos:**
- `docs/evidencias/hito-1 … hito-10`: salidas reales, mediciones, despliegues y rollbacks.
- `docs/decisiones/ADR-001…005`.

## 2. Evidencias que FALTAN (deben obtenerlas el equipo)
| Evidencia | Cómo obtenerla | Para |
|---|---|---|
| **AR en el Galaxy S25 Ultra** | Chrome → `/ar` → Nivel A sobre una superficie con textura. Captura o video con la maqueta colocada y un espacio tocado. Si falla, Nivel B (Scene Viewer). Anotar el resultado (funciona o falla) | PF criterio 6; TA5 criterios 6 y 8 |
| **Galaxy Watch6 Classic** | Si tiene navegador, abrir `/reloj` y fotografiar el reloj. Si no, declararlo «no probado» (no hay notificaciones: Telegram no está configurado) | PF criterio 6 |
| **Primera persona en el S25** | Botón «Primera persona» con la cruceta táctil; captura y FPS aproximados | TA5 criterio 3 |
| **Prueba del Hall a 31,2 °C** (regla crítica de temperatura) | Demostración → P1 Hall → Temperatura → Crítica. En Incidencias debe aparecer **una sola** incidencia crítica. Capturar y luego **Restaurar** | Coherencia (hito-10 §6 bis) |
| **Docker local** | `docker compose up` y captura de la terminal con los 3 contenedores sanos y la app en `localhost:8787` | PF criterio 4 |
| **Acceso con passkey** | Captura de la pantalla Acceso con la sesión iniciada; recortar el nombre si se publica | PF criterio 6 (seguridad) |
| **Video final (máx. 5:00)** | Seguir `GUION_DEMO_5MIN.md` | Entregable 3 |

## 3. Archivos de entrega (ZIP `PROFINAL_U5_GRUPO_#`)
| Entregable | Archivo | Estado |
|---|---|---|
| 1. Propuesta inicial | **[CONFIRMAR si ya se entregó]** | ⏳ |
| 2. Informe técnico | `INFORME_FINAL.docx` y `INFORME_FINAL.pdf` (generados desde `INFORME_FINAL.md`) | 🟡 faltan los datos académicos y las conclusiones |
| 3. Video (máx. 5 min) | `[GRUPO]_video_campuspulse360.mp4` | ⏳ por grabar |
| 4. Código y documentación | Enlace al repositorio y ZIP del código **sin** `node_modules`, `backups/`, `.dev.vars` ni `infra/*.local*` | Listo para empaquetar |
| 5. Presentación y sustentación | Guion y ensayo | ⏳ |

**TA5:** se entrega el mismo informe (§8 y §11.2), con la portada adaptada si el docente exige un documento separado.
