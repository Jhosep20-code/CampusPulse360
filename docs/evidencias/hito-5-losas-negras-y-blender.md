# Evidencias — Losas negras al aislar pisos y modelo real de Blender

- **Fecha:** 23-nov-2026
- **Rama:** `feature/hito-2`
- **Commits:** `c361d19` (corrección, máquina de estados y modelo Blender) y `22d4e80` (visor con GLB)

## 1. Defecto "losas negras" (P1–P10)
**Causa raíz comprobada:**
- En `Batches → apply → place` (`CampusTwin.tsx`), un piso oculto recibía escala Y = 0 conservando X y Z (`DUMMY.scale.set(sx, 0, sz)`).
- Cada caja se convertía en un plano de tamaño completo sobre la base del piso.
- El shader de instancing de three (`defaultnormal_vertex`, verificado en `node_modules/three`) hace `transformedNormal /= vec3(dot(im[0],im[0]), dot(im[1],im[1]), dot(im[2],im[2]))`. Con escala Y = 0 la división produce Inf/NaN y la superficie queda negra, además de proyectar sombra y recibir raycast.
- Afectaba a cualquier piso aislado, no solo a P6 y P9.

**Corrección general:**
- `instancing.ts`: un piso oculto recibe matriz nula en los 3 ejes, sin rasterización, sombra ni raycast. En la transición la escala Y nunca baja del 5 %, así que la normal es finita.
- Se recalcula la esfera envolvente después de cada actualización.
- Los volúmenes de espacio de otros pisos no se dibujan.

**Máquina de estados** (`view-state.ts`, con `CommandCenter` como única fuente de verdad):
- Referencia muestra el modelo completo y limpia el aislamiento, la explosión y el modo datos.
- Atrio muestra el modelo completo en corte.
- Aislar un piso o explotar estando en Atrio o Referencia devuelve la vista a Fachada.
- "Restablecer vista" quita aislamiento, explosión, corte y modo datos, y vuelve a la cámara inicial.

**Pruebas que fallaban antes y pasan después:**
- `instancing.test.ts` reproduce la lógica anterior: plano de 38×30 m con normal no finita.
- Prueba visual WebGL sobre fotogramas reales, con un 8 % máximo de píxeles negros:

| Vista | Antes | Después |
|---|---|---|
| P6 aislado | 55,2 % | 0,7 % |
| P9 aislado | 39,0 % | 0,7 % |

- Capturas: `docs/entregables/FINAL/capturas/visual-p6-ANTES.png`, `visual-p6.png`, `visual-p9-ANTES.png` y `visual-p9.png`.

**Batería P1–P10 con inspector geométrico** (`?visualtest`): por cada estado comprueba 0 instancias degeneradas y 0 instancias visibles de otros pisos, que solo se dibujen los espacios del piso aislado y que la fracción de píxeles negros sea menor del 8 %.

| Bloque | Escritorio | Móvil (412×915) |
|---|---|---|
| P1–P10 aislados desde el estado inicial, con restablecimiento | Superado | Superado (aislados) |
| B2: transiciones consecutivas y no consecutivas | Superado | — |
| B3/B4: vistas, explosión, incompatibles, Referencia y Atrio | Ver sección 4 | — |

Hoja de capturas: `capturas/pisos/hoja-P1-P10-escritorio.png`.

**Configuración de prueba:** Chromium headless con WebGL por software (SwiftShader) y `prefers-reduced-motion`. Esa configuración rinde a 1–2 fps, así que no representa el rendimiento con GPU. Las primeras ejecuciones largas se atascaron por los eventos de ratón simulados con el hilo principal ocupado; se resolvió con clics directos en el DOM.

## 2. Modelo arquitectónico real (Blender 5.3)
- **Script reproducible:** `assets/3d/blender/build_utp_huancayo.py`. Se ejecuta en modo background, sin descargas ni IA, y tarda unos 2,7 minutos.
- **Fuente editable:** `assets/3d/blender/utp-huancayo.blend`.
- **GLB exportados:**

