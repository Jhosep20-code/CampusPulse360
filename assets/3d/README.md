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
