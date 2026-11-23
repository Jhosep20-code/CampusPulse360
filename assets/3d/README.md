# Modelo 3D de CampusPulse 360

Este directorio documenta el contrato entre Blender y el gemelo digital web.
El gemelo (`apps/web/src/twin`) usa hoy una geometria **procedural provisional**.
Se sustituye por un GLB de Blender poniendo su ruta en `MODEL_URL`
(`apps/web/src/twin/constants.ts`), sin cambiar codigo.

## Estado actual

- Hay una foto exterior real y fotos interiores del equipo (privadas, no versionadas). No hay planos.
- La sede tiene **10 pisos (P1-P10)**, dato del equipo. Huella (~38 x 30 m), alturas (P1 ~4,8 m;
  P2-P10 ~3,6 m) y reticula del muro cortina son **ESTIMACIONES** a partir de la fotografia.
  Ver `docs/referencias/especificacion-3d.md`.
- El visor muestra el rotulo "Modelo representativo · geometria provisional" mientras
  `building.geometry_provisional` sea `true` o no exista GLB.

## Regla: observado vs. estimado

- **Observado/verificado**: solo lo que salga de fotos, planos o mediciones de la UTP Huancayo con
  fuente identificable (anotarla en el archivo `.blend` o en un registro de fuentes).
- **Estimado**: cualquier otra cosa. Debe quedar rotulada como tal (comentario, nombre de coleccion
  `EST_*`, o nota en este archivo) y nunca presentarse como medida real.
- Una escena 3D con datos simulados **no es** AR ni una medicion. Los datos de sensores actuales son
  simulados; el visor ya lo indica con la bandera `simulated` del snapshot.

## Contrato de nombres

Cada espacio del seed/D1 tiene un `mesh_id` con la forma `SPC_<piso>_<codigo>`
(regex `^SPC_\d{1,2}_[A-Z0-9]{2,12}$`):

| mesh_id        | Espacio                    |
| -------------- | -------------------------- |
| `SPC_1_LOBBY`  | Hall de ingreso            |
| `SPC_1_BIB`    | Biblioteca                 |
| `SPC_2_A201`   | Aula A201                  |
| `SPC_2_A202`   | Aula A202                  |
| `SPC_3_A301`   | Aula A301                  |
| `SPC_3_LAB1`   | Laboratorio de computo     |
| `SPC_4_A401`   | Aula A401                  |
| `SPC_4_LAB2`   | Laboratorio de IoT         |
| `SPC_5_AUD`    | Auditorio                  |
| `SPC_5_OFI`    | Oficinas administrativas   |

Reglas:

1. Cada espacio es **una malla** (un objeto `Mesh`) cuyo nombre es exactamente su `mesh_id`.
   Los sufijos de duplicado de Blender (`.001`) se ignoran al cargar.
2. La malla `SPC_*` es el **volumen** del ambiente (una caja o prisma cerrado). El visor la colorea y la
   hace seleccionable; su material original se descarta, asi que no hace falta texturizarla.
3. Todo lo que no empiece por `SPC_` se trata como **fachada/estructura** y se muestra tal cual.
4. Opcional, para la vista "pisos separados": agrupar la fachada de cada piso en un nodo de primer nivel
   llamado `FLR_<piso>` (p. ej. `FLR_3`). Esos nodos se desplazan en vertical con su piso; el resto de la
   fachada queda fija. Sin estos nodos, solo los volumenes `SPC_*` se separan.
5. Un `mesh_id` nuevo exige primero agregar el espacio en el seed/D1 (`apps/api/migrations`).
   Mallas `SPC_*` sin espacio en el campus se ignoran; espacios sin malla no se dibujan.

## Convenciones de exportacion GLB

- **Y arriba**, unidades en **metros**, escala 1:1, origen del edificio en el centro de la huella a nivel de suelo.
- Aplicar (Ctrl+A) rotacion y escala a todos los objetos antes de exportar; las transformaciones deben
  estar horneadas en la geometria o ser simples.
- Exportar glTF Binary (`.glb`) con **compresion Meshopt**. No usar Draco: su decodificador por defecto se
  descarga de un CDN externo y el proyecto no depende de recursos remotos.
- Texturas: **WebP** (2K como maximo; 1K recomendado). KTX2/Basis es opcional y requiere alojar localmente
  el transcodificador y configurar `KTX2Loader` (pendiente, no esta cableado).
