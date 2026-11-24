# Inventario de evidencias y archivos de entrega (24-nov-2026)

**Reglas:**
- Las evidencias son reales y están fechadas; no se inventan.
- Las capturas de producción tienen recortada la cabecera, porque mostraba el nombre de la sesión y el repositorio es público.
- Los respaldos de D1, los secretos y las fotografías privadas **no** se publican.

**Versión publicada:** commit `004eaa4`, Worker `9fca1ec7`. Las capturas fechadas antes de ese despliegue corresponden a versiones anteriores (`513ce1e` o previas) y así se indica.

**Rutas:** relativas a `docs/entregables/FINAL/capturas/`.

## 1. Evidencias sobre la versión publicada (`004eaa4`, 24-nov)
| Qué se demuestra | Archivo | Estado |
|---|---|---|
| Centro de mando con telemetría simulada y gemelo | `produccion-final/01-centro-de-mando.jpg` | ✅ |
| Commit desplegado, salud de servicios y consumo de IA | `produccion-final/02-sistema-commit-004eaa4.jpg` | ✅ |
| Asistente con respuestas «En vivo» contrastadas con `/live` | `produccion-final/03-asistente.jpg` | ✅ |
| Vista del atrio | `produccion-final/04-atrio.png` | ✅ |
| Fachada en modo noche | `produccion-final/05-fachada-noche.png` | ✅ |
| Recorrido en primera persona en producción | `produccion-final/06-primera-persona.png` | ✅ |

## 2. Evidencias anteriores, por tema
| # | Qué se demuestra | Archivo | Fecha y entorno | Estado |
|---|---|---|---|---|
| 1 | Telemetría de los 10 espacios | `produccion/01-centro-de-mando-admin.jpg`, `produccion/06-iot-telemetria.jpg` | 24-nov, producción `513ce1e` | ✅ |
| 2 | Escenarios críticos y cambios localizados del gemelo | `produccion/11-tres-anomalias-gemelo-localizado.jpg`, `demo-animada/01-…`, `demo-animada/02-…` | 24-nov producción `513ce1e`; 23/24-nov local | ✅ |
| 3 | Automatización e incidencias generadas | `produccion/12-incidencias-escenarios-24nov.jpg`, `produccion/04-automatizaciones-reglas-bot.jpg` | 24-nov, producción `513ce1e` | ✅ |
| 4 | Diagnóstico real con Workers AI | `produccion/13-hall-temp-critica-diagnostico-ia.jpg` (3.971 ms), `produccion/03-incidencia-a401-diagnostico-ia.jpg` (2.092 ms) | 24-nov, producción | ✅ |
| 4b | Respaldo por reglas rotulado «sin IA» | `produccion/14-lab1-consumo-respaldo-sin-ia.jpg` | 24-nov, producción | ✅ |
| 5 | Asistente con respuesta verificada | `produccion/07-asistente-ia.jpg` + registros hito-9 y hito-10 | 24-nov, producción | ✅ |
| 6 | Primera persona: colisiones, pisos y cruceta móvil | `primera-persona/01…06`, `demo-animada/03-…`, `demo-animada/04-…` | 24-nov, **local** (móvil emulado) | ✅ |
| 7a | Reloj en el Galaxy Watch6 Classic | `dispositivos/watch6-reloj-campus-normal-2026-11-23.png`, `dispositivos/watch6-reloj-co2-medio-2026-11-23.png` | 23-nov, producción `207d3808` (versión **anterior**) | 🟡 repetir sobre `004eaa4` |
| 7b | AR en el Galaxy S25 Ultra | **Sin captura archivada** | Pruebas físicas anteriores reportadas por el equipo | ⏳ capturar sobre `004eaa4` |
| 7c | Página AR con 3 niveles y reloj en navegador de escritorio | `produccion/08-ar-niveles.jpg`, `produccion/09-reloj.jpg` | 24-nov, producción `513ce1e` | ✅ (no sustituye la prueba física) |
| 8 | GitHub Actions en verde | `produccion/10-github-actions-ci.jpg` | 24-nov | ✅ |
| 9 | Docker Compose funcionando | `produccion/15-docker-compose-local.png` | 24-nov, local | ✅ |
| 10 | Acceso con passkeys | Registro escrito: 401/403 en producción (informe §9) y alta local con autenticador virtual (hito-11) | 24-nov | 🟡 falta captura de la pantalla Acceso (recortar el nombre) |
| — | Arquitectura y flujo | `diagramas/arquitectura.png`, `diagramas/flujo-datos.png` (fuentes `.svg`) | 24-nov | ✅ |
| — | Modelo de Blender | `blender/*.png`, `glb/*.jpg`, `pisos/*.png` | 22–23-nov | ✅ |

**Registros escritos:**
- `docs/evidencias/hito-1 … hito-11` (hito-11: despliegue de `004eaa4`, respaldo, rollback, validación y Docker sin internet);
- `docs/decisiones/ADR-001…005`.

## 3. Pendiente de obtener (equipo)
1. **AR en el S25 Ultra** sobre la versión publicada: capturar `/ar` en nivel A, o en nivel B si falla.
2. **Watch6 Classic:** repetir `/reloj` sobre la versión publicada.
3. **Primera persona en un teléfono físico** (solo probada con emulación).
4. **Captura de Acceso con la sesión iniciada:** recortar el nombre antes de publicarla.
5. **Video:** no grabado; ver `GUION_DEMO_5MIN.md`.

## 4. Archivos de entrega
La carpeta `entrega/` está ignorada por git y contiene el ZIP `PROFINAL_U5_GRUPO_N.zip` (guía interna: `LEEME.txt`):

| Entregable | Contenido | Estado |
|---|---|---|
| 1. Propuesta inicial | **No hay evidencia en el proyecto de que se haya entregado** | ⏳ confirmar o adjuntar |
| 2. Informe técnico | `INFORME_FINAL.docx` y `INFORME_FINAL.pdf` (26 páginas, mismo contenido que el `.md`) | 🟡 completar los datos académicos |
| 3. Video (máx. 5 min) | Guion, plan de montaje y placas de título | ⏳ **no grabado** |
| 4. Código y documentación | `codigo-fuente-<commit>.zip` (git archive) y enlace al repositorio | ✅ |
| 5. Presentación y sustentación | `PRESENTACION_FINAL.pptx` (10 diapositivas, 5 por integrante, notas) y defensa de la TA5 (informe §8.5) | 🟡 completar nombres y ensayar |
