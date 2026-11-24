**UNIVERSIDAD TECNOLÓGICA DEL PERÚ**

Sede Huancayo · [COMPLETAR: facultad o carrera]

# CampusPulse 360

## Gemelo digital inteligente de la UTP Huancayo con IoT simulado, automatización RPA, IA generativa, DevOps y experiencia inmersiva web

**Informe técnico — Proyecto Final (Unidad 5) y Tarea Académica N.° 5**

| Dato | Valor |
|---|---|
| Curso y sección | **[COMPLETAR]** |
| Docente | **[COMPLETAR]** |
| Número de grupo | **[COMPLETAR]** |
| Integrante 1 | **[COMPLETAR: apellidos, nombres y código]** — backend, IoT, RPA, IA y DevOps |
| Integrante 2 | **[COMPLETAR: apellidos, nombres y código]** — gemelo 3D, interfaz, inmersión y documentación |
| Conformación | 2 integrantes. La consigna pide de 3 a 5: **excepción pendiente de confirmación del docente** |
| Demo pública | https://campuspulse.campuspulse-api.workers.dev |
| Repositorio | https://github.com/Jhosep20-code/CampusPulse360 (rama `feature/hito-2`, PR #1) |

**Huancayo, Perú · 27 de noviembre de 2026**

---

## Resumen ejecutivo
> **Alcance de este documento:** los sensores son **simulados** (no hay hardware); el modelo 3D es **aproximado**, estimado con fotografías y sin planos; la IA es el modelo **`@cf/openai/gpt-oss-20b` de OpenAI ejecutado mediante Cloudflare Workers AI, no mediante la API oficial de OpenAI**; la TA5 se resuelve con una alternativa **web** (no hay proyecto Unity). Las cifras proceden de ejecuciones registradas en `docs/evidencias/` y lo pendiente se declara como tal.

CampusPulse 360 es un gemelo digital de la sede UTP Huancayo, desplegado públicamente en Cloudflare con **costo adicional S/ 0,00**.

Cadena de funcionamiento:
1. Diez dispositivos **simulados** generan CO₂, temperatura, humedad, ocupación y consumo eléctrico.
2. Las lecturas llegan a D1 por dos caminos: el **simulador en Docker** las envía a la API con firma **HMAC**; en producción, el **simulador en la nube** (parte del propio Worker) **escribe directamente en D1**, sin pasar por la API ni usar HMAC.
3. Un **bot RPA** se ejecuta cada minuto, evalúa **7 reglas sostenidas**, abre una única incidencia por condición y solicita un **diagnóstico con IA** (gpt-oss-20b en Workers AI). Si la IA falla, usa un respaldo por reglas rotulado «sin IA».
4. El **gemelo 3D de 10 pisos** (modelo de Blender 5.3 visualizado con Three.js) colorea el espacio afectado, muestra una baliza con el valor, ilumina su ventana en la fachada y enfoca la cámara.

Funciones adicionales:
- un **asistente conversacional** cuyos rankings y porcentajes calcula el backend;
- **AR WebXR**;
- un **recorrido cinematográfico guiado**;
- una **vista de reloj**;
- **acceso con passkeys**;
- **CI/CD** con GitHub Actions y Docker.

Para la TA5 se añadió un **recorrido en primera persona** con colisiones sobre el mismo modelo.

**Resultados verificados el 24-nov-2026:**

| Ámbito | Resultado |
|---|---|
| Versión publicada | Worker `9fca1ec7`, commit `004eaa4`; vistas, recorrido, primera persona y asistente verificados tras desplegar |
| Escenarios en producción | 4 escenarios controlados abrieron la incidencia **crítica** esperada (CO₂ en A401; temperatura en el Hall; sobreaforo en el Auditorio; consumo en LAB1) |
| Diagnósticos | **3 inferencias reales** de gpt-oss-20b (1,7–4,0 s) y **1 respaldo determinista por reglas**, rotulado «sin IA» |
| Pruebas automáticas | **350** unitarias y de integración y **15** e2e en Docker (3 omitidas a propósito); CI en verde en `004eaa4` |
| Primera persona | **120 FPS** en producción (navegador visible, laptop con GPU) |

**Pendiente:** validar y capturar la AR en el Galaxy S25 Ultra con la versión final; grabar el video; completar los datos académicos; y confirmar con el docente el grupo de 2, el proveedor de IA y la TA5 en web.

---

## 1. Problema y justificación
La gestión de las condiciones de un campus universitario suele ser **reactiva y fragmentada**:
1. Las anomalías de calidad del aire (CO₂), temperatura, aforo y consumo eléctrico se detectan tarde y se reportan manualmente.
2. No existe una vista unificada del estado de cada aula y cada piso.
3. Quien decide no puede preguntar «¿qué está pasando?» y obtener una respuesta respaldada por datos.

**Justificación:**
- La ventilación y el aforo de las aulas son criterios de salud y de calidad del servicio educativo.
- Los gemelos digitales, el IoT y la IA generativa ya son accesibles con planes gratuitos en la nube.
- Un prototipo integrado demuestra cómo detectar, explicar y comunicar estas situaciones en minutos y sin infraestructura propia.

> **[COMPLETAR, opcional]:** dato institucional con su fuente (número de aulas o aforo de la sede). No se incluyen estadísticas sin fuente verificable.

![Respuesta propuesta: Centro de mando en producción, con telemetría simulada y el gemelo digital (004eaa4)](capturas/produccion-final/01-centro-de-mando.jpg)

## 2. Objetivos
**Objetivo general:** diseñar, implementar y desplegar un gemelo digital de la UTP Huancayo que monitoree el estado de los espacios, automatice la detección y el diagnóstico de incidencias y permita explorar el edificio en 3D, en AR y en primera persona.

