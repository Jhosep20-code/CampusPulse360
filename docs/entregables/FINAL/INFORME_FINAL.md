# CampusPulse 360: Diseño e Implementación de un Gemelo Digital Inteligente para la Gestión Predictiva y Automatización de Campus Universitarios mediante IoT, Inteligencia Artificial, Realidad Aumentada y DevOps

**Curso:** [completar] · **Grupo:** [completar] · **Integrantes:** [completar]
**Demo pública:** https://campuspulse.campuspulse-api.workers.dev · **Repositorio:** https://github.com/Jhosep20-code/CampusPulse360 (rama `feature/hito-2`)

> Estado al 23-nov-2026. Las cifras proceden de ejecuciones reales registradas en `docs/evidencias/`. La telemetría es **simulada** y el modelo 3D es **aproximado** (sin planos verificados).

## 1. Introducción y planteamiento del problema
La gestión de un campus universitario suele ser reactiva:
- las incidencias ambientales (CO₂, temperatura) y de aforo se detectan tarde;
- no hay una vista unificada del estado de cada espacio;
- no se anticipan saturaciones ni deterioros del aire en las aulas.

CampusPulse 360 propone un gemelo digital de la sede UTP Huancayo que integra datos de sensores (simulados), reglas automáticas, IA generativa y visualización 3D/AR para detectar, diagnosticar y comunicar estas situaciones en tiempo casi real.

## 2. Objetivos
**General:** implementar y desplegar públicamente un gemelo digital de la UTP Huancayo que monitoree, prediga y automatice la respuesta a incidencias.

| Objetivo específico | Meta | Resultado medido |
|---|---|---|
| OE1 IoT | ≥10 dispositivos simulados × 5 variables | 10 dispositivos × 5 variables. Ingesta HMAC verificada en producción (910 lecturas aceptadas en un backfill) y simulador en la nube cada minuto |
| OE2 RPA | Incidencia automática y diagnóstico tras un umbral sostenido | Verificado en producción: lecturas firmadas → cron → 2 incidencias críticas → diagnóstico IA en vivo (1,8 s y 2,4 s). Cierre automático tras 10 min normalizados (verificado: "cerradas=2") |
| OE3 IA | Respuestas útiles basadas en datos | gpt-oss-20b en Workers AI responde con citas a espacios reales (2,7 s). Unas 20 neuronas por llamada |
| OE4 DevOps | Pruebas y despliegue automatizados | 257 pruebas unitarias e integración y 15 e2e en local. Pipeline en GitHub Actions definido (ver §5.7; **su ejecución sobre la rama está pendiente de la PR**) |
| OE5 Experiencia | 3D fluido, multidispositivo y AR | Gemelo con el GLB de Blender: 61 draw calls medidos con GPU. Vista móvil verificada en navegador. **AR en dispositivo físico pendiente** |
| OE6 Predicción | Pronóstico de CO₂ a 30 min | Holt con backtest MAE sobre datos simulados (pruebas unitarias) |

## 3. Tecnologías seleccionadas y justificación
| Capa | Tecnología | Justificación |
|---|---|---|
| Frontend | React 19, TypeScript 7, Tailwind 4, Vite 8 | SPA responsive y tipada |
| 3D | Three.js / React Three Fiber + modelo de **Blender 5.3** (GLB) | La arquitectura se modela en Blender (editable y reproducible por script). Three.js solo visualiza, interactúa y vincula datos |
| API | Hono en Cloudflare Workers | Coste S/ 0.00 (plan Free) y despliegue en el borde |
| Datos | Cloudflare D1 (SQLite) | Plan Free: 100k escrituras/día, con uso estimado de alrededor del 35–40 % |
| IA | Workers AI `@cf/openai/gpt-oss-20b` | Plan Free con 10k neuronas/día. **No es la API oficial de OpenAI**: es un modelo de pesos abiertos de OpenAI servido por Cloudflare (ADR-002). Hay un adaptador para la API oficial que solo se activa con una clave propia |
| RPA | Cron Triggers (bot de incidencias y de reportes) y Telegram (opcional) | Automatización sin servidores propios |
| Contenedores | Docker (simulador, stack local sin conexión con Compose) | Reproducibilidad y modo de contingencia |
| CI/CD | GitHub Actions: gitleaks, tipos, pruebas, e2e con Docker Compose y Playwright, imagen en GHCR, deploy condicionado | Automatización de pruebas y despliegue |

## 4. Arquitectura de la solución
```
Simulador IoT (Docker / nube) --HMAC--> Worker Hono /api/v1 --> D1
                                         |-- Cron 1/min: reglas -> incidencias -> IA -> Telegram
                                         |-- Cron diario: rollups + reporte
                                         |-- Workers AI (gpt-oss-20b) / respaldo por reglas
                                         '-- Static Assets: SPA + GLB (Blender)
Clientes: escritorio, móvil (Galaxy S25 Ultra), reloj (/reloj), AR (/ar)
CI/CD: GitHub Actions -> pruebas -> imagen GHCR -> deploy (desactivado por defecto)
```
Decisiones registradas en `docs/decisiones/ADR-001..004`.

## 5. Desarrollo de componentes
### 5.1 IoT
- Simulador con perfiles por tipo de espacio y hora de Lima.
- Ingesta firmada con HMAC-SHA256 por gateway, con ventana anti-replay de ±60 s.
- Protocolo compatible con sensores físicos, que **no se han probado**.
- En producción, un simulador en la nube mantiene la demo viva y se detiene cuando llega un gateway real.

