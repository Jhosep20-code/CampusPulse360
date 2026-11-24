# Auditoría de rúbricas, estado real y decisión técnica (23/24-nov-2026)

Fuentes: `docs/requisitos/RUBRICA_PROYECTO_FINAL.pdf` y `docs/requisitos/TA5_INDICACIONES Y RUBRICA__96SI.pdf` (leídos completos), GitHub (API pública), producción (HTTP, wrangler) y D1 de producción (consultas de solo lectura). **V** = verificado hoy; **D** = solo documentado.

## 1. Proyecto Final: criterios con texto y puntaje originales (20 pts)
| # | Criterio original (máx.) | Estado | Puntaje justificable | Evidencia | Qué falta para el máximo | Riesgo de interpretación |
|---|---|---|---|---|---|---|
| 1 | Planteamiento del problema y objetivo (2) | Cumple | 1,5–2 | `INFORME_FINAL.md` §1–2: objetivos medibles con resultados medidos (V) | Una justificación de "relevante y actual" con contexto verificable (sin inventar cifras) | El problema puede parecer genérico si no se contextualiza la sede |
| 2 | Aplicación de tecnologías del curso (3) | Cumple | 3 | Los 5 ejes encadenados en producción: 1.441 ejecuciones del bot en 24 h, 14.343 lecturas, diagnósticos IA y gemelo (V) | Que la demo muestre la cadena completa en vivo y en espacios variados | IoT simulado (la consigna admite "problema real **o simulado**"); AR sin demostración física |
| 3 | Desarrollo técnico del prototipo (3) | Cumple | 3 | Monorepo modular (api/web/contracts/simulator/e2e); 273 pruebas unitarias e integración y 15 e2e (V, en local); CI verde en el HEAD (V) | Variedad de incidencias: hoy las 6 históricas son de `SPC_3_A301` (V) | Una demo centrada en A301 puede leerse como "solución parcial" |
| 4 | Uso de herramientas CI/CD y contenedores (3) | Cumple | 3 | Actions en `6835dd0`: gitleaks, tipos/pruebas/build, e2e con Docker Compose e imagen del simulador en verde; deploy *skipped* por diseño (V) | Mostrar en la demo una ejecución de Actions y explicar el deploy condicionado | El deploy a producción se hace con wrangler manual (con rollback); el job de deploy existe pero está desactivado (`DEPLOY_ENABLED`) |
| 5 | Aplicación de IA y prompt engineering (3) | Cumple con riesgo | 2–3 | Workers AI `@cf/openai/gpt-oss-20b` en el asistente (11 llamadas), el diagnóstico (7 live + 1 respaldo) y el reporte (1); prompts versionados y JSON validado (V) | Ninguno técnico. Aclarar el proveedor con el docente | La consigna dice "con **APIs de OpenAI**". Workers AI con un modelo de pesos abiertos de OpenAI **no es** la API oficial de OpenAI (ADR-002). Un evaluador estricto podría bajar a 2 |
| 6 | Interfaz (Web, AR/VR, Streamlit, etc.) (1,5) | Cumple | 1–1,5 | SPA con datos cada 10 s, gemelo de Blender, AR de 3 niveles, `/reloj`; S25 web y gemelo probados por el equipo (D, reporte del usuario) | Demostrar la AR (nivel A o B) en el S25 sin fallos | La AR nivel A no tiene prueba física tras la corrección |
| 7 | Informe técnico (1,5) | Parcial | 1 | `INFORME_FINAL.md` con estructura, arquitectura, resultados e impacto (V) | Datos del grupo y conclusiones (`[completar]`), capturas **incrustadas** y exportación a PDF o Word | En Markdown con rutas a capturas puede leerse como "pocos esquemas/capturas" |
| 8 | Presentación final (1,5) | Pendiente | — (no evaluable aún) | `GUION_DEMO_5MIN.md` (V) | Ensayo con participación equitativa; **video de máx. 5 min (entregable 3) no existe** | Depende del equipo |
| 9 | Creatividad e innovación (1,5) | Cumple | 1–1,5 | Gemelo conversacional (`focus_spaces`), AR con telemetría, passkeys con vinculación, modelo reproducible por script (V) | Mostrarlo explícitamente en la demo | Subjetivo |