| Objetivo específico | Indicador | Resultado real (evidencia) |
|---|---|---|
| **OE1 IoT:** recibir y visualizar telemetría | 10 dispositivos × 5 variables, cada minuto | **Logrado:**<br>• 10 × 5 en producción;<br>• ingesta HMAC desde el simulador Docker: 910/910 aceptadas (22-nov);<br>• en producción, el simulador en la nube escribe en D1 cada minuto<br>(hito-3) |
| **OE2 RPA:** gestionar incidencias sin intervención | Una incidencia por condición sostenida; cierre automático | **Logrado:**<br>• bot cada minuto en `success`;<br>• 7 reglas;<br>• deduplicación;<br>• cierre tras 10 min normalizados;<br>• incidencias en A301, A401, BIB, LOBBY, LAB1 y AUD<br>(hito-3, hito-10; §10) |
| **OE3 IA:** diagnóstico y respuestas útiles con datos reales | JSON válido con causa, acciones y evidencia; rankings correctos | **Logrado:**<br>• 4 inferencias reales verificadas (A401, LOBBY y AUD el 24-nov; A301 el 22-nov);<br>• asistente contrastado con `/live` en 22 preguntas (alcance en §6.4)<br>(hito-9, hito-10) |
| **OE4 DevOps:** probar y construir automáticamente | Pipeline con pruebas, e2e en Docker y secretos | **Logrado:** GitHub Actions en verde (gitleaks, tipos, pruebas, build, e2e con Docker Compose + Playwright, imagen del simulador) |
| **OE5 Experiencia:** 3D fluido, multidispositivo e inmersivo | ≥ 30 FPS en escritorio; móvil; AR | **Parcial:**<br>• 119–120 FPS en producción (escritorio con GPU);<br>• vista móvil verificada con emulación;<br>• **AR: pruebas físicas anteriores reportadas, sin captura archivada; falta validar la versión final** (§7.5) |
| **OE6 Predicción:** pronóstico a 30 min | Error medido | **Logrado en pruebas:** Holt con backtest MAE sobre datos simulados |

## 3. Alcance y metodología
**Incluido:**
- **Edificio:** 10 pisos, con 10 espacios instrumentados en P1–P5:
  - P1: hall y biblioteca;
  - P2: aulas A201 y A202;
  - P3: aula A301 y laboratorio de cómputo;
  - P4: aula A401 y laboratorio de IoT;
  - P5: auditorio y oficinas.
- **Pisos P6–P10:** modelados y rotulados «sin espacios instrumentados».
- **Lógica:** 7 reglas, bot RPA, asistente de IA de solo lectura y escenarios de demostración.
- **Experiencia:** tres niveles de AR, vista de reloj y recorridos guiado y en primera persona.

**Excluido:** sensores físicos, planos oficiales, VR con visor, Unity y la API oficial de OpenAI.

**Metodología:** iterativa por hitos (hito-1 a hito-11), con verificación antes de cerrar cada módulo:
1. Análisis de las rúbricas (`docs/requisitos/`).
2. Decisiones registradas (`docs/decisiones/ADR-001…005`).
3. Implementación con pruebas automáticas.
4. Despliegue con respaldo de D1 y opción de rollback.
5. Evidencias fechadas (`docs/evidencias/`).

**Prácticas de trabajo:**
- control de versiones con PR #1, sin fusión automática a `main`;
- CI en cada actualización del PR;
- Docker Compose para el entorno local y de contingencia.

## 4. Arquitectura y flujo de datos
![Arquitectura de la solución](capturas/diagramas/arquitectura.png)

![Cadena de valor y recuperación](capturas/diagramas/flujo-datos.png)

**Decisiones de arquitectura:**
- **ADR-001:** Workers, D1 y Workers AI en el plan Free; agregaciones en SQL para respetar el límite de CPU.
- **ADR-002:** proveedor de IA intercambiable (Workers AI, adaptador para la API oficial de OpenAI sin activar y respaldo por reglas).
- **ADR-003:** passkeys sin contraseñas.
- **ADR-005:** alternativa web para la TA5.

**Organización del monorepo (pnpm):**

| Módulo | Contenido |
|---|---|
| `apps/api` | Hono, D1, bots e IA |
| `apps/web` | React 19 y Three.js/R3F |
| `packages/contracts` | Contratos zod compartidos |
| `tools/simulator` | Simulador IoT e imagen Docker |
| `tools/e2e` | Pruebas Playwright |
| `assets/3d/blender` | Modelo reproducible por script |
| `infra/` | Docker Compose |

## 5. Tecnologías utilizadas y justificación
| Eje del curso | Tecnología | Justificación |
|---|---|---|
| IoT | Simulador TypeScript por tipo de espacio y hora de Lima. Desde Docker: HTTPS con HMAC-SHA256 y anti-replay ±60 s. En la nube: cron del Worker con escritura directa en D1 | El mismo protocolo admitiría un ESP32 real sin cambiar la API |
| RPA / bots | Cron Triggers: bot de incidencias por minuto y bot de reportes diario | Automatización sin servidores propios, auditada en `bot_runs` |
| IA generativa | Workers AI `@cf/openai/gpt-oss-20b`; prompts versionados; salidas JSON validadas con zod | Gratuito (10.000 neuronas al día), con function calling |
| CI/CD y contenedores | GitHub Actions; Docker (simulador, stack local, e2e con Compose, imagen del simulador) | Pruebas automáticas en cada actualización del PR; entorno reproducible sin conexión |
| Inmersión | Blender 5.3 → GLB; Three.js / React Three Fiber; WebXR; Scene Viewer; primera persona | Multiplataforma y sin instalación; un mismo modelo para todo |
| Interfaz | React 19, TypeScript, Tailwind; identidad visual #080F1D / #17243A / #2962FF / #22D3D6 / #F0B95B | Responsive de 360 a 1920 px, accesible, con vista de reloj circular |
| Datos | Cloudflare D1 (SQLite) | 100.000 escrituras al día gratis; uso medido de ~21 % |
| Seguridad | Passkeys (WebAuthn), roles, CSRF, CSP/HSTS, límite de solicitudes, gitleaks | Sin contraseñas almacenadas ni registro público |

## 6. Implementación y funcionamiento
### 6.1 IoT simulado
- **Dispositivos:** 10 (`DEV_<piso>_<código>`), uno por espacio, con 5 variables: CO₂, temperatura, humedad, ocupación y potencia.
- **Modelo del simulador:** curvas de ocupación por tipo de espacio y hora, CO₂ por balance de masa sencillo, temperatura dependiente de la ocupación y del día, y ruido.

