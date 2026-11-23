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
