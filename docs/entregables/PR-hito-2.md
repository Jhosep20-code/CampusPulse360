## Hito 2–5: despliegue público, IA real, gemelo de 10 pisos con modelo Blender, AR y correcciones

**Producción:** https://campuspulse.campuspulse-api.workers.dev (Cloudflare Workers Free)
- Versión desplegada `fdf7a207` (commit `3e99078`, modelo Blender v2).
- Respaldo inmediato `4852654b` (commit `9c453f6`). Para volver: `wrangler rollback 4852654b-796a-4af4-827d-febc1813084a`.
- Respaldo anterior `b23b261c` (commit `4bac699`).

> Esta PR no activa un despliegue nuevo por sí misma: el job `deploy` de CI solo se ejecuta en `main` y si la variable de repositorio `DEPLOY_ENABLED` vale `true`, que hoy está desactivada.

### Plataforma y nube (S/ 0.00)
- Cuenta Cloudflare propia del proyecto (`account_id` fijado y perfil `campuspulse` de wrangler aislado de otras cuentas).
- D1 `campuspulse-db` con migraciones 0001–0004, dos Cron Triggers y secretos cargados con `wrangler secret`.
- Simulador IoT en la nube, rotulado como telemetría simulada. Se detiene cuando llega un gateway real.
- IA real con Workers AI (`@cf/openai/gpt-oss-20b`): diagnóstico de incidencias y asistente verificados en producción. Límite de 250 llamadas al día; se midieron unas 20 neuronas por llamada.
- Cierre automático de incidencias que llevan 10 minutos normalizadas.

### Gemelo digital
- **Modelo real de Blender 5.3:** script reproducible `assets/3d/blender/build_utp_huancayo.py` y fuente `.blend`.
  - **v2:** escaleras abiertas en zigzag en el atrio, muro negro de ascensores con 3 puertas por nivel y juntas de panel. Son rasgos contrastados con videos oficiales; las medidas son estimadas.
  - Exporta GLB de escritorio (2,84 MB, 52.836 triángulos), móvil (1,24 MB) y entorno (89 KB).
  - Comparación v1/v2 en `docs/entregables/FINAL/capturas/blender/comparacion-v1-v2.png`.
  - Jerarquía `BUILDING / FACADE / ROOF / ATRIUM / STAIRS / ELEVATORS / FLOOR_P01–P10 / SPC_* / SENSOR_ANCHORS`.
- **Visor Three.js/R3F con el GLB:** aislar un piso oculta su grupo (`visible=false`, sin escalar matrices); la explosión desplaza cada grupo en Y. Si el GLB falla, el visor vuelve a la geometría procedural.
- **Corrección de las "losas negras":** las matrices degeneradas (escala 0 en un solo eje) producían normales NaN en el shader de instancing de three. Pruebas visuales WebGL: P6 bajó de 55,2 % a 0,7 % de píxeles negros y P9 de 39,0 % a 0,7 %.
- **Máquina de estados de la vista:** Fachada, Aérea, Atrio y Referencia, aislamiento, explosión, modo datos, noche y "Restablecer vista".
- **Vista Referencia:** comparación con una foto local que no sale del dispositivo.
- **Atrio:** corte de sección.
- **Encuadre:** el piso aislado tiene prioridad sobre el preset de cámara.
- **Pisos altos:** al aislar un piso, la cubierta se oculta (antes tapaba P10) y el contexto urbano solo conserva suelo y calles.
- Diez pisos y los 10 espacios instrumentados se conservan. P6–P10 se rotulan "sin espacios instrumentados".
- Aviso visible: "Modelo aproximado basado en fotografía · dimensiones estimadas · sin planos verificados".

### Otras funciones
- **AR:** WebXR, Scene Viewer y vista 3D. Se corrigió el error móvil "l is not a function": una limpieza de efecto inválida.
- Vista de reloj circular en `/reloj`.
- Mensajes de error aptos para producción y recarga automática ante fragmentos obsoletos tras un despliegue.
- Docker Compose para el modo sin conexión, y e2e con Playwright en CI.
- CI:
  - gitleaks sin falsos positivos;
  - nombre de la imagen GHCR en minúsculas;
  - pruebas visuales WebGL excluidas del CI por defecto (se ejecutan con `VISUAL=1`).

### Pruebas (local, 23-nov-2026)
- **Unitarias e integración:** 258 (contratos 9, simulador 10, web 162, API 77).
- **CI:** el job `deploy` ahora pasa `CLOUD_SIM:on`, igual que la producción actual. Sin ese cambio, un deploy desde `main` habría apagado el simulador en la nube.
- **e2e:** 15 aprobadas y 3 omitidas a propósito, contra el stack Docker con el GLB.
- **gitleaks:** sin hallazgos en todo el historial.
- **Validación con GPU e interacción real:** secuencias críticas de aislamiento, vistas y Restablecer superadas en local y en producción. Evidencias en `docs/evidencias/hito-5-losas-negras-y-blender.md` y `docs/entregables/FINAL/capturas/`.

### Pendiente (no se declara completado)
- Bloques visuales automáticos B3 y B4 (10 pisos × 5 vistas): bloqueados en WebGL por software; hay que ejecutarlos con GPU.
- Pruebas físicas: AR en Galaxy S25 Ultra, `/reloj` en Galaxy Watch6 Classic y fps en dispositivo.
- Fidelidad arquitectónica: los rasgos del atrio, las escaleras y los ascensores se contrastaron con videos oficiales, pero la distribución y las medidas siguen siendo estimadas, sin planos.
- Rendimiento: la vista explotada dibuja unas 458 draw calls y la Fachada 73 (meta: 60). Falta medir los fps en el S25.
- Unity/VR de la TA5: en la rama `feature/ta5-unity`, sin ejecutar.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