- Materiales PBR basicos (metal-rough). Sin luces ni camaras dentro del GLB: la iluminacion es del visor.
- Normales y UV correctas; sin geometria oculta ni duplicada; sin escala negativa.
- Ubicacion final: `apps/web/public/models/utp-huancayo.glb`; luego `MODEL_URL = "/models/utp-huancayo.glb"`.

## Presupuesto de rendimiento

| Recurso             | Maximo                                      |
| ------------------- | ------------------------------------------- |
| Peso del GLB        | <= 5 MB                                     |
| Triangulos          | <= 120 000 (incluye los volumenes SPC_*)    |
| Draw calls          | <= 60 (fusionar mallas y reutilizar materiales) |
| Texturas            | 2K maximo, WebP o KTX2                      |

Consejos: instanciar elementos repetidos (montantes, ventanas), fusionar fachada por material, evitar
transparencia en la fachada salvo el vidrio, y no modelar interiores que no se vean.
El gemelo procedural actual cuesta menos de 60 draw calls (estimacion analitica; ver `budget.ts`).

## Lista de comprobacion antes de entregar un GLB

- [ ] Los 10 `mesh_id` del seed existen y estan bien escritos.
- [ ] Peso <= 5 MB y <= 120 k triangulos (anotar el valor real medido).
- [ ] Fuentes de cada dimension verificada anotadas; el resto rotulado como estimado.
- [ ] Se probo en un movil real (rendimiento y color) antes de poner `geometry_provisional = false`.

## Modelo de Blender (fuente reproducible)

Primer modelo arquitectonico editable de la sede, **estimado a partir de fotografia** (sin planos).
Es una representacion aproximada, **no una replica exacta**. Todas las dimensiones salen de
`docs/referencias/especificacion-3d.md` y de `apps/web/src/twin/constants.ts`; ninguna es una medicion.

- Fuente: `assets/3d/blender/utp-huancayo.blend` (LOD0). Script: `assets/3d/blender/build_utp_huancayo.py`
  (bpy + bmesh, idempotente, sin descargas ni IA). Validador de GLB: `assets/3d/blender/validate_glb.py`.
- Regenerar todo (.blend, 3 GLB, 4 renders y `build-report.json`):
  `"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" --background --factory-startup --python assets/3d/blender/build_utp_huancayo.py --`
  Opciones tras `--`: `--skip-render` (solo .blend y GLB), `--only-render` (solo renders desde el .blend), `--meshopt`
  (activa `EXT_meshopt_compression`; por defecto va SIN compresion, Draco nunca).
- Validar: `python -I assets/3d/blender/validate_glb.py`.
- Salidas: `apps/web/public/models/utp-huancayo.glb` (LOD0, solo `BUILDING`),
  `utp-huancayo-mobile.glb` (LOD1: sin mobiliario, sin luminarias individuales, montantes secundarios reducidos, escaleras
  y barandas simplificadas) y `utp-context.glb` (nodo `CONTEXT`, omisible). Renders en `docs/entregables/FINAL/capturas/blender/`.
- **v3 (23-nov-2026):**
  - `utp-huancayo-ar.glb` es el GLB de AR (Scene Viewer y AR web), exportado de la misma fuente: LOD1 fusionado por material, sin `WINDOW_NIGHT` y a escala de maqueta 1:60.
  - Las piezas de todo el alto de `FACADE` y `ELEVATORS` se cortan por piso, con el extra `band_level`, para que el visor no las recorte con *clipping planes*.
  - La claraboya cuelga de `ROOF`.
  - Las vistas `ref-*.png` reproducen el punto de vista de las referencias auténticas.
  - Matriz de cambios: `docs/referencias/matriz-correspondencia-v3.md`.
- Ejes: metros, +Y arriba, origen en el centro de la huella a nivel de la planta baja, fachada principal hacia +Z.
  Todos los nodos tienen transformacion identidad (los vertices estan horneados en coordenadas del edificio), salvo los
  volumenes `SPC_*` y las anclas, que tienen su centro como origen.

### Jerarquia (nodos vacios padre, mismos nombres que las colecciones de Blender)

`BUILDING` > `FACADE`, `ROOF`, `ATRIUM`, `STAIRS`, `ELEVATORS`, `FLOOR_P01` ... `FLOOR_P10`, `SENSOR_ANCHORS`.
`CONTEXT` es una raiz aparte (no cuelga de `BUILDING`). Los objetos se fusionan por material dentro de cada grupo
(`<GRUPO>_<MATERIAL>`; las ventanas llevan ademas el codigo del espacio, p. ej. `FLOOR_P02_WINDOW_NIGHT_A201`).