| Origen de la lectura | Cómo llega a D1 | Autenticación | Uso |
|---|---|---|---|
| Simulador en Docker (`tools/simulator`) | `POST /api/v1/ingest` por lotes | **HMAC-SHA256** por gateway, ventana ±60 s; firma inválida → 401 | Stack local; ingesta probada en producción el 22-nov |
| Simulador en la nube (`engine/cloud-sim.ts`) | **Escritura directa en D1** desde el cron del Worker | No usa la API ni HMAC (código interno del Worker) | Producción; se detiene si un gateway reportó en los últimos 2 min |
| Escenarios de demostración | La API de administración inserta lecturas `sim-scenario` en D1 | Sesión de administrador con passkey | Demostración |

- **Escenarios de demostración** (solo administrador):
  - CO₂, temperatura, sobreaforo, consumo o **sin conexión**, en advertencia o crítica, en cualquiera de los 10 espacios;
  - generan una rampa de lecturas `sim-scenario`;
  - **Restaurar** cierra solo las incidencias del espacio.

### 6.2 API y datos
- **API:** Hono en Workers (`/api/v1`), validación zod con contratos compartidos y errores RFC 7807.
- **D1:** migraciones **0001–0007**, todas aditivas. Antes de aplicar la 0006 y la 0007 se respaldó D1 (exportación con SHA-256 y Time Travel) y se ensayó la migración sobre una copia.
- **Estado en vivo:** el frontend consulta `/live` cada 10 s (con ETag) y deja de hacerlo con la pestaña oculta.

### 6.3 Reglas y automatización RPA
| Regla | Condición | Severidad |
|---|---|---|
| CO₂ elevado / CO₂ crítico | ≥ 1.200 ppm 120 s / ≥ 1.500 ppm 60 s | advertencia / crítica |
| Temperatura alta / crítica | ≥ 28 °C 180 s / ≥ 30 °C 60 s (`RULE_TEMP_CRIT`, migración 0007) | advertencia / crítica |
| Sobreaforo | ≥ 100 % del aforo durante 60 s | crítica |
| Consumo elevado / crítico | ≥ 4.500 W 120 s / ≥ 6.000 W 60 s | advertencia / crítica |

**Ciclo del bot** (cada minuto):
1. Detecta las condiciones sostenidas en SQL.
2. Abre **una** incidencia por espacio y regla. La regla crítica suprime la de advertencia de la misma métrica.
3. Diagnostica una incidencia por ciclo.
4. Cierra las que llevan 10 min normalizadas.
5. Registra la ejecución en `bot_runs` (por ejemplo, «reglas=7; nuevas=0»).

**Aforo completo y sobreaforo (comportamiento implementado):**
- **Regla `RULE_OVERCAP`:** se cumple con ocupación **≥ 100 %** durante 60 s; también el **aforo completo exacto** abre una incidencia titulada «Sobreaforo».
- **Asistente:** solo cuenta como sobreaforo **más del 100 %**; el 100 % exacto se informa aparte como «al límite».
- **Color del gemelo:** advertencia desde el 90 % y crítico desde el **110 %**.

| Métrica | Color del gemelo: advertencia / crítico | Reglas: advertencia / crítica |
|---|---|---|
| CO₂ | ≥ 1.000 / ≥ 1.500 ppm | ≥ 1.200 (120 s) / ≥ 1.500 (60 s) |
| Temperatura | ≥ 27 / ≥ 30 °C | ≥ 28 (180 s) / ≥ 30 (60 s) |
| Ocupación | ≥ 90 % / ≥ 110 % | — / ≥ 100 % (60 s) |
| Consumo | ≥ 4.500 / ≥ 6.000 W | ≥ 4.500 (120 s) / ≥ 6.000 (60 s) |

- **Advertencias sin incidencia (por diseño):** el gemelo puede mostrar amarillo antes de que una regla se cumpla (p. ej., CO₂ de 1.008 ppm en A201, producción, 24-nov).
- **Incoherencia conocida:** entre el 100 % y el 109 % de aforo el bot abre una incidencia **crítica** mientras el gemelo muestra **advertencia**. Corrección propuesta y **no aplicada**: llevar el umbral crítico visual de ocupación al 100 % (`packages/contracts/src/thresholds.ts`) con sus pruebas.
- **Temperatura (corregido el 24-nov):** 31,2 °C se veía «crítico» pero abría una incidencia de advertencia; se añadió `RULE_TEMP_CRIT` y se verificó en producción. La prueba de coherencia recorre los perfiles de los escenarios (4 tipos × 2 intensidades en 3 espacios) y **no cubre** la franja 100–109 %.

### 6.4 IA generativa y prompt engineering
**Tarea clave: diagnóstico de incidencias** (prompt `diagnose@1.0.0`):
- rol de operador de facilities;
- contexto con las lecturas de 30 min, la regla, el aforo y el historial;
- 2 ejemplos (*few-shot*);
- salida JSON `{causa_probable, severidad, acciones[], evidencia[], confianza}` validada con zod, con un reintento;
- regla «si el dato no está en el contexto, dilo».

**Asistente** (prompt `assistant@1.1.0`):
- **Herramientas** de solo lectura (nunca SQL libre).
- **Cálculos en el backend:** en 18 familias de preguntas, el backend elige la herramienta y calcula rankings y porcentajes; la IA redacta.
- **Validación de fidelidad** (rankings, espacios por condición e incidencias): si la redacción no incluye el espacio principal o su cifra, se descarta y se muestra el resultado verificado, rotulado `fallback`. **Alcance limitado:** no comprueba el resto del texto ni las respuestas de estado general, actividad del bot o diagnósticos; la IA puede equivocarse.
- **Defecto corregido:** «el espacio más ocupado respecto a su aforo» respondía «no hay» (hito-9).

**Inferencia real frente a respaldo:**

| Modo | Qué es | Cómo se identifica |
|---|---|---|
| En vivo (`live`) | Texto generado por gpt-oss-20b en Workers AI | «En vivo» / «Inferencia de IA · modelo» |
| Respaldo (`fallback`) | Texto determinista armado por reglas del servidor, **sin IA** | «Diagnóstico por reglas — sin IA» / `rules-fallback` |

