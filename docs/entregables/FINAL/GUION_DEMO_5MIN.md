# Guion definitivo del video (máximo 5:00) — 2 integrantes

**Objetivo:** mostrar el sistema **funcionando**: la cadena IoT → API → D1 → reglas → bot → incidencia → IA → gemelo debe verse ocurrir.

**Personas:**
- **A** = Integrante 1 (backend, IoT, RPA, IA, DevOps);
- **B** = Integrante 2 (gemelo 3D, inmersión, documentación).

Cada uno habla unos 2:30.

**Estado del video:** **no está grabado.** Este guion, el plan de montaje (§4) y las placas de título en `video/titulos/` son la base para grabarlo y editarlo.

## 1. Preparación (unos 15 min antes)
1. **Laptop:**
   - Chrome **maximizado y visible**: si queda tapado, Chrome reduce los FPS;
   - abrir https://campuspulse.campuspulse-api.workers.dev;
   - iniciar sesión con la passkey en Acceso;
   - esperar a que «Recorrido guiado» esté habilitado.
2. **Estado inicial:** el Centro de mando debe mostrar «Sin alertas activas». Si queda un escenario, pulsar **Restaurar**.
3. **Pestañas abiertas:**
   - GitHub Actions (último run en verde);
   - `/sistema`;
   - `/asistente`.
