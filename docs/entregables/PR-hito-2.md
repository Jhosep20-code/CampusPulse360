## CampusPulse 360: gemelo digital de la UTP Huancayo (Proyecto Final + TA5 web)

**Producción:** https://campuspulse.campuspulse-api.workers.dev (Cloudflare Workers, plan Free, S/ 0,00)
- **Desplegado:** commit `004eaa4` (24-nov-2026), Worker `182f079c-19ee-49c6-83ed-f566a57515dc` desde el 25-nov, tras rotar la clave del gateway (mismo código y variables).
- **Rollback:** Worker `d9180962-e65a-4c90-b693-3dd8000693fc` (commit `513ce1e`). Después hay que verificar la clave del gateway y volver a rotarla.
- Los commits posteriores a `004eaa4` son documentación, la presentación, evidencias y una utilidad local (`infra/generar-env-local.mjs`), limpieza de metadatos y un límite de tiempo mayor (8 min) en la prueba e2e móvil de navegación. **No se volvió a desplegar.**

> Esta PR no se fusiona ni activa despliegues: el job `deploy` solo corre en `main` con `DEPLOY_ENABLED=true`, que está desactivada.

### Qué incluye
- **IoT (simulado):** simulador Docker con ingesta firmada HMAC; en la demo pública, un simulador en la nube escribe directo en D1.
- **RPA:** bot cada minuto con 7 reglas, deduplicación, diagnóstico y cierre automático; reporte diario.
- **IA:** `@cf/openai/gpt-oss-20b` en Workers AI (no es la API oficial de OpenAI); rankings calculados en el backend, validación de fidelidad acotada y respaldo por reglas rotulado «sin IA».
- **Gemelo e inmersión:** modelo de Blender (10 pisos, aproximado), Three.js/R3F, recorrido guiado, primera persona con colisiones, AR (WebXR y Scene Viewer) y vista de reloj.
- **CI/CD y Docker:** gitleaks, tipos, pruebas, build, e2e con Compose e imagen del simulador (no publicada en GHCR). Modo sin internet.
- **Entregables:** informe (MD/DOCX/PDF), presentación de 10 diapositivas, `LEEME.txt`, inventario y evidencias (`docs/evidencias/hito-11`).

### Pruebas (24-nov-2026)
- 350 unitarias y de integración aprobadas.
- e2e con Docker Compose: 15 aprobadas, 0 fallidas, 3 omitidas a propósito.
- Producción: validación de vistas, recorrido, primera persona, asistente, AR/reloj en escritorio y autorización (401/403).
- Local: Docker sin salida a internet y alta de administrador con autenticador virtual.

### Pendiente (no se declara completado)
- Video: no grabado.
- AR en el Galaxy S25 Ultra, reloj en el Watch6 y primera persona en teléfono físico sobre la versión publicada.
- Datos académicos y confirmación del docente (grupo de 2, Workers AI, TA5 en web).
- Ocupación 100–109 %: el gemelo marca advertencia mientras la incidencia es crítica.
- Telegram no configurado. Sin Unity, OpenXR ni VR con visor.

Detalle: `docs/entregables/FINAL/PENDIENTES_EQUIPO.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