**Diagnósticos verificados en producción:**

| Incidencia | Proveedor y modelo | Modo | Latencia |
|---|---|---|---|
| CO₂ crítico en A401 (24-nov) | workers-ai · @cf/openai/gpt-oss-20b | **en vivo** | 2.092 ms |
| Temperatura crítica en el Hall (24-nov) | workers-ai · @cf/openai/gpt-oss-20b | **en vivo** | 3.971 ms |
| Sobreaforo en el Auditorio, 180/150 (24-nov) | workers-ai · @cf/openai/gpt-oss-20b | **en vivo** | 1.696 ms |
| Consumo crítico en LAB1, 6.400 W (24-nov) | rules-fallback · rules-v1 | **respaldo (sin IA)** | — |

- **Fallo en LAB1:** la llamada a Workers AI devolvió una respuesta vacía. El sistema la registró (`valid_json = 0`) y aplicó el respaldo por reglas, **rotulado «sin IA» en la interfaz**. No se presenta como respuesta de IA.
- **Corrección publicada (`004eaa4`):** el respaldo para consumo eléctrico ahora da una causa y 3 acciones concretas (antes: «sin pauta específica»). Se verificó con una prueba automática, no con un nuevo fallo en producción.

**Cuota y proveedor:**
- límite propio de 250 llamadas al día;
- consumo del 24-nov a las 18:07: 54 llamadas y unas 1.027 neuronas estimadas de 10.000;
- `@cf/openai/gpt-oss-20b` es un modelo de pesos abiertos de **OpenAI** que se ejecuta mediante **Cloudflare Workers AI**; **no se usa la API oficial de OpenAI**. Existe un adaptador oficial (probado con mocks) que no está activado.

### 6.5 CI/CD y contenedores
- **Pipeline:** `.github/workflows/ci.yml`:
  1. gitleaks;
  2. tipos, pruebas y build;
  3. e2e con Docker Compose + Playwright;
  4. construcción de la imagen del simulador (su publicación en GHCR está configurada solo para `main`; **no se ha publicado**);
  5. deploy a Cloudflare, condicionado a `main` y a `DEPLOY_ENABLED`, **desactivado por diseño**.
- **Despliegue a producción:** manual y controlado. Se respalda D1, se audita la migración, se despliega con `wrangler deploy` desde el commit aprobado y se deja anotado el rollback.
- **Docker Compose local:** API (Worker + D1 local), cron y simulador. **Verificado sin internet** el 24-nov (red sin salida, imágenes ya construidas): web operativa, 10/10 espacios con datos, ingesta HMAC 610/610, bot correcto y asistente en respaldo rotulado.

![Docker Compose: salida real del stack local (24-nov)](capturas/produccion/15-docker-compose-local.png)

![GitHub Actions en verde: secretos, pruebas, e2e Docker e imagen del simulador](capturas/produccion/10-github-actions-ci.jpg)

## 7. Gemelo 3D, inmersión web y TA5
### 7.1 Modelo arquitectónico (Blender 5.3)
- **Script reproducible:** `assets/3d/blender/build_utp_huancayo.py`.
  - Jerarquía `FACADE / ATRIUM / STAIRS / ELEVATORS / FLOOR_P01–P10 / SPC_*`.
  - Materiales PBR.
  - Exporta GLB para escritorio, móvil y AR.
- **Elementos:**
  - fachada con muro cortina y marca UTP iluminada de noche;
  - atrio con escaleras en zigzag;
  - núcleo de 3 ascensores;
  - aulas con mobiliario.
- **Medidas:** estimadas a partir de fotografías y videos (sin planos).

![Render del modelo de Blender (exterior)](capturas/blender/exterior-dia.png)

### 7.2 Visor 3D y alertas
- **Vistas:** Fachada, Aérea, Atrio (corte), Referencia (comparación con foto local), pisos explotados, aislamiento P1–P10, modo datos y modo noche.
- **Capas de datos:** estado, CO₂, temperatura, ocupación y energía.
- **Respuesta a una alerta:**
  - cambio de color y pulso en crítico;
  - **baliza con el valor**;
  - **ventana iluminada en la fachada**;
  - enfoque de cámara;
  - restauración al estado normal.
- **Localización:** el 24-nov, tres anomalías simultáneas solo colorearon sus 3 espacios; el resto siguió normal (KPI «7/10 normales, 3 críticos»).
- **Rendimiento con GPU:** 43 draw calls en la fachada, **113 FPS** de media en el recorrido y 117 en reposo.

![Tres anomalías simultáneas: solo LOBBY, LAB1 y AUD en crítico, con sus balizas (producción, 24-nov)](capturas/produccion/11-tres-anomalias-gemelo-localizado.jpg)

![A401 en crítico: piso aislado y ventana roja en la fachada con el flujo completo](capturas/demo-animada/02-a401-fachada-ventana-roja-flujo-completo.jpg)

### 7.3 Recorrido cinematográfico guiado
- **Recorrido:** aérea → fachada → atrio → piso → aula, con movimiento continuo de cámara.
- **Controles:** pausa, reinicio y cancelación (al arrastrar la cámara o con «Salir»).
- **Indicador ilustrativo de ascensor:** el GLB no tiene cabinas.
- **Verificado en producción (24-nov):** pausa sostenida 9 s, reinicio al paso 1 y cancelación.
- **Grabación real:** 55 s, con movimiento en el 87 % de las muestras.

### 7.4 Recorrido en primera persona (TA5)
| Aspecto | Implementación |
|---|---|
| Control | **WASD / flechas**, **Shift** para correr, **arrastrar con ratón o dedo** para mirar, **cruceta táctil** en móvil |
| Altura | Ojos a 1,65 m sobre la losa |
| Colisiones | Rectángulos en planta con las **mismas medidas del script de Blender**: muros exteriores, vacío del atrio (desde P2), escaleras, núcleo de ascensores y tabiques de los ambientes, **con 5 puertas como único paso** |
| Pisos | **P1–P10 mediante controles** (RePag/AvPag o botones). **Las escaleras no se recorren físicamente** |
| Salida | Esc o «Salir»: vuelven las cámaras orbitales y el Centro de mando; se cancela el recorrido guiado |
| Limitaciones | El mobiliario no colisiona; interior esquemático |

