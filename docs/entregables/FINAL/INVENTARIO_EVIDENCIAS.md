# Inventario de evidencias y archivos de entrega (24-nov-2026)

**Reglas:**
- Las evidencias son reales y están fechadas; no se inventan.
- Las capturas de producción tienen recortada la cabecera, porque mostraba el nombre de la sesión y el repositorio es público.
- Los respaldos de D1, los secretos y las fotografías privadas **no** se publican.

**Rutas:** relativas a `docs/entregables/FINAL/capturas/`.

## 1. Evidencias por prioridad
| # | Qué se demuestra | Archivo | Fecha y entorno | Estado |
|---|---|---|---|---|
| 1 | Centro de mando con telemetría simulada | `produccion/01-centro-de-mando-admin.jpg`, `produccion/06-iot-telemetria.jpg` | 24-nov, producción | ✅ |
| 2 | Escenario crítico y cambios del gemelo (localizados) | `produccion/11-tres-anomalias-gemelo-localizado.jpg`, `demo-animada/01-…`, `demo-animada/02-…` | 24-nov producción; 23/24-nov local | ✅ |
| 3 | Automatización e incidencia generada | `produccion/12-incidencias-escenarios-24nov.jpg`, `produccion/04-automatizaciones-reglas-bot.jpg` | 24-nov, producción | ✅ |
| 4 | Diagnóstico real con Workers AI | `produccion/13-hall-temp-critica-diagnostico-ia.jpg` (3.971 ms), `produccion/03-incidencia-a401-diagnostico-ia.jpg` (2.092 ms) | 24-nov, producción | ✅ |
| 4b | Respaldo por reglas rotulado «sin IA» (honestidad del fallback) | `produccion/14-lab1-consumo-respaldo-sin-ia.jpg` | 24-nov, producción | ✅ |
| 5 | Asistente con respuesta verificada | `produccion/07-asistente-ia.jpg` + registros de hito-9 y hito-10 | 24-nov, producción | ✅ |
| 6 | Recorrido 3D y primera persona | `primera-persona/01…06` (incluye la cruceta móvil), `demo-animada/03-…`, `video/demo-animada-local.webm` (55 s) | 24-nov, local | ✅ (la primera persona **no** está en producción) |
| 7a | Reloj en el Galaxy Watch6 Classic | `dispositivos/watch6-reloj-campus-normal-2026-11-23.png`, `dispositivos/watch6-reloj-co2-medio-2026-11-23.png` | 23-nov 19:52, producción `207d3808`. El código del reloj no ha cambiado desde entonces | ✅ prueba física anterior |
| 7b | AR en el Galaxy S25 Ultra | — (no se encontraron capturas en el proyecto ni en la galería sincronizada) | — | ⏳ **capturar con la versión final** |
| 7c | Página AR con 3 niveles y reloj en navegador | `produccion/08-ar-niveles.jpg`, `produccion/09-reloj.jpg` | 24-nov, producción | ✅ |
| 8 | GitHub Actions en verde | `produccion/10-github-actions-ci.jpg` | 24-nov | ✅ |
| 9 | Docker Compose funcionando | `produccion/15-docker-compose-local.png` (salida real de `docker compose ps` y health) | 24-nov, local | ✅ |
| 10 | Acceso seguro con passkeys | Registro escrito: 401/403 en producción (informe §9), sesión de administrador válida usada para los escenarios | 24-nov | 🟡 falta una captura de la pantalla Acceso (recortar el nombre) |
| — | Arquitectura y flujo | `diagramas/arquitectura.png`, `diagramas/flujo-datos.png` (fuentes `.svg`) | 24-nov | ✅ |
| — | Modelo de Blender | `blender/*.png`, `glb/*.jpg`, `pisos/*.png` | 22–23-nov | ✅ |

**Registros escritos:**
- `docs/evidencias/hito-1 … hito-10` (el hito-10 incluye el despliegue, la migración 0007 y los escenarios);
- `docs/decisiones/ADR-001…005`.

## 2. Pendiente de obtener (equipo)
1. **AR en el S25 Ultra:** grabar `/ar` en nivel A, o en nivel B si falla, con la versión final.
2. **Captura de Acceso con la sesión iniciada:** recortar el nombre antes de publicarla.
3. **Clips del video:** ver `GUION_DEMO_5MIN.md` §5.

## 3. Archivos de entrega
La carpeta `entrega/` del repositorio está ignorada por git y contiene el ZIP `PROFINAL_U5_GRUPO_[N].zip` con:

| Entregable | Contenido | Estado |
|---|---|---|
| 1. Propuesta inicial | **No hay evidencia en el proyecto de que se haya entregado** | ⏳ confirmar o adjuntar |
| 2. Informe técnico | `INFORME_FINAL.docx` y `INFORME_FINAL.pdf` (25 páginas, mismo contenido que el `.md`) | 🟡 completar los datos académicos |
| 3. Video (máx. 5 min) | Guion, plan de montaje y placas de título | ⏳ **no grabado** |
| 4. Código y documentación | `codigo-fuente.zip` (git archive del commit indicado en `LEEME.txt`), enlace al repositorio, `docs/` | ✅ |
| 5. Presentación y sustentación | Guion para 2 integrantes y defensa de la TA5 (informe §8.5) | ⏳ ensayo |