### 5.2 RPA
- Bot de incidencias en el cron de cada minuto:
  - detección en SQL con condición sostenida y deduplicación;
  - diagnóstico IA (uno por tick);
  - notificación;
  - cierre automático.
- Bot de reportes diario.
- Escenarios de demostración que mantienen su perfil durante 10 min.

### 5.3 IA generativa y prompt engineering
- **Diagnóstico:**
  - prompt de rol con contexto de lecturas reales y few-shot;
  - salida JSON validada con zod y un reintento;
  - respaldo determinista rotulado "sin IA".
- **Asistente:** herramientas de solo lectura (nunca SQL libre), citas validadas y acción `focus_spaces` que mueve la cámara 3D.
- **Cuota:** límite de 250 llamadas/día y contador visible en "Sistema".

### 5.4 Gemelo digital 3D
- **Modelo de Blender reproducible:** `assets/3d/blender/build_utp_huancayo.py`.
  - Jerarquía `BUILDING / FACADE / ROOF / ATRIUM / STAIRS / ELEVATORS / FLOOR_P01–P10 / SPC_* / SENSOR_ANCHORS`.
  - GLB de escritorio y móvil.
- **10 pisos** (dato del equipo); los 10 espacios instrumentados están en P1–P5, y P6–P10 se rotulan "sin espacios instrumentados".
- **Vistas:** Fachada, Aérea, Atrio (corte), Referencia (comparación con una foto local que no sale del dispositivo), aislar P1–P10, pisos explotados, modo datos, día/noche y Restablecer vista, gobernadas por una máquina de estados.
- **Defecto corregido "losas negras":** las matrices de instancia degeneradas (escala 0 en un eje) producían normales NaN en el shader de three. La prueba visual pasó de 55,2 % a 0,7 % de píxeles negros.
- **Fidelidad:** los rasgos del atrio, las escaleras y los ascensores se contrastaron con videos oficiales (`docs/referencias/especificacion-3d.md` §9). Las dimensiones siguen siendo estimadas.

### 5.5 Realidad aumentada y realidad virtual
- **AR web** (`/ar`), en tres niveles:
  - A: WebXR con datos en vivo;
  - B: Scene Viewer con el GLB móvil;
  - C: vista 3D, que no es AR.
- Se corrigió un fallo móvil crítico ("l is not a function"). **La prueba en un dispositivo físico está pendiente.**
- **VR:** ver el informe de la TA5. El módulo Unity **no se ha ejecutado**.

### 5.6 Interfaz multidispositivo
Centro de mando, incidencias, asistente, IoT, automatizaciones, sistema, acceso por passkeys (sin contraseñas ni registro público) y vista de reloj circular `/reloj`. Responsive de 360 a 1920 px.

### 5.7 CI/CD y Docker
- **Workflow `.github/workflows/ci.yml`:** gitleaks, typecheck, pruebas, build, e2e (Docker Compose + Playwright), imagen del simulador en GHCR y deploy a Cloudflare condicionado a la variable `DEPLOY_ENABLED`.
- **Estado:** la única ejecución en GitHub (sobre `main@6dd17a4`) pasó tipos, pruebas y build, y falló en gitleaks (falso positivo) y en Docker (nombre en mayúsculas). Ambos fallos están corregidos en la rama; **la verificación en GitHub queda pendiente de la PR**.

### 5.8 Seguridad y privacidad
- Passkeys con token de arranque de un solo uso y sesiones hasheadas.
- Roles, defensa CSRF, rate limit en D1, HMAC en la ingesta, CSP/HSTS y auditoría.
- gitleaks sin hallazgos.
- No se publican fotografías privadas.
- Solo datos agregados, sin datos personales.

## 6. Resultados esperados y reales
Ver la tabla de §2 y `docs/evidencias/hito-1.md` … `hito-5-losas-negras-y-blender.md`. Todas las mediciones de IA, ingesta y renderizado son reales; la telemetría es simulada.

## 7. Capturas y enlaces al demo
- `docs/entregables/FINAL/capturas/`: gemelo, pisos aislados, atrio, Referencia y renders de Blender (v1 y v2).
- Demo: https://campuspulse.campuspulse-api.workers.dev

## 8. Análisis de impacto
- Detección automática de condiciones de riesgo (CO₂, aforo) en menos de 2 minutos desde la lectura, con diagnóstico explicable y acciones sugeridas.
- Visión unificada del campus por piso y espacio.
- Coste de operación S/ 0.00 en planes gratuitos.
- Con sensores reales, la misma arquitectura recibiría sus datos sin cambios en el protocolo.

## 9. Limitaciones y trabajo futuro
- La telemetría es simulada; no hay sensores físicos.
- No se usa la API oficial de OpenAI (ADR-002).
- La arquitectura interior es aproximada: no hay planos y la distribución de aulas no está verificada.
- Pendientes:
  - pruebas físicas de AR (S25 Ultra) y del reloj (Watch6);
  - bloques visuales automáticos de 10 pisos × 5 vistas en un entorno con GPU;
  - ejecución del CI sobre la rama;
  - TA5 Unity.

## 10. Conclusiones
[Completar tras la sustentación con los resultados observados en la feria.]