**Verificación en producción (24-nov, `004eaa4`, navegador visible):**
- **Rendimiento:** **120 FPS**.
- **Movimiento y colisiones:** se cruza la puerta central del hall hacia el pasillo y el núcleo de ascensores detiene el paso lateral.
- **Pisos y salida:** cambio de piso hasta P10; Esc devuelve las cámaras orbitales; sin errores en consola.

**Verificado en local con el mismo código:** tabique macizo a 3,6 m de la puerta, controles táctiles en vista móvil emulada y 7 pruebas unitarias de colisiones. **No se ha probado en un teléfono físico.**

**Estado:** publicado en producción el 24-nov. En pantallas de poca altura, los botones de piso quedan bajo el borde visible: hay que desplazar la página o usar pantalla completa (el teclado funciona igual).

![Primera persona en producción (004eaa4): pasillo de P1 y núcleo de ascensores que bloquea el paso](capturas/produccion-final/06-primera-persona.png)

![Primera persona (entorno local): aula A201 (P2) con mobiliario y muro cortina](capturas/primera-persona/03-p2-aula-a201.png)

### 7.5 Realidad aumentada
**Niveles de `/ar`:**
- **A:** WebXR `immersive-ar` con hit-test, maqueta de unos 0,60 m y colores en vivo;
- **B:** Scene Viewer de ARCore con el GLB de AR, estático;
- **C:** vista 3D, que **no es AR**.

**Evidencia:**
- en producción la página ofrece los tres niveles y, en escritorio, indica correctamente que no hay WebXR;
- el código de AR **no ha cambiado** desde la versión desplegada el 23-nov (`207d3808`);
- **Pruebas físicas anteriores:** el equipo reporta pruebas de AR en el Galaxy S25 Ultra previas a la versión final; **no hay captura archivada en el proyecto**.

**Pendiente:** validar y capturar la AR (nivel A o B) en el S25 con la versión final. No se declara ninguna prueba física de `004eaa4`.

### 7.6 Vista de reloj
- **`/reloj`:** esfera circular con la alerta más grave, CO₂ medio, ocupación y la etiqueta SIMULADO.
- **Evidencia física:** fotografías del **Galaxy Watch6 Classic** del 23-nov a las 19:52 (versión `207d3808`), con «Campus normal» y «CO₂ medio 790 ppm». El código del reloj no ha cambiado desde entonces; **falta repetir la foto con la versión final**.
- **Telegram:** **no está configurado**. No hay notificaciones al reloj; es integración futura.

![Galaxy Watch6 Classic: vista /reloj (foto del 23-nov)](capturas/dispositivos/watch6-reloj-co2-medio-2026-11-23.png)

## 8. Adaptación técnica de la TA5
### 8.1 Qué pide la TA5 y qué se entrega
- **Lo que pide:**
  - un proyecto **Unity** 3D con terreno, objetos, materiales, duplicación y cámara FPS;
  - un proyecto VR en **Unity** con **Meta XR SDK, OpenXR y XR Plug-in Management**, ejecutado en un **simulador VR**.
- **Lo que entrega el equipo** (ADR-005):
  - escenario modelado en **Blender 5.3**;
  - visualización con **Three.js / React Three Fiber**;
  - recorrido cinematográfico;
  - recorrido **FPS web** con colisiones;
  - **AR WebXR** y **Scene Viewer**.
  - Todo integrado en la misma aplicación del Proyecto Final.

### 8.2 Comparación
| Aspecto | Unity + XR (lo que pide la consigna) | Alternativa web (lo entregado) |
|---|---|---|
| Herramientas | Editor Unity, C#, Meta XR SDK, OpenXR, XR Plug-in Management | Blender (modelo por script) → GLB → Three.js/R3F; un build web |
| Navegación | CharacterController, XR Origin y locomoción | FPS propio (teclado, ratón, táctil), colisiones en planta, cambio de piso por controles; además, cámaras, recorrido guiado y aislamiento de pisos |
| Compatibilidad | Ejecutable por plataforma; instalación previa | Navegador con WebGL 2, sin instalación. Probado en Chrome de escritorio y en vista móvil; **iOS no probado** |
| IoT e IA | Clientes HTTP a programar | Nativo: `/live`, incidencias, diagnósticos y asistente en el mismo gemelo |
| Realidad aumentada | AR Foundation, en otro proyecto | WebXR (A), Scene Viewer (B) y respaldo 3D (C) |
| Hardware | PC con GPU; visor para VR real | Navegador con WebGL 2; 117–120 FPS medidos en la laptop con GPU |
| Escalabilidad | Distribución por build | Despliegue global en el borde, actualización inmediata y CI/CD |
| Limitaciones | Curva de aprendizaje, licencias, integración manual de datos | **Sin VR con visor ni simulador VR**; colisiones simplificadas; interior esquemático |

### 8.3 Criterio por criterio
| Criterio TA5 | Equivalente técnico entregado | ¿Cumplimiento literal? |
|---|---|---|
| 1. Escenario 3D **en Unity** | Edificio de 10 pisos, entorno (terreno, calles, edificios vecinos) e interiores en Blender | **No** (herramienta distinta) |
| 2. Materiales y objetos 3D | PBR en todos los objetos; elementos duplicados e instanciados | Funcionalmente sí (en Blender) |
| 3. Recorrido tipo FPS | FPS web con control total y colisiones | Funcionalmente sí (**no en Unity**) |
| 4. Entorno VR **en Unity** | AR WebXR y FPS en pantalla | **No** |
| 5. Plugins **de Unity** | WebXR Device API, Three.js/R3F, drei | **No** |
| 6. Navegar el recorrido **VR** en simulador | FPS navegable en pantalla; AR en el móvil | **No** (sin simulador ni visor VR) |
| 7–10. Informe, capturas, código, redacción | Este informe, capturas clasificadas, monorepo con pruebas | Sí (pendientes los datos académicos) |

