# Guion definitivo — video y demostración de CampusPulse 360 (máximo 5:00)

**Objetivo:** mostrar el sistema **funcionando**, no solo pantallas. La cadena IoT → API → D1 → reglas → bot → incidencia → IA → gemelo debe verse ocurrir.

**Datos:** todos son simulados; dilo una vez al inicio y no lo repitas en cada escena.

## Preparación (antes de grabar, unos 10 min)
1. **Laptop** (Chrome, ventana maximizada y **visible**: si queda tapada, Chrome baja los FPS):
   - abrir https://campuspulse.campuspulse-api.workers.dev;
   - iniciar sesión con la passkey (Acceso) y esperar a que «Recorrido guiado» deje de decir «Cargando modelo 3D…».
2. **Producción en estado normal:**
   - el Centro de mando muestra «Sin alertas activas»;
   - si queda un escenario anterior, usar **Restaurar**.
3. **Pestañas abiertas:**
   - GitHub Actions (último run en verde);
   - el repositorio;
   - página `/sistema`.
4. **Galaxy S25 Ultra:**
   - Chrome en `/ar` con la sesión ya vinculada;
   - un póster o mantel con textura sobre la mesa.
5. **Galaxy Watch6:** `/reloj`, si tiene navegador. Si no, mostrar `/reloj` en la laptop rotulado como «vista previa».
6. **Grabación de pantalla:**
   - laptop con OBS Studio o la Barra de juegos de Windows (Win+G), ambos gratuitos;
   - S25 con su grabador nativo.
   - Rotular cada clip con su fecha.

## Escenas (tiempos acumulados)
| Tiempo | Quién | Acción exacta en pantalla | Qué se dice (breve) |
|---|---|---|---|
| 0:00–0:25 | Integrante 1 | Centro de mando: KPIs en vivo, insignia SIMULADO y gemelo de 10 pisos | «La gestión del campus es reactiva. CampusPulse 360 es un gemelo digital de la UTP Huancayo que detecta, diagnostica y muestra incidencias en tiempo real, con costo S/ 0.» |
| 0:25–0:50 | Integrante 2 | **Demostración**: «P4 · Aula A401», «CO₂ elevado», «Crítica» y 8 min → **Lanzar escenario**. El gemelo aísla P4: A401 en rojo con la baliza «CO₂ 1.720 ppm» | «**IoT** simulado: el sensor de A401 envía lecturas firmadas a la **API** en Cloudflare, que las guarda en **D1**. La franja ya marca Sensor → API → Reglas.» |
| 0:50–1:40 | Integrante 2 | Mientras el cron trabaja: **Recorrido guiado** (aérea → fachada → atrio → piso → aula). Pulsar **Pausar** y luego **Reanudar** una vez | «El edificio está modelado en **Blender** por script y se visualiza con **Three.js**: 10 pisos, atrio con escaleras y núcleo de ascensores. Es un modelo aproximado, sin planos.» |
| 1:40–2:30 | Integrante 3 | Salir del recorrido. En la franja: **Bot → Incidencia → IA** completados. Abrir **Incidencias** → «CO2 critico en Aula A401»: causa, acciones, evidencia, `gpt-oss-20b` y latencia. Volver y pulsar **Restablecer vista**: **ventana de A401 roja en la fachada** | «El **bot RPA** corre cada minuto: detectó CO₂ sostenido, abrió una sola incidencia y pidió el diagnóstico a la **IA**: **Workers AI con gpt-oss-20b**, un modelo de OpenAI servido por Cloudflare, que **no es la API oficial de OpenAI**. El prompt exige JSON validado y citar evidencia.» |
| 2:30–3:05 | Integrante 3 | **Asistente**: «¿Cuál es el espacio más ocupado respecto a su aforo?» y luego «¿Qué incidencias activas hay y cuál es su gravedad?» → **Ver en el gemelo** | «Los rankings y porcentajes los calcula el backend; la IA solo redacta. Si la redacción contradice el cálculo, se descarta. Cita el espacio y mueve la cámara.» |
| 3:05–3:40 | Integrante 4 | **Primera persona**: desde el hall de P1, W para cruzar la puerta central hasta el atrio; arrastrar para mirar; RePag hasta P4; Esc para salir | «Para la **TA5**, recorrido en primera persona sobre el mismo modelo: WASD, ratón o táctil y colisiones con muros, tabiques, atrio y núcleo. Es la alternativa **web**: no es Unity.» |
| 3:40–4:15 | Integrante 4 | **S25 Ultra**: `/ar` → Nivel A (esperar el aro cian, tocar para colocar la maqueta y tocar un espacio). Si falla: Nivel B (Scene Viewer). Mostrar `/reloj` | «**Realidad aumentada** WebXR con los colores en vivo. Si la superficie no se detecta, Scene Viewer. La vista de reloj resume la alerta más grave.» |
| 4:15–4:45 | Integrante 5 (o 1) | GitHub Actions: run en verde (gitleaks, pruebas, e2e con Docker Compose, imagen del simulador). `/sistema`: commit y consumo de IA. Volver a Demostración → **Restaurar** (A401 vuelve a normal) | «**CI/CD**: cada push ejecuta 349 pruebas, e2e en **Docker** y escaneo de secretos. El despliegue se hace con respaldo de la base y rollback.» |
| 4:45–5:00 | Integrante 1 | Centro de mando de nuevo en verde | «Impacto: detección y diagnóstico en 1–2 minutos y una vista unificada del campus. Limitaciones: datos simulados, modelo aproximado y TA5 en web. Gracias.» |

**Reparto:** si el grupo tiene 3 integrantes, el 4 lo asume el 2 y el 5 lo asume el 1. La participación debe ser equitativa (criterio 8).

## Contingencias (ensayarlas)
| Situación | Respuesta |
|---|---|
| La incidencia tarda | Seguir con el recorrido; aparece en 1–2 ciclos del cron, como máximo 2 min |
| Se agota la cuota de IA | El diagnóstico sale «Respaldo por reglas (sin IA)», rotulado. Explicarlo como diseño de resiliencia |
| Sin Wi-Fi | Hotspot del S25 |
| Sin internet | `docker compose up` en la laptop (modo local, IA «sin IA» rotulada) |
| AR nivel A no detecta superficie | Nivel B (Scene Viewer) o nivel C (3D, que no es AR) |
| Falla todo | Grabación de respaldo **rotulada con su fecha**, nunca presentada como en vivo |

## Al terminar
- Pulsar **Restaurar** para dejar producción en estado normal.
- Comprobar «Sin alertas activas».
- Video final: MP4, menos de 5:00 y con buena resolución.
- **No** mostrar en pantalla tokens, el panel de Cloudflare ni datos personales.
