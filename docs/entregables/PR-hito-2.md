## Hito 2–5: despliegue público, IA real, gemelo de 10 pisos con modelo Blender, AR y correcciones

**Producción:** https://campuspulse.campuspulse-api.workers.dev (Cloudflare Workers Free)
- Versión desplegada `207d3808` (commit `252de1f`: passkeys con vinculación, AR corregida y marca nocturna; migración D1 0005 aplicada).
- Respaldo inmediato `3d66c483` (commit `b760757`). Para volver: `wrangler rollback 3d66c483-bf84-4d5a-a3ab-72f2046f3883`.
- Respaldo anterior `4852654b` (commit `9c453f6`).
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
  - **v3, corrección arquitectónica** (matriz en `docs/referencias/matriz-correspondencia-v3.md`):
    - fachada con paño blanco a la izquierda, 7 franjas, marco y coronación grises y marca UTP simplificada;
    - atrio con bandas gris azulado, sin pilares de esquina e indicadores rojos;
    - escaleras en zigzag en el borde oeste, posición **inferida** de las referencias.
    - Las medidas siguen siendo estimadas.
  - Exporta GLB de escritorio (2,91 MB, 54.084 triángulos), móvil (1,28 MB), **AR** (1,10 MB, 29 mallas, maqueta 1:60) y entorno (89 KB).
  - Comparación v2/v3 en `docs/entregables/FINAL/capturas/blender/comparacion-v2-v3.jpg`.
  - Jerarquía `BUILDING / FACADE / ROOF / ATRIUM / STAIRS / ELEVATORS / FLOOR_P01–P10 / SPC_* / SENSOR_ANCHORS`.
- **Visor Three.js/R3F con el GLB:** aislar un piso oculta su grupo (`visible=false`, sin escalar matrices); la explosión desplaza cada grupo en Y. Si el GLB falla, el visor vuelve a la geometría procedural.
- **Corrección de las "losas negras":** las matrices degeneradas (escala 0 en un solo eje) producían normales NaN en el shader de instancing de three. Pruebas visuales WebGL: P6 bajó de 55,2 % a 0,7 % de píxeles negros y P9 de 39,0 % a 0,7 %.
- **Máquina de estados de la vista:** Fachada, Aérea, Atrio y Referencia, aislamiento, explosión, modo datos, noche y "Restablecer vista".
- **Vista Referencia:** comparación con una foto local que no sale del dispositivo.
- **Atrio:** corte de sección.
- **Encuadre:** el piso aislado tiene prioridad sobre el preset de cámara.
- **Pisos altos:** al aislar un piso, la cubierta se oculta (antes tapaba P10) y el contexto urbano solo conserva suelo y calles.
- **Rendimiento:** clases de fusión por color de vértice y elementos compartidos cortados por piso.

  | Vista | Antes (draw calls, GPU) | Ahora |
  |---|---|---|
  | Fachada | 73 | 43 (29 en móvil) |
  | Pisos explotados | 458 | 222 (141 en móvil) |
  | P10 aislado | 47 | 25 |
- **AR:** Scene Viewer y la AR web usan `utp-huancayo-ar.glb`, exportado por Blender. Se eliminó `campus-ar.glb`, que estaba huérfano.
- Diez pisos y los 10 espacios instrumentados se conservan. P6–P10 se rotulan "sin espacios instrumentados".
- Aviso visible: "Modelo aproximado basado en fotografía · dimensiones estimadas · sin planos verificados".

### Acceso, AR e identidad nocturna (23-nov)
- **Passkeys:**
  - vinculación de otro dispositivo con un código de un solo uso (10 min, guardado como hash, migración 0005) que añade la passkey a la misma cuenta;
  - mensajes que distinguen un login sin passkey de un fallo de registro;
  - pruebas de punta a punta con verificación WebAuthn real.
- **AR nivel A:** la colocación ocurre en el fotograma de animación (antes leía el hit-test en el fotograma del toque, que nunca trae resultados), con estados «buscando», «detectada» y «colocada». **Pendiente de prueba física en el S25.**
- **Noche:**
  - las letras de la marca UTP se encienden;
  - letrero «Universidad Tecnológica del Perú» en la banda sobre la planta baja (posición aproximada);
  - sin materiales nuevos.
- **IA confirmada en producción:** Workers AI `@cf/openai/gpt-oss-20b` (no la API de OpenAI). Detalle en `docs/entregables/FINAL/EXPLICACION_DEMO.md`.

### Demostración animada (23-nov, **solo local, sin desplegar**)
- **Escenarios configurables (admin, datos simulados):**
  - en cualquier espacio instrumentado;
  - tipos: CO₂, temperatura, sobreaforo, consumo eléctrico o sin conexión;
  - restauración por espacio;
  - migración 0006 aditiva con reglas de consumo.
- **Corrección:** los escenarios ya no escriben `last_seen`. Antes congelaban el simulador de todo el campus durante 2 min.
- **Panel «Demostración»:** pasos Sensor → API → reglas → bot → incidencia → IA → gemelo, derivados solo de la API. Avisa si el diagnóstico vino del respaldo por reglas.
- **Balizas:** muestran la causa y el valor; el estado sin conexión se ve en gris.
- **Recorrido guiado:** con pausa, reiniciar, salir y media velocidad. Se cancela al interactuar y respeta reduced-motion.
- Guion de 90 s en `docs/entregables/FINAL/DEMO_ANIMADA_90S.md`.

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
- **Unitarias e integración:** 293 (contratos 9, simulador 10, web 183, API 91).
- **CI:** el job `deploy` ahora pasa `CLOUD_SIM:on`, igual que la producción actual. Sin ese cambio, un deploy desde `main` habría apagado el simulador en la nube.
- **e2e:** 15 aprobadas y 3 omitidas a propósito, contra el stack Docker con el GLB.
- **gitleaks:** sin hallazgos en todo el historial.
- **Validación con GPU e interacción real:** secuencias críticas de aislamiento, vistas y Restablecer superadas en local y en producción. Evidencias en `docs/evidencias/hito-5-losas-negras-y-blender.md` y `docs/entregables/FINAL/capturas/`.

### Pendiente (no se declara completado)
- Bloques visuales automáticos B3 y B4 (10 pisos × 5 vistas): bloqueados en WebGL por software; hay que ejecutarlos con GPU.
- Pruebas físicas: AR en Galaxy S25 Ultra, `/reloj` en Galaxy Watch6 Classic y fps en dispositivo.
- Fidelidad arquitectónica: los rasgos del atrio, las escaleras y los ascensores se contrastaron con videos oficiales, pero la distribución y las medidas siguen siendo estimadas, sin planos.
- Rendimiento en dispositivo: la vista explotada sigue en 222 draw calls en escritorio, por encima de la meta de 60. Faltan los fps en el S25 y la prueba de Scene Viewer con el GLB de AR.
- Unity/VR de la TA5: en la rama `feature/ta5-unity`, sin ejecutar.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