### 8.4 Procedimiento futuro: GLB → Unity + OpenXR
1. Instalar Unity 6 LTS con la plantilla «VR Core».
2. Añadir **glTFast** e importar `apps/web/public/models/utp-huancayo.glb`, que conserva la jerarquía `FLOOR_Pxx` / `SPC_*`.
3. En **XR Plug-in Management**, activar **OpenXR**. Añadir **XR Interaction Toolkit** y un **XR Origin** con locomoción continua y teletransporte.
4. Crear `BoxCollider` con las mismas medidas de `apps/web/src/twin/fps.ts` (muros, atrio, núcleo y tabiques con puertas).
5. Probar con el **XR Device Simulator** (sin visor) y, si se requiere, con **Meta XR SDK**.
6. Opcional: consultar `GET /api/v1/live` desde C# para colorear los `SPC_*`.

### 8.5 Defensa breve para la sustentación
> «La TA5 busca el diseño de un escenario 3D, un recorrido en primera persona y una experiencia inmersiva. Las implementamos sobre el **mismo gemelo digital** del Proyecto Final:
> - un modelo de Blender de 10 pisos;
> - un recorrido FPS con colisiones;
> - un recorrido guiado y AR WebXR en el teléfono.
>
> Elegimos la web porque funciona sin instalación en cualquier dispositivo, está desplegada públicamente y muestra en tiempo real los datos IoT, las incidencias y los diagnósticos de IA.
>
> Somos transparentes: **no hicimos un proyecto Unity ni usamos sus plugins de VR ni un simulador VR**; esos criterios no se cumplen literalmente. El modelo es GLB estándar y documentamos el procedimiento para llevarlo a Unity con OpenXR.»

## 9. Seguridad y costos
- **Acceso:**
  - **passkeys** (WebAuthn) sin contraseñas;
  - alta solo con token de un solo uso, ya consumido;
  - vinculación de dispositivos con un código de 10 min;
  - sesión en cookie httpOnly/Secure/SameSite=Strict de 8 h.
  - En producción: 1 administrador con 2 passkeys (escritorio y Android).
- **Autorización verificada en producción (24-nov, repetida tras desplegar `004eaa4`):**
  - sin sesión, escenarios, restauración y reglas devuelven **401**;
  - una ingesta con firma inválida devuelve **401**;
  - un `Origin` ajeno recibe **403**;
  - el visitante tiene solo lectura.
  - Las operaciones administrativas se hicieron con una sesión de administrador válida.
- **Cabeceras:** CSP estricta, `nosniff`, `X-Frame-Options: DENY` y HSTS.
- **Secretos:**
  - solo en `wrangler secret` y en GitHub Secrets;
  - gitleaks sin hallazgos en el historial;
  - `.gitignore` excluye `.dev.vars`, `*.local.env`, `infra/*.secrets.local*` y `backups/`;
  - las capturas públicas tienen recortado el nombre del usuario.
- **Privacidad:** solo conteos agregados, sin cámaras ni identidades (Ley N.° 29733).
- **Costos: S/ 0,00.** Workers, D1 y Workers AI en plan Free, sin facturación. Al agotarse la cuota de IA, el sistema responde con reglas rotuladas.

## 10. Pruebas y resultados
| Tipo | Resultado | Fecha |
|---|---|---|
| Unitarias e integración | **350 aprobadas, 0 fallidas**:<br>• contratos 9;<br>• API 140;<br>• web 191;<br>• simulador 10 | 24-nov (local) |
| e2e Playwright + Docker Compose | **15 aprobadas, 0 fallidas, 3 omitidas a propósito** (5,6 min) | 24-nov (local) |
| CI en GitHub | En verde en `004eaa4` (run 45492073983), el commit desplegado | 24-nov |
| gitleaks | Sin hallazgos en el historial de la rama | 24-nov |
| Asistente con el modelo real | 20 preguntas (12 en local y 8 en producción) contrastadas con `/live`, más 2 tras desplegar `004eaa4` (aforo y CO₂, ambas coincidentes) | 24-nov |
| Escenarios en producción (`513ce1e`) | 4 incidencias críticas coherentes con el gemelo; 3 inferencias reales y 1 respaldo; restauradas (0 abiertas) | 24-nov |
| Validación tras desplegar `004eaa4` | Fachada, Aérea, Atrio, Referencia, pisos explotados, noche, recorrido (avance y pausa), primera persona 120 FPS, telemetría avanzando, `/ar` y `/reloj` | 24-nov (producción) |
| Primera persona (local) | Colisión con tabique, vista móvil emulada, 7 pruebas | 24-nov |
| Docker sin internet | Red sin salida: web 200, 10/10 espacios, ingesta 610/610, bot correcto, asistente en respaldo | 24-nov (local) |
| Alta de administrador en Docker local (autenticador **virtual** de Chromium) | Alta y reingreso correctos; escenario con incidencia y diagnóstico por reglas; segundo alta con el mismo token rechazada (403) | 24-nov (local) |
| Seguridad | 401 sin sesión y con firma inválida; 403 con origen ajeno | 24-nov (producción) |

![Incidencias generadas por el bot en los escenarios del 24-nov](capturas/produccion/12-incidencias-escenarios-24nov.jpg)

![Diagnóstico en vivo: temperatura crítica en el Hall (RULE_TEMP_CRIT, gpt-oss-20b, 3.971 ms)](capturas/produccion/13-hall-temp-critica-diagnostico-ia.jpg)

![Respaldo por reglas rotulado «sin IA» (consumo en LAB1)](capturas/produccion/14-lab1-consumo-respaldo-sin-ia.jpg)

![Asistente tras desplegar 004eaa4: respuestas «En vivo» contrastadas con /live](capturas/produccion-final/03-asistente.jpg)

![Reglas activas y ejecuciones del bot](capturas/produccion/04-automatizaciones-reglas-bot.jpg)

![Telemetría simulada de los 10 espacios](capturas/produccion/06-iot-telemetria.jpg)

## 11. Estado de versiones: local, GitHub y producción
| Componente | Producción (Worker `9fca1ec7`, commit `004eaa4`) | Rama `feature/hito-2` |
|---|---|---|
| Asistente, gemelo, recorrido guiado, escenarios, AR, reloj y passkeys | **Sí** | Sí |
| Regla `RULE_TEMP_CRIT` (migración 0007) | **Sí** | Sí |
| Primera persona | **Sí** (desde el 24-nov) | Sí |
| Severidades en español y respaldo para consumo eléctrico | **Sí** | Sí |