| Archivo | Tamaño | Triángulos |
|---|---|---|
| `apps/web/public/models/utp-huancayo.glb` | 1,85 MB | 37.080 |
| `utp-huancayo-mobile.glb` | 0,98 MB | 19.320 |
| `utp-context.glb` | 87 KB | — |

- **Jerarquía:** `BUILDING` > `FACADE`, `ROOF`, `ATRIUM`, `STAIRS`, `ELEVATORS`, `FLOOR_P01`…`FLOOR_P10` (lo específico de cada piso), `SPC_*` (ids del seed) y `SENSOR_ANCHORS` > `ANCHOR_SPC_*`. Validada con `validate_glb.py`.
- **Renders EEVEE** (`capturas/blender/`): exterior de día, exterior de noche (misma geometría), atrio en corte y P3 aislado.
- **Alcance del modelo:** es aproximado y está basado en fotografía, sin planos. Las fotos privadas no se incluyeron.

## 3. Visor con el GLB (verificado en navegador con GPU)
- `__twinDebug()` con el modelo completo: `source: "glb"`, **61 draw calls** (`renderer.info`), 61.828 triángulos dibujados, 0 mallas degeneradas, los 10 pisos visibles y los 10 `SPC_*`.
- **P3 aislado:** 20 mallas de P3 y 0 de los demás pisos, con los espacios A301 y LAB1 y 0 degeneradas.
- **P8 aislado:** 16 mallas de P8 y 0 de los demás, con el rótulo "sin espacios instrumentados".
- **Atrio:** limpia el aislamiento (el selector vuelve a "Todos") y muestra el corte con el núcleo de 3 ascensores, las barandas y los pisos.
- **Noche:**
  - La línea LED de la coronación se encendía, pero las ventanas no: quedaban detrás de un vidrio casi opaco.
  - Corrección: el vidrio pasa a ser translúcido de noche y las ventanas tienen una luz de servicio mínima. El brillo de P1–P5 sigue la ocupación simulada.
- **Aislamiento con GLB:** usa `visible=false` del grupo `FLOOR_Pxx`, sin escalar matrices.

## 4. Validación con GPU e interacción real (navegador integrado, build Docker con el GLB)
Se usaron clics reales (computer.left_click sobre los controles accesibles) y form_input en el selector. En cada paso se leyó el inspector geométrico:

| Secuencia | Resultado |
|---|---|
| Todos → P6 → Atrio → Fachada → Referencia | Atrio y Referencia limpian el aislamiento (selector "Todos"), muestran los 10 pisos y tienen 0 degeneradas. En el primer paso, P6, el GLB todavía estaba cargando (source "loading"); se repitió más abajo. |
| Todos → P9 → Explotar → Desactivar → Restablecer | P9: 16 mallas y 0 de otros pisos. Explotado: igual. Restablecer: Fachada, sin explosión, todos los pisos visibles, 0 degeneradas. |
| Todos → P5 | 19 mallas de P5, espacios AUD y OFI, encuadre correcto |
| Referencia → P9 y Atrio → P6 | **Defecto encontrado:** la cámara no encuadraba el piso, porque el preset de Fachada sobrescribía el enfoque (`capturas/glb/glb-P9-ANTES-encuadre.jpg`). **Corregido:** el encuadre del piso aislado tiene prioridad. Verificado: P9 y P6 enfocados, 0 mallas de otros pisos, 0 degeneradas. |
| Atrio → noche → día → Fachada | Correcto. Las ventanas nocturnas se veían apagadas; se corrigió y se verificó en pantalla. |

Las capturas están en `docs/entregables/FINAL/capturas/glb/`.

**Bloqueado (no superado):** los bloques automáticos B3 y B4 (combinaciones de vistas con P1–P10 en Playwright headless). Con el GLB en modo "pisos" (183 mallas y planos de recorte), el WebGL por software (SwiftShader) bloquea el hilo principal y la página no procesa eventos ni JavaScript en 10 minutos. Se registran como **pendientes en un navegador con GPU**. Las combinaciones críticas se validaron a mano con GPU (tabla anterior), pero **no** las 10×5 combinaciones completas.