4. **Primera persona:**
   - si se despliega antes de grabar, usar producción;
   - si no, grabarla en el stack local (`docker compose up -d` → http://localhost:8787) **y rotular el clip «entorno local»**.
5. **Galaxy S25 Ultra:**
   - Chrome en `/ar`;
   - un póster o mantel con textura y buena luz;
   - grabador de pantalla nativo.
6. **Galaxy Watch6:** `/reloj` abierto en su navegador. Grabar el reloj con el S25 en modo video.
7. **Grabación de la laptop:** OBS Studio (instalado), a 1920×1080 y 30 fps, sin mostrar notificaciones ni pestañas con datos personales.

## 2. Escenas, acciones y narración
| Tiempo | Voz | Acción exacta en pantalla | Narración (leer tal cual) |
|---|---|---|---|
| 0:00–0:30 | **A** | Placa «CampusPulse 360» → Centro de mando: KPIs, insignia SIMULADO y gemelo de 10 pisos | «En muchos campus, un aula con aire viciado o sobreaforo se detecta tarde y se reporta a mano. CampusPulse 360 es un gemelo digital de la UTP Huancayo que detecta, diagnostica y muestra esas incidencias en minutos, con datos simulados y costo adicional cero.» |
| 0:30–1:15 | **B** | **Recorrido guiado**: aérea → fachada → atrio → piso → aula. Pulsar **Pausar** y luego **Reanudar**. Mostrar «Modo noche» 3 s | «El edificio de 10 pisos está modelado en **Blender** con un script reproducible y se visualiza con **Three.js**. Es un modelo aproximado, sin planos oficiales. El recorrido guiado presenta la fachada, el atrio con sus escaleras y núcleo de ascensores, y los pisos con espacios instrumentados.» |
| 1:15–1:30 | **A** | **Demostración**: «P4 · Aula A401», «CO₂ elevado», «Crítica», 5 min → **Lanzar escenario**. El gemelo aísla P4 y A401 se pone en rojo con la baliza «CO₂ 1.720 ppm» | «Lanzo un escenario: el sensor simulado de A401 envía lecturas firmadas a nuestra **API** en Cloudflare, que las guarda en **D1**. El gemelo lo refleja de inmediato.» |
| 1:30–2:20 | **A** | Esperar en la franja: **Reglas → Bot → Incidencia → IA**. Abrir **Incidencias** → «CO2 critico en Aula A401»: causa, acciones, evidencia, `gpt-oss-20b` y latencia. Volver y pulsar **Restablecer vista**: ventana roja de A401 en la fachada | «Cada minuto, un **bot RPA** evalúa siete reglas. Al confirmar el CO₂ sostenido abre una sola incidencia y pide un diagnóstico a la **IA**: **gpt-oss-20b en Workers AI de Cloudflare**, que no es la API oficial de OpenAI. El prompt exige un JSON validado, con causa, acciones y evidencia. Si la IA falla, el sistema responde con reglas y lo rotula **sin IA**.» |
| 2:20–2:55 | **B** | **Asistente**: «¿Cuál es el espacio más ocupado respecto a su aforo?» y «¿Qué incidencias activas hay y cuál es su gravedad?» → **Ver en el gemelo** | «El asistente no inventa cifras: el backend calcula los rankings y porcentajes, la IA solo redacta, y si su respuesta contradice el cálculo se descarta. Cita el espacio y mueve la cámara hacia él.» |
| 2:55–3:40 | **B** | **Primera persona**: desde el hall de P1, W para cruzar la puerta central hasta el atrio; arrastrar para mirar; acercarse al núcleo de ascensores, que bloquea; RePag hasta P4; Esc | «Para la **TA5**, un recorrido en primera persona sobre el mismo modelo: teclado, ratón o controles táctiles, y colisiones con muros, tabiques, atrio y ascensores. Cambiamos de piso con controles; las escaleras no se recorren. Es una alternativa **web**: no usamos Unity ni un simulador VR, y lo declaramos en el informe.» |
| 3:40–4:15 | **B** | Clip del **S25**: `/ar` → Nivel A, esperar el aro, tocar para colocar la maqueta y tocar un espacio. Si falla, Nivel B. Luego el clip del **Watch6** con `/reloj` | «En el teléfono, la **realidad aumentada WebXR** coloca la maqueta con los colores en vivo; si no detecta la superficie, usamos Scene Viewer. En el reloj, la vista resume la alerta más grave.» |
| 4:15–4:45 | **A** | GitHub Actions en verde (secretos, pruebas, e2e con Docker Compose, imagen del simulador) → `/sistema` (commit y consumo de IA) → volver a Demostración → **Restaurar** (A401 en verde) | «Cada push ejecuta **350 pruebas**, pruebas end-to-end en **Docker Compose** y un escaneo de secretos. Desplegamos con respaldo de la base de datos y rollback. Al restaurar, la incidencia se cierra y el gemelo vuelve a la normalidad.» |
| 4:45–5:00 | **A** y **B** | Placa final con resultados y limitaciones | **A:** «Integramos IoT, RPA, IA, CI/CD e inmersión en una sola plataforma pública.» **B:** «Con limitaciones honestas: datos simulados, modelo aproximado y TA5 en web. Gracias.» |

## 3. Contingencias (ensayarlas)
| Situación | Respuesta en el video o en vivo |
|---|---|
| El bot tarda | Seguir con el asistente o el recorrido y volver después: la incidencia llega en 1–2 ciclos (≤ 2 min) |
| La IA falla o se agota la cuota | Se ve «Respaldo por reglas (sin IA)». Mostrarlo y decirlo: «la IA no respondió y el sistema degradó de forma rotulada» |
| Sin Wi-Fi | Hotspot del S25 |
| Sin internet | `docker compose up` en la laptop (IA rotulada «sin IA») |
| La AR no detecta la superficie | Nivel B (Scene Viewer) o nivel C (3D, que no es AR) |
| Falla todo en vivo | Reproducir el video grabado, **rotulado con su fecha** |

## 4. Plan de montaje (Clipchamp o CapCut, ambos instalados)
| Orden | Clip o recurso | Origen | Duración |
|---|---|---|---|
| 1 | `video/titulos/01-portada.png` | Este repositorio | 0:04 |
| 2 | Centro de mando + recorrido guiado | Grabación OBS (laptop) | 0:56 |
| 3 | `video/titulos/02-cadena.png` | Este repositorio | 0:03 |
| 4 | Escenario A401 → franja → incidencia → fachada | Grabación OBS | 1:02 |
| 5 | Asistente | Grabación OBS | 0:35 |
| 6 | `video/titulos/03-ta5.png` + primera persona | Repositorio + OBS | 0:45 |
| 7 | AR en el S25 y Watch6 | Grabador del S25 (video del reloj grabado con el S25) | 0:35 |
| 8 | GitHub Actions, `/sistema`, Restaurar | Grabación OBS | 0:30 |
| 9 | `video/titulos/04-cierre.png` | Este repositorio | 0:10 |

- **Audio:** grabar la narración por escenas (cada integrante lee su parte) y ajustar los cortes a la voz. Duración total menor de 5:00.
- **Exportación:** MP4 H.264 a 1080p, como `[GRUPO]_CampusPulse360_video.mp4`.
- **Antes de exportar**, revisar que no aparezcan nombres personales innecesarios, tokens ni el panel de Cloudflare.

## 5. Clips que debe grabar el equipo
1. **OBS en la laptop:** escenas 2, 4, 5, 6 y 8 (producción). La primera persona, en producción si se autoriza el despliegue; si no, en local y rotulada.
2. **S25:** pantalla grabada de `/ar`, nivel A o B.
3. **S25 en modo cámara:** el Watch6 mostrando `/reloj`.
4. **Narración:** voz de A y de B según la tabla.
