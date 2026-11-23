## Hito 2: despliegue público, gemelo de 10 pisos, AR, modo offline y correcciones

**Producción:** https://campuspulse.campuspulse-api.workers.dev (Cloudflare Workers Free, commit `4bac699`)

### Cambios principales
- Despliegue en Cloudflare Free (cuenta propia de CampusPulse, `account_id` fijado), D1 `campuspulse-db`, Cron, secretos y simulador en la nube rotulado como telemetría simulada.
- IA real con Workers AI (`gpt-oss-20b`): diagnóstico de incidencias y asistente verificados en producción.
- Gemelo digital de 10 pisos: fachada, vista Referencia con comparación de foto local, atrio en corte, balizas de estado y modo día/noche.
- AR: WebXR, Scene Viewer y vista 3D; GLB sincronizado con el gemelo.
- Corrección crítica del error móvil "l is not a function" (limpieza de efecto inválida en la AR), con pruebas de regresión.
- Cierre automático de incidencias normalizadas.
- Vista de reloj circular `/reloj` (Galaxy Watch6 Classic, vista previa).
- Docker Compose (modo offline) y e2e con Playwright en CI.
- CI: gitleaks sin falsos positivos y nombre de imagen GHCR en minúsculas.

### Pruebas
- 231 pruebas unitarias y de integración, 15 e2e y gitleaks limpio.
- Evidencias en `docs/evidencias/`.

### Pendiente de pruebas físicas
- AR en Galaxy S25 Ultra y `/reloj` en Galaxy Watch6 Classic.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