Los commits de la rama **posteriores** a `004eaa4` contienen documentación, la presentación y una utilidad local (`infra/generar-env-local.mjs`); **no se volvió a desplegar**.

**Rollback disponible:**
- Worker: `npx wrangler rollback d9180962-e65a-4c90-b693-3dd8000693fc` (commit `513ce1e`).
- D1: este despliegue no tuvo migraciones; antes se exportó la base y se anotó el marcador de Time Travel (hito-11).

![Sistema en producción: commit 004eaa4, salud de servicios y consumo de IA](capturas/produccion-final/02-sistema-commit-004eaa4.jpg)

## 12. Matriz de cumplimiento
**Estados:**
- **CC:** cumplido y comprobado;
- **IE:** implementado, con evidencia insuficiente;
- **P:** parcial;
- **Pe:** pendiente;
- **NL:** no cumplido literalmente.

### 12.1 Proyecto Final (20 puntos)
| # | Requisito (máx.) | Implementación | Evidencia | Estado | Corrección necesaria |
|---|---|---|---|---|---|
| 1 | Problema relevante y objetivos medibles (2) | §1–2 con indicadores y resultados | Tabla de objetivos con fuentes | **CC** | Opcional: dato institucional con fuente |
| 2 | Integración articulada de 3 o más tecnologías (3) | IoT → API → D1 → RPA → IA → gemelo/AR, con CI/CD y Docker | Escenarios en producción (§10); figuras 2–3 | **CC** | — |
| 3 | Prototipo modular que resuelve el problema (3) | Monorepo, contratos, 7 migraciones, bots, escenarios, asistente | 350 pruebas, 15 e2e, producción operativa | **CC** | — |
| 4 | CI/CD y contenedores con automatización (3) | Actions (secretos, pruebas, e2e e imagen Docker); Docker Compose | Run en verde de `004eaa4`; Docker verificado sin internet | **CC** | Deploy automático desactivado a propósito (manual con respaldo); imagen no publicada en GHCR |
| 5 | IA con prompts para una tarea clave (3) | Diagnóstico JSON + asistente con validación de fidelidad acotada | 3 inferencias reales y 1 respaldo; 22 preguntas contrastadas | **CC**, con riesgo | **Riesgo:** «APIs de OpenAI» frente a Workers AI; confirmarlo con el docente |
| 6 | Interfaz intuitiva, fluida, en tiempo real (1,5) | SPA responsive, gemelo en vivo, FPS, AR, reloj | Capturas de producción; 119–120 FPS; fotos del Watch6 (23-nov) | **IE** | Capturar la AR en el S25 con la versión final |
| 7 | Informe con esquemas, capturas, resultados e impacto (1,5) | Este informe (Word/PDF) | — | **P** | Completar los datos académicos (Anexo B) |
| 8 | Presentación con secuencia lógica y participación equitativa (1,5) | Presentación de 10 diapositivas y guion de 5 min para 2 integrantes | `PRESENTACION_FINAL.pptx`, `GUION_DEMO_5MIN.md` | **Pe** | Grabar el video y ensayar |
| 9 | Idea original que transforma la solución (1,5) | Gemelo conversacional (la IA mueve la cámara), alertas en la fachada, FPS sobre el gemelo vivo, escenarios configurables | Capturas y video del 23-nov | **CC** | — |

**Requisito de grupo:** ambas consignas piden de 3 a 5 integrantes y el equipo tiene 2. La excepción está **pendiente de confirmación del docente**.

### 12.2 TA5 (20 puntos)
| # | Criterio | Equivalente entregado | Evidencia | Estado |
|---|---|---|---|---|
| 1 | Escenario 3D en Unity | Edificio y entorno en Blender | Renders, GLB | **NL** (equivalente funcional) |
| 2 | Materiales y objetos 3D | PBR y elementos instanciados | Renders | **CC** en Blender |
| 3 | Recorrido tipo FPS | FPS web con colisiones | Capturas, 7 pruebas, 120 FPS en producción | **CC** en web (no en Unity) |
| 4 | Entorno VR en Unity | — | — | **NL** |
| 5 | Plugins de Unity | Equivalentes web | — | **NL** |
| 6 | Ejecutar y navegar el recorrido VR | FPS en pantalla; AR en el móvil | Capturas FPS | **NL** |
| 7 | Informe técnico | Este informe | — | **P** (datos académicos) |
| 8 | Capturas y evidencias | `capturas/` clasificadas | Inventario | **CC** (falta la AR del S25) |
| 9 | Código limpio y organizado | Monorepo con módulos y pruebas | Repositorio | **CC** |
| 10 | Redacción técnica | Este informe | — | **CC** (revisión final del equipo) |

Los criterios 1, 4, 5 y 6 solo pueden considerarse cubiertos si el docente **acepta la alternativa web**; en sentido literal no se cumplen. Unity, OpenXR, Meta XR y VR con visor son ampliación futura (§8.4).

## 13. Limitaciones, riesgos y alternativas
| Limitación o riesgo | Impacto | Alternativa o mitigación |
|---|---|---|
| Sensores simulados | No se miden condiciones reales | Mismo protocolo HMAC para un ESP32 con sensor NDIR de CO₂ |
| Workers AI en lugar de la API oficial de OpenAI | Posible lectura estricta del criterio 5 | Adaptador oficial listo (requiere una clave propia; hoy no se activa por costo) |
| Fallo o cuota de IA (ocurrió en LAB1) | Diagnóstico sin IA | Respaldo determinista rotulado, con pautas por métrica |
| Geometría aproximada sin planos | El interior no es fiel | Croquis del equipo y modelo regenerable por script |
| TA5 sin Unity ni VR con visor | Criterios 4–6 no literales | Procedimiento GLB → Unity/OpenXR (§8.4) |
| Ocupación 100–109 %: gemelo en advertencia, incidencia crítica | Incoherencia visible en la demo | Usar escenarios de 120 %; corrección propuesta del umbral visual (§6.3) |
| Botones de primera persona bajo el borde en pantallas bajas | Hay que desplazar la página | Pantalla completa o teclado |
| Grupo de 2 integrantes (consigna: 3–5) | Posible observación académica | Pedir confirmación al docente |
| AR sin captura en la versión final | Evidencia débil del criterio 6 | Probarla y capturarla en el S25 antes de la sustentación |
| Wi-Fi de la sustentación | Demo en vivo interrumpida | Hotspot del S25, Docker local sin internet (preparado antes) y video de respaldo rotulado, **aún por grabar** |
| Telegram no configurado | Sin avisos al reloj | Integración futura (token del bot) |