## 5. Pruebas automáticas (salida real)
- **Unitarias e integración:** 257 (contratos 9, simulador 10, web 161, API 77).
- **e2e contra el stack Docker con el GLB:** 15 aprobadas y 3 omitidas a propósito.
- **gitleaks:** "no leaks found".

## 6. Pendiente
- Medir fps con GPU real en el Galaxy S25 Ultra y en el portátil.
- Probar la AR (Scene Viewer con el GLB móvil, y WebXR) en el S25.
- Pulir el brillo nocturno de P1–P5.

## 7. Despliegue (23-nov-2026)
- Version anterior de reserva: `b23b261c-abe9-4756-8429-d1987e28952a` (commit 4bac699). Para volver: `npx wrangler rollback b23b261c-abe9-4756-8429-d1987e28952a` desde apps/api.
- Version desplegada: `4852654b-796a-4af4-827d-febc1813084a` (commit 9c453f6).
- Verificado en produccion con GPU: source glb, 61 draw calls, 0 degeneradas; P6 aislado con 16 mallas y 0 de otros pisos (`capturas/glb/produccion-glb-*.jpg`).

## 8. Modelo Blender v2 integrado en el visor (23-nov-2026, local, GPU)
**Cambios del modelo (v2, rasgos contrastados con los videos oficiales; medidas estimadas):** tramos de escalera abiertos en zigzag dentro del atrio, muro negro de ascensores frente al atrio con 3 puertas e indicadores por nivel, juntas de panel en la fachada y la coronación, y materiales nuevos. Renders y comparación: `docs/entregables/FINAL/capturas/blender/` (`comparacion-v1-v2.png`, `escaleras.png`, `ascensores.png`; v1 en `v1/`).

| Métrica (build-report.json) | v1 | v2 |
|---|---|---|
| GLB escritorio | 1,85 MB · ~37k triángulos | 2,84 MB · 52.836 triángulos |
| GLB móvil | 0,98 MB · ~19k triángulos | 1,24 MB |

**Defectos encontrados al integrar v2 y corregidos:**
1. **La cubierta tapaba P10 aislado.** La cubierta se fusiona con el último piso y solo se ocultaba el cielo raso. Ahora las piezas de cubierta llevan `part: "roof"` y se ocultan siempre que hay un piso aislado. Hay una prueba de regresión en `glbBuild.test.ts`.
2. **El entorno distraía en los pisos aislados.** Los edificios vecinos del contexto urbano entraban en el encuadre de P10. Con un piso aislado ahora solo quedan el suelo, la vereda y la calle.

**Verificación con GPU en el navegador integrado** (Vite local, 1440×900; clics reales en los botones y `form_input` en el selector). Valores del inspector `__twinDebug`:

| Paso | Resultado |
|---|---|
| Aislar P10 | 0 mallas de otros pisos, 0 degeneradas, 47 draw calls, 9.280 triángulos; interior visible (hueco del atrio, claraboya, núcleo) y sin vecinos |
| Aislar P9 | 0 de otros pisos, 0 degeneradas, 49 draw calls |
| Aislar P1 | Espacios `SPC_1_BIB` y `SPC_1_LOBBY` dibujados, 0 de otros pisos, 55 draw calls |
| Clic en Atrio | Aislamiento limpiado, preset `atrium`, escaleras, muro de ascensores y baliza A301 visibles, 62 draw calls |
| Clic en Pisos explotados (desde Atrio) | Pasa a Fachada y explota el edificio; 0 degeneradas, **458 draw calls** (ver riesgo) |
| Clic en Referencia → Restablecer vista | Referencia limpia la explosión; Restablecer deja Fachada, sin aislamiento ni explosión, 73 draw calls |
| Móvil 375×812, aislar P10 | LOD móvil, 32 draw calls, 4.696 triángulos, 0 degeneradas, 0 de otros pisos |