| Grupo | Contenido |
| --- | --- |
| `FLOOR_Pxx` | **Todo lo especifico del piso**, para ocultarlo con `visible=false` sin escalar matrices: losa con el vacio del atrio, frentes de losa blancos del atrio, vidrio del muro cortina y sus montantes (P2-P10), planta baja con pilastras, vidrio oscuro, banda de rotulo, marquesina y puertas (P1), bandas genericas posterior/derecha, ventanas `WINDOW_NIGHT`, pasillo de porcelanato, falso cielo con luminarias, tabiques con puertas de madera, barandas de tubo en todo el borde del vacio, tramo recto abierto de escalera que une el piso con el siguiente (zancas, peldanos, fondo y barandas), puertas de acero con marco, indicador y botonera de los 3 ascensores (cara oeste del nucleo, hacia el atrio), mobiliario (solo P1 biblioteca, P2 aulas A201/A202, P3 laboratorio de computo, P4 laboratorio con mesones y pozas, P5 auditorio), el volumen `SPC_*` de cada espacio de ese piso. |
| `FACADE` | Volumenes macizos blancos continuos de todo el alto: lateral izquierdo ciego, muro posterior, lateral derecho (borde de 0,6 m) y pilastra izquierda de 4 m, con juntas horizontales de paneles (`PANEL_JOINT`). |
| `ROOF` | Losa de cubierta (con hueco bajo la claraboya), coronacion de 2,4 m, acento rojo (sin logotipo), linea LED `LED_CROWN`, caja tecnica y equipos genericos. |
| `ATRIUM` | Compartido: 4 pilares continuos en las esquinas del vacio (12 x 9 m, estimado) y claraboya. (Las barandas y frentes de losa van en cada `FLOOR_Pxx`.) |
| `STAIRS` | v2: **sin geometria** (nodo vacio). Nada es compartido: cada tramo pertenece al `FLOOR_Pxx` de su nivel inferior. |
| `ELEVATORS` | Compartido: nucleo continuo de 6 x 9 m en `CORE_BLACK`, a 2,4 m del vacio, con su cara oeste mirando al atrio. (Las puertas, indicadores y botoneras van en cada `FLOOR_Pxx`.) |
| `SPC_<piso>_<codigo>` | Los 10 volumenes del seed, hijos de su `FLOOR_Pxx`, material `SPC_VOLUME` (el visor lo sustituye). |
| `SENSOR_ANCHORS` | 10 empties `ANCHOR_SPC_*` en el centro superior de cada volumen. No se mueven con el piso: en vista explotada el visor debe sumarles el desplazamiento de su piso (`level` en los extras). |

Los objetos de piso llevan `extras.level` (1-10); los volumenes y anclas llevan `extras.space_id`.

### Materiales (nombres estables; el visor puede sustituirlos)