**Total justificable hoy (sin el criterio 8):** 15,5–18 de 18,5. No se puede estimar una nota final sin la presentación.

**Entregables de la consigna:**
- ZIP `PROFINAL_U5_GRUPO_#`: ⏳
- Propuesta inicial: **no está en el repositorio** (¿ya se entregó?)
- Informe: 🟡
- Video de máx. 5 min: ⏳ **no existe**
- Código: ✅
- Sustentación: ⏳

## 2. Correspondencia con la TA5 (20 pts, 10 criterios de 2)
| Criterio TA5 | ¿Lo cubre el Proyecto Final? | Estado real |
|---|---|---|
| 1 Diseñar el escenario 3D **en Unity** | No (Blender y Three.js no son Unity). El GLB/FBX de Blender es **reutilizable** como edificio | ⏳ Unity **no instalado** (V) |
| 2 Aplicar materiales y objetos 3D | Parcial conceptual (materiales PBR en Blender); debe verse en Unity | ⏳ |
| 3 Recorrido tipo FPS | No | ⏳ (scripts C# escritos sin compilar en `feature/ta5-unity`) |
| 4 Entorno VR en Unity | No (la AR web no es VR en Unity) | ⏳ |
| 5 Plugins (Meta XR SDK, OpenXR, XR Plug-in Management) | No | ⏳ |
| 6 Ejecutar y navegar el recorrido VR (simulador) | No | ⏳ |
| 7 Informe técnico | Plantilla `TA5/INFORME_TA5.md`; sin resultados reales | ⏳ |
| 8 Capturas y evidencias | No (las capturas web no son de Unity) | ⏳ |
| 9 Código limpio y organizado | Parcial (paquete C# estructurado, sin compilar) | 🟡 |
| 10 Redacción | Reutilizable en parte | ⏳ |

**Conclusión:** la TA5 **no está cubierta** por el Proyecto Final. Exige Unity, FPS, plugins XR y simulador VR. La rama `feature/ta5-unity` (commit `b50b2a5`) existe **solo en local**: no está en GitHub.

## 3. Estado actual de producción, GitHub y CI (verificado)
| Elemento | Estado |
|---|---|
| Ramas | `feature/hito-2` local = origin = `6835dd0`; `main` = `6dd17a4` (21-nov), 30 commits detrás; `feature/ta5-unity` solo local |
| PR #1 | Abierta, sin fusionar, `mergeable: clean`. **La descripción en GitHub es la antigua** (no se ha pegado `PR-hito-2.md`) |
| CI en el HEAD `6835dd0` | ✅ gitleaks, tipos/pruebas/build, e2e Docker y imagen del simulador; deploy *skipped* (solo en `main` con `DEPLOY_ENABLED`) |
| Producción | `207d3808` (commit `252de1f`) al 100 %. `6835dd0` solo añade documentación, así que el código de GitHub y el desplegado son equivalentes. Rollback disponible a `3d66c483` |
| Health / info | `db: true`, `ai: available`, `commit 252de1f`, 23 llamadas de IA hoy (~407 neuronas, ~4 % de 10k) |
| Cron | `incident-bot`: 1.441 ejecuciones en 24 h, todas `success` (una por minuto). `report-bot`: diario (último 23-nov, 07:00 hora de Perú) |
| D1 (24 h) | 21.097 filas escritas (~21 % del límite Free), 486.054 leídas (~10 %), 1,72 MB |
| Simulador IoT | 10 dispositivos activos; 557 lecturas `sim` en la última hora y 22 `sim-scenario`. Los 10 espacios en `ok` al momento de la consulta |
| Incidencias históricas | 6, todas resueltas y **todas en `SPC_3_A301`** (CO₂ crítico 3, CO₂ alto 1, sobreaforo 2) |
| IA | Todas las funciones (asistente, diagnóstico y reporte) con `workers-ai` / `@cf/openai/gpt-oss-20b`; 1 diagnóstico cayó al respaldo por reglas. Sin `OPENAI_API_KEY` |
| Passkeys | **1 administrador** registrado el 23-nov a las 20:30 (hora de Perú); token de arranque **consumido**; código de vinculación usado a las 20:39 y **2 passkeys** (la segunda con transportes `hybrid, internal`, perfil típico de Android). Uso de escenarios (×2) y reglas (×2) como admin. Sin eventos `auth.login` todavía |
| AR nivel A | Corrección en código con 5 pruebas unitarias. **Sin prueba física** posterior a la corrección |
| AR nivel B | `utp-huancayo-ar.glb` servido (200, `model/gltf-binary`). **Sin prueba física** |
| `/reloj` | Táctil observado por el equipo (D). El **bisel físico no está implementado**: no hay manejador `wheel`, solo toques, botones y flechas de teclado (V en código) |

## 4. Diagnóstico: arquitectura 3D y ampliación IoT
### IoT: ¿instrumentar más de 70 ambientes o un subconjunto?
| | A. Los ~73 ambientes con sensor virtual | B. Todos los recintos en 3D; ~20 instrumentados (2 por piso) |
|---|---|---|
| D1 Free (100k filas/día) | Proyección **~154k filas/día** (21.097 medidas ÷ 10 dispositivos × 73): **supera el límite**. Obliga a muestrear cada 5 min | ~42k filas/día (~42 %) con lectura por minuto |
| Gemelo | ~73 volúmenes `SPC_*` (una draw call cada uno en modo datos) | ~20 volúmenes; el resto es geometría sin sensor |
| Rúbrica | No suma puntos: la rúbrica pide integración, no cantidad | Igual, y la demo puede variar de espacio |
| Demo | Ruido visual | Cada piso con al menos un espacio vivo; incidencias en cualquier piso |
| Riesgo y complejidad | Alto | Moderado |

**Recomendación: B.** Además, generalizar los escenarios, que hoy están fijos en A301 y LAB2:
- escenario para cualquier espacio instrumentado;
- tipos: CO₂, temperatura, sobreaforo, consumo y **sin conexión**;
- "normalizar" que restaure el estado.

No hace falta tocar el esquema para lo básico: `scenario_overrides` ya existe. El estado "sin conexión" requiere que el simulador en la nube omita ese dispositivo mientras dure el escenario.

### Edificio: respuestas
1. **¿Recintos independientes en Blender sin rehacer la fachada?** Sí. `build_rooms` genera los ambientes dentro de cada `FLOOR_Pxx`, y la fachada es el grupo `FACADE`, independiente. Tabiques y puertas pueden fusionarse por material y piso (clases MATTE/METAL), con un coste de draw calls casi nulo.
2. **¿Cómo conservar las relaciones?** El contrato es `spaces.mesh_id = nombre del nodo GLB SPC_<piso>_<CÓDIGO>`, `devices.space_id`, `incidents.space_id` y `/live` por espacio. Basta con que cada recinto instrumentado tenga su `SPC_*` con el mismo nombre que en D1.
3. **¿Cómo no romper A301?** **No renombrar** IDs existentes: tienen lecturas, incidencias, dispositivos, pruebas e2e y AR asociados. Asignar cada espacio heredado a un recinto del plano (por ejemplo, `SPC_3_A301` se dibuja en el recinto 0301 y se rotula «0301 · A301») y crear los nuevos como `SPC_3_0302…`, que el patrón `SPC_\d{1,2}_[A-Z0-9]{2,12}` ya admite. Cambios en D1 solo **aditivos** (nuevos `spaces`/`devices`).
4. **¿Versiones ligeras para móvil y AR?**
   - LOD1: tabiques sin marcos ni mobiliario.
   - AR: sin tabiques interiores, que no se ven desde fuera.
   - Volúmenes `SPC_*` solo para los instrumentados.
5. **Aproximaciones vigentes:**
   - medidas de planta, atrio y pasillos;
   - **número y posición de los núcleos de ascensores** (hoy uno al este; el equipo dice dos grupos enfrentados de 3);
   - **lado y forma de las escaleras** (v3 las infiere en el borde oeste; el equipo describe tramos alternos entre lados enfrentados);
   - posición del acceso;
   - distribución y puertas de los recintos.

   Hay contradicción parcial entre referencias: la foto frente al muro de ascensores no muestra tramos delante. **No conviene mover otra vez ascensores y escaleras sin un croquis del equipo.**

## 5. Tareas priorizadas para el viernes 27
**Indispensables para la nota:**
1. Video de máx. 5 min (entregable 3).
2. Informe: datos del grupo, conclusiones, capturas incrustadas y exportación a PDF o Word. ZIP `PROFINAL_U5_GRUPO_#`.
3. Confirmar o preparar la propuesta inicial (entregable 1).
4. Ensayar la presentación con participación equitativa.
5. Prueba física de la AR (nivel A o B) en el S25 antes de la demo.
6. Pegar la descripción de la PR #1 y decidir si se fusiona a `main` (CI verde; la fusión no despliega mientras `DEPLOY_ENABLED` no sea `true`).

**Importantes para la demo:**
7. Escenarios generalizados (cualquier espacio y 4–5 tipos, entre ellos "sin conexión") con restauración. Cambio en API, simulador en la nube y UI de admin; sin migración destructiva.
8. Pasar de 10 a ~20 espacios instrumentados (2 por piso): migración aditiva, simulador y `SPC_*` en Blender.
9. Bisel en `/reloj` (manejador `wheel`), si se usará el Watch.

**Solo visuales (después):**
10. Tabiques de los 10 recintos por piso típico.
11. Segundo núcleo de ascensores y nueva disposición de escaleras (necesita el croquis).
12. Reflejos del vidrio y volúmenes laterales.

**Puede romper algo:**
- renombrar IDs;
- migraciones que modifiquen o borren `spaces`, `devices` o `readings`;
- instrumentar más de ~30 dispositivos a 1 lectura por minuto (límite de escrituras D1);
- muchos `SPC_*` (draw calls en modo datos);
- mover el núcleo o las escaleras (encuadre del Atrio, cámaras y pruebas visuales).

## 6. Dudas para el equipo o el docente
1. **Equipo:** croquis de una planta típica (con norte o la calle como referencia): en qué lados están los dos grupos de ascensores, en qué bordes y niveles los tramos de escalera, y cuántos recintos hay por lado.
2. **Equipo:** ¿0301–0310 son números reales de aula? ¿A qué recinto corresponde hoy «A301»? ¿Cuántos ambientes hay en P1, P2 y P5 y de qué tipo?
3. **Equipo:** ¿ya se entregó la propuesta inicial? Número de grupo, integrantes y reparto de la exposición.
4. **Docente:** ¿Workers AI con `gpt-oss-20b` (modelo de OpenAI, no su API) satisface el eje "APIs de OpenAI"?
5. **Docente:** ¿la TA5 exige Unity con Meta XR SDK, o basta OpenXR con el simulador de dispositivos de XRI? ¿Se acepta el edificio de Blender importado?
6. **Equipo:** ¿el Watch6 tiene un navegador instalado para `/reloj`? ¿Es necesario el bisel en la demo?

## 7. Recomendación
- **No tocar:**
  - autenticación;
  - IDs `SPC_*` actuales;
  - esquema D1 existente;
  - cadena IoT → cron → IA;
  - fachada y materiales v3.1;
  - optimizaciones de draw calls;
  - GLB de AR.
- **Implementar primero:** escenarios generalizados (punto 7) y ampliación a ~20 espacios instrumentados (punto 8). Es lo que más mejora los criterios 2, 3 y 8 con riesgo controlado y migraciones solo aditivas.
- **Después:** las divisiones del edificio, empezando por los recintos de los pisos típicos, que no dependen de la posición de ascensores y escaleras. El núcleo y las escaleras, solo con el croquis.
- **En paralelo (equipo):** video, informe, ensayo, prueba física de la AR y decisión sobre la TA5 (Unity) según el tiempo disponible.