**Riesgos registrados (no resueltos):**
- La vista **explotada** dibuja unas 458 draw calls, porque cada piso se dibuja con sus rebanadas. Es una vista transitoria, pero puede bajar los fps en el S25. Hay que medirla en el dispositivo.
- La vista completa de Fachada usa 73 draw calls, por encima de la meta de 60.
- En el móvil emulado con el panel oculto, el GLB tardó unos 45 s en aparecer: con la pestaña en segundo plano no se puede medir el tiempo de carga real.
- ~~`campus-ar.glb` (Scene Viewer) sigue exportándose desde el gemelo procedural~~. **Corrección (sección 10):** la AR ya cargaba el GLB móvil de Blender desde el commit 22d4e80; `campus-ar.glb` era un archivo huérfano.

## 9. Despliegue del modelo v2 (23-nov-2026, 13:25 aprox.)
- **Regresión previa (local):**
  - 258 pruebas unitarias e integración: contratos 9, API 77, web 162, simulador 10.
  - e2e contra el stack Docker reconstruido con el GLB v2: 15 aprobadas y 3 omitidas a propósito.
  - gitleaks sobre lo preparado: sin hallazgos.
- **Versión desplegada:** `fdf7a207-5ad4-4a89-a47d-1daae54a2b9f` (commit 3e99078), con las mismas variables que la anterior (`CLOUD_SIM=on`, `ENVIRONMENT=production`, host de passkeys).
- **Rollback:** a la versión anterior con `npx wrangler rollback 4852654b-796a-4af4-827d-febc1813084a` desde apps/api.
- **Verificado en producción:**
  - `/system/health` ok, con `commit 3e99078`.
  - `/`, `/ar`, `/reloj`, `/acceso`, `/incidencias` y `/asistente` responden 200.
  - GLB de escritorio 2.843.452 bytes y móvil 1.242.076; `/live` con datos simulados.
- **GPU en el navegador integrado, con clics reales:**
  - Fachada: source glb, 73 draw calls, 0 degeneradas.
  - P10 aislado: 47 draw calls, 0 de otros pisos, sin cubierta ni vecinos.
  - Atrio: 62 draw calls.
  - Restablecer: Fachada, sin aislamiento ni explosión.

## 10. Modelo Blender v3: corrección arquitectónica y rendimiento (23-nov-2026, local)
**Estado real antes de empezar:**
- La PR #1 está abierta y sin fusionar.
- CI del commit bb4d89e completo y en verde. La ejecución sobre 3e99078 se canceló porque la reemplazó el siguiente push.
- En producción, la versión fdf7a207 atiende el 100 % del tráfico.

**Arquitectura:** la matriz completa está en `docs/referencias/matriz-correspondencia-v3.md`.
- **Fachada:** paño blanco a la izquierda, 7 franjas, marco y coronación grises, y marca UTP simplificada.
- **Atrio:** bandas gris azulado de 0,9 m, sin pilares de esquina, indicadores rojos, señalética y barandas de 4 tubos.
- **Escaleras:** en zigzag, en dos carriles del borde oeste, con descansos en las esquinas. Su posición es **inferida**.

**Comparación antes/después:**
- Privada, con fotos: `docs/referencias/utp-huancayo/comparaciones-privadas/` (ignorada por git).
- Pública, solo renders: `capturas/blender/comparacion-v2-v3.jpg`. Las vistas del mismo punto de vista que las referencias son `ref-exterior.png`, `ref-ascensores.png` y `ref-escaleras.png`.

| GLB (build-report.json) | Triángulos | Tamaño | Mallas en el GLB |
|---|---|---|---|
| Escritorio (LOD0) | 54.084 | 2,91 MB | 237 |
| Móvil (LOD1) | 23.476 | 1,28 MB | 207 |
| **AR (nuevo, desde Blender)** | 20.140 | 1,10 MB | 29 (una por material más los 10 `SPC_*`) |