## 14. Conclusiones y recomendaciones
**Conclusiones (basadas en los resultados):**
1. **Cadena completa en producción:** CampusPulse 360 integra los cinco ejes del curso. El 24-nov, cuatro escenarios en espacios distintos (A401, Hall, LAB1 y Auditorio) generaron la incidencia crítica esperada en uno o dos ciclos del bot, con diagnóstico y reflejo en el gemelo, y volvieron al estado normal al restaurar.
2. **Cálculo determinista más IA:** calcular en el backend rankings, porcentajes y estados corrigió el defecto detectado en las preguntas probadas. La validación de fidelidad **reduce, pero no elimina**, el riesgo de errores de la IA. Ante un fallo real del modelo (LAB1), el sistema pasó a reglas rotuladas.
3. **Coherencia entre visor y reglas:** una incoherencia observada al probar la demo (temperatura crítica con incidencia de advertencia) se corrigió con una regla y una prueba automática, verificadas en producción. Queda documentada otra franja pendiente (ocupación 100–109 %).
4. **TA5 en web:** la alternativa web cubre funcionalmente el escenario 3D y el recorrido en primera persona (120 FPS en producción; colisiones con muros, tabiques, atrio y núcleo) dentro del mismo gemelo con datos en vivo. No sustituye literalmente a Unity ni a la VR con visor.
5. **Costo y entrega controlada:** el proyecto opera con S/ 0,00. Los despliegues del 24-nov se hicieron con respaldo previo de D1 y rollback disponible, y la migración 0006 se ensayó antes sobre una copia restaurada.

**Recomendaciones:**
1. Instalar un sensor físico de CO₂ por el mismo protocolo para validar el modelo con mediciones reales.
2. Configurar Telegram para las notificaciones al reloj.
3. Evaluar el adaptador de la API oficial de OpenAI si se dispone de una clave institucional.
4. Ampliar a unos 20 espacios instrumentados (2 por piso) con migraciones aditivas, dentro del plan gratuito.
5. Si la asignatura lo exige, llevar el GLB a Unity con OpenXR siguiendo el §8.4.
6. Alinear el umbral visual de ocupación crítica con la regla de sobreaforo (100 %).

## 15. Referencias
- Cloudflare. (2026). *Workers platform limits* y *Pricing*. https://developers.cloudflare.com/workers/platform/limits/ (consultado el 21-nov-2026).
- Cloudflare. (2026). *D1 limits* y *pricing*. https://developers.cloudflare.com/d1/platform/limits/ (consultado el 21-nov-2026).
- Cloudflare. (2026). *Workers AI pricing* y *models: @cf/openai/gpt-oss-20b*. https://developers.cloudflare.com/workers-ai/ (consultado el 21-nov-2026).
- OpenAI. (2025). *gpt-oss: open-weight reasoning models*. https://openai.com/index/introducing-gpt-oss/
- W3C. (2025). *WebXR Device API*. https://www.w3.org/TR/webxr/
- W3C. (2021). *Web Authentication: An API for accessing Public Key Credentials, Level 2*. https://www.w3.org/TR/webauthn-2/
- three.js authors. (2026). *three.js documentation*. https://threejs.org/docs/
- Poimandres. (2026). *React Three Fiber* y *drei*. https://docs.pmnd.rs/
- Blender Foundation. (2026). *Blender 5.3 Reference Manual*. https://docs.blender.org/manual/
- Google. (2026). *ARCore supported devices* y *Scene Viewer*. https://developers.google.com/ar/devices
- GitHub. (2026). *GitHub Actions documentation*. https://docs.github.com/actions
- Docker Inc. (2026). *Docker Compose documentation*. https://docs.docker.com/compose/
- Unity Technologies. (2026). *XR Interaction Toolkit* y *OpenXR Plugin manuals*. https://docs.unity3d.com/ (referencia para el §8)
- Congreso de la República del Perú. (2011). *Ley N.° 29733, Ley de Protección de Datos Personales*.

## Anexo A. Evidencias
- **Inventario clasificado:** `INVENTARIO_EVIDENCIAS.md` (qué demuestra cada captura y dónde se usa).
- **Registros fechados:** `docs/evidencias/hito-1 … hito-11`.
- **Decisiones:** `docs/decisiones/ADR-001…005`.
- **Capturas de la versión final (`004eaa4`):** `capturas/produccion-final/`.

## Anexo B. Datos que debe completar el equipo
1. Curso, sección, docente y número de grupo (portada).
2. Apellidos, nombres y código de los **2 integrantes** (portada).
3. Si ya se entregó la propuesta inicial (entregable 1).
4. Facultad o carrera (portada) y, de forma opcional, un dato institucional con fuente (§1).
5. Confirmación del docente sobre: grupo de 2, uso de Workers AI en lugar de la API de OpenAI y TA5 en web.

## Anexo C. Ejecución
- **Producción:** https://campuspulse.campuspulse-api.workers.dev
  - el visitante tiene solo lectura;
  - el administrador entra con passkey.
- **Local sin internet:** preparar antes, con conexión, las claves locales (`node infra/generar-env-local.mjs`) y las imágenes (`docker compose pull cron`, `docker compose build`). Sin internet: `docker compose up -d --no-build --pull never` y abrir http://localhost:8787. La IA cae al respaldo rotulado (pasos completos en `LEEME.txt` del paquete).
- **Desarrollo:** `pnpm install` → `pnpm -r typecheck` → `pnpm -r test` → `pnpm --filter @campuspulse/web build`; e2e con el stack de Docker levantado: `cd tools/e2e && npx playwright test`.