Los de la especificacion: `GLASS_CURTAIN`, `WHITE_PANEL`, `FRAME_DARK`, `GLASS_GROUND`, `ROOF`, `BRAND_RED`, `SLAB`,
`CORE_BLACK`, `STEEL`, `TILE`, `WOOD`, `CEILING`, `LIGHT_PANEL` (emisivo), `WINDOW_NIGHT` (emisivo #FFF1E2), `HEDGE`,
`ASPHALT`, `CONTEXT`. Adicionales: `GLASS_CLEAR`, `LED_CROWN` (emisivo), `FURN_DARK`, `SCREEN`, `BOOKS_A/B/C`, `SPC_VOLUME`,
`GROUND`, `SIDEWALK`, `CONTEXT_BRICK`, `CONTEXT_ROOF`, `LAMP_HEAD` (emisivo).
Los emisivos se exportan con intensidad 1: el visor debe bajarla (`emissiveIntensity`) de dia y modularla de noche.
`GLASS_CURTAIN` y `GLASS_GROUND` se exportan con `alphaMode=BLEND`. Sin texturas, sin camaras ni luces.

### Estimado vs. verificado

Nada del modelo esta verificado con planos o mediciones. Son **estimaciones**: huella 38 x 30 m, alturas (P1 4,8 m, resto 3,6 m,
coronacion 2,4 m), retícula 6 x 4, atrio 14 x 9 m, nucleo 7 x 9 m, pasillos de 2,4 m, posicion de escaleras, distribucion de
espacios (cada fila es un unico espacio de ancho completo), mobiliario, fachadas posterior y derecha (bandas genericas), caja
tecnica, equipos de cubierta y el contexto urbano (manzanas pseudoaleatorias). Lo unico "observado" es cualitativo: 6 franjas de
muro cortina, pilastra blanca a la izquierda, lateral ciego, planta baja con vidrio oscuro y marquesina, acento rojo y atrio con
3 ascensores sobre muro negro (fotografias privadas, no incluidas).

## v2: rasgos verificados con video oficial (23-nov-2026)

Fuente: seccion 9 de `docs/referencias/especificacion-3d.md` (video institucional y 2 shorts del canal oficial de la UTP;
fotogramas solo en local privado). Se mantienen jerarquia y nombres de nodos. Renders v1 conservados en
`docs/entregables/FINAL/capturas/blender/v1/`; hoja `comparacion-v1-v2.png` (solo renders propios).

### Que cambio

| Elemento | v1 | v2 |
| --- | --- | --- |
| Escaleras | 2 en U en las esquinas | 9 tramos rectos ABIERTOS dentro del vacio, uno por nivel, en zigzag (sentido y carril alternados cada nivel). Zancas y fondo `STAIR_STRINGER` (#6B7380), peldanos abiertos `TILE`, barandas de 2 tubos y pasamanos, umbrales en cada extremo. Cada tramo cuelga de `FLOOR_Pxx` (nivel inferior); `STAIRS` queda vacio |
| Ascensores | puertas hacia el pasillo +Z | nucleo negro desplazado al este: su cara oeste da al atrio, con pasillo de 2,4 m entre muro y vacio. 3 puertas de acero por nivel con marco, indicador emisivo (`ELEV_INDICATOR`) y botonera entre puertas |
| Atrio | losa gris, 3 lados con frente | frentes de losa blancos lisos (`SLAB_FACE`, 0,6 m de canto) en los 4 lados; fondo de losa #C9D3DD; barandas de tubo en todo el borde salvo en los arranques de tramo |
| Aulas | tabique con antepecho y vidrio | tabique blanco, puertas de madera clara y franja alta de vidrio hacia el pasillo; falso cielo blanco con paneles LED cuadrados |
| Fachada | proporciones iguales | juntas de panel horizontales (`PANEL_JOINT`) en marco, laterales y coronacion; montantes oscuros mas anchos y salientes; vidrio mas reflectante; acento rojo sin letras ni logotipo |
| Mobiliario (P1-P5, solo LOD0) | biblioteca con libreros, aula A202, 2 labs iguales, auditorio | biblioteca con mesas y sillas rojas (`CHAIR_RED`), carpetas en A201 y A202, laboratorio de computo con mesas largas y monitores (P3), laboratorio con mesones blancos y pozas (P4) |
| Vacio del atrio | 14 x 9 m | 12 x 9 m (estimado; se ajusto para que el nucleo quede con pasillo delante) |
| Materiales nuevos | | `SLAB_FACE`, `STAIR_STRINGER`, `STEEL_DOOR`, `ELEV_INDICATOR` (emisivo), `CHAIR_RED`, `PANEL_JOINT`; `SLAB`, `WOOD` y `GLASS_CURTAIN` cambian de color/reflejo. Sin texturas ni Draco |

### Verificado frente a estimado

- **Verificado (video oficial; existencia, tipo y orientacion):** vacio central alto con pasillos en todo el contorno; frentes de
  losa blancos, lisos y gruesos; barandas de tubos horizontales de acero con pasamanos; escaleras como tramos rectos abiertos
  en el vacio, en zigzag; muro negro brillante de ascensores con puertas de acero que da al atrio; muros de aula blancos con
  puertas de madera clara y franjas altas de vidrio; muro cortina azul con montantes oscuros y marco blanco con juntas de panel;
  existencia de laboratorios de computo, laboratorio con mesones y pozas, biblioteca con sillas rojas.
- **Estimado (no medido):** dimensiones del vacio (12 x 9 m), numero de tramos (9) y su carril/pendiente, ancho de escalera (1,5 m),
  canto del frente de losa (0,6 m), numero exacto de puertas por nivel (3), posicion y tamano del nucleo, modulo de juntas (1,2 m),
  todo el mobiliario y su distribucion, huella 38 x 30 m, alturas, distribucion de espacios.
- **No incluido por falta de evidencia:** escaleras de evacuacion cerradas, taller de pintura, logotipo y letras (el rojo es solo un
  panel liso), distribucion real de aulas por piso, medidas reales.
- Los renders de Blender (EEVEE) son visualizaciones de validacion, no mediciones ni AR.