**Reducción de draw calls (sin perder P1–P10 ni `SPC_*`):**
1. **Clases de fusión en el visor (`MERGE_CLASS`):** los materiales opacos sin control de opacidad ni emisión se dibujan como `MATTE` o `METAL`, con el color original como color de vértice.
2. **Elementos compartidos cortados por franja en Blender (`band_level`):** el visor dibuja cada tramo con su piso en lugar de 10 copias recortadas por *clipping planes*. La claraboya pasa a la cubierta.

Medido con GPU en el navegador integrado (inspector `__twinDebug`; clics reales en Pisos explotados, Atrio y Restablecer, y `form_input` en el selector):

| Vista | v2 | v3 escritorio | v3 móvil (375×812) |
|---|---|---|---|
| Fachada completa | 73 | **43** | **29** |
| Pisos explotados | 458 | **222** | **141** |
| P10 aislado | 47 | **25** | **19** |
| P1 aislado | 55 | **27** (BIB y LOBBY dibujados) | — |
| Atrio | 62 | **33** | — |

En todas las vistas hubo 0 matrices degeneradas y 0 mallas de otros pisos al aislar.

**AR:**
- Scene Viewer (nivel B) y la AR web (nivel A) usan ahora `utp-huancayo-ar.glb`, exportado por Blender desde la misma fuente:
  - LOD móvil fusionado por material;
  - sin ventanas nocturnas ni luminarias encendidas, que Scene Viewer mostraría como paneles blancos;
  - maqueta 1:60, Y arriba, base en y = 0.
- El nivel A mide el ancho del modelo para su control de tamaño.
- Se eliminaron `campus-ar.glb` y su script procedural.
- **Pendiente en dispositivo:** escala, orientación y materiales en Scene Viewer del Galaxy S25 Ultra. Es una maqueta estática y no muestra telemetría; la telemetría en vivo solo está en el nivel A.

**Medir en el S25 Ultra (pendiente):**
1. Abrir la demo en Chrome con `?visualtest=1`.
2. Conectar el teléfono por USB con depuración activada y abrir `chrome://inspect` en el PC.
3. En la consola, `__twinDebug()` da `drawCalls` y `triangles`; Rendimiento → FPS meter da los fps.
4. Repetir con Fachada, Pisos explotados y P10.
5. Para la AR, abrir `/ar` → nivel B y anotar escala, orientación y materiales.

## 11. Despliegue del modelo v3 (23-nov-2026, 17:20 aprox.)
- **Regresión previa (local):**
  - 260 pruebas unitarias e integración: contratos 9, API 77, web 164, simulador 10.
  - Tipos sin errores.
  - e2e contra el stack Docker reconstruido con v3: 15 aprobadas y 3 omitidas a propósito; el stack sirve `utp-huancayo-ar.glb` con 200.
  - gitleaks sobre lo preparado: sin hallazgos.
- **Versión desplegada:** `3d66c483-bf84-4d5a-a3ab-72f2046f3883` (commit b760757), con las mismas variables que la anterior.
- **Rollback:** a la versión anterior con `npx wrangler rollback fdf7a207-5ad4-4a89-a47d-1daae54a2b9f` desde apps/api.
- **Verificado en producción:**
  - `/system/health` ok, con `commit b760757`.
  - `/`, `/ar`, `/reloj`, `/acceso`, `/incidencias` y `/asistente` responden 200.
  - GLB de escritorio 2.914.500 bytes, móvil 1.277.204 y AR 1.104.356, todos `model/gltf-binary`.
  - `campus-ar.glb` ya no existe: devuelve la SPA.
- **GPU con clics reales:**
  - Fachada: 43 draw calls, 0 degeneradas.
  - P10 aislado: 25 draw calls, 0 de otros pisos.
  - Atrio: 33 draw calls.
  - `/ar` detecta el GLB de AR.
