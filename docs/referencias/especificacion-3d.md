# Especificación 3D del gemelo digital — sede UTP Huancayo

> **Autoría:** agente director-3d, a partir de las fotografías de referencia del equipo, que son privadas y no se versionan (22-nov-2026).
> **Alcance:** no hay planos ni levantamiento. **Todos los valores numéricos son estimados**, salvo los marcados "px", que se midieron sobre la única foto exterior (600×600 px, ±5 px). El modelo es **representativo, no geométricamente preciso**.

## 0. Validez de las referencias
- **Foto exterior** de la sede y fotos interiores de pasillos, torre de ascensores, salones, laboratorio de química, auditorio y baños: parecen fotografías reales.
- **Cinco imágenes NO valen como evidencia del edificio:**
  - **Retocadas o generadas** (atrio, aula, laboratorio y "pasillos de cada piso"): muestran la interfaz de CampusPulse 360, superposiciones de sensores y códigos inventados.
  - **Render de arquitectura** (biblioteca).
  - Solo se usan como referencia de estilo.
- **Documento .docx** de la carpeta: no se ha analizado.

## 1. Observado
| Rasgo | Observación | Confianza |
|---|---|---|
| Volumetría | Torre prismática. Fachada principal de muro cortina de vidrio dentro de un marco blanco macizo | Alta |
| Fachada lateral izquierda | Blanca y ciega; posible junta vertical a mitad del fondo | Alta (ciega) / Baja (junta) |
| Marco | Pilastra blanca ancha a la izquierda (~11 % del frente, en px), coronación blanca y borde derecho estrecho | Alta |
| Pisos del muro cortina | 7 pisos de vidrio sobre la planta baja: 8 niveles (rango de 7 a 9) | Media-baja |
| Módulos verticales | 6 franjas con montantes oscuros | Media |
| Antepechos | Ninguno blanco: vidrio continuo con juntas finas por losa | Media |
| Planta baja | Más alta que el piso tipo (1,35–1,6× en px). Pilastras blancas, vidrio oscuro retranqueado y marquesina blanca | Media |
| Cubierta | Caja técnica blanca retrasada hacia la izquierda y el fondo (~0,7 pisos de altura) | Alta (volumen) |
| Vidrio | Azul reflectante: refleja cielo y cerros | Alta |
| Acento | Paneles rojos en la esquina superior derecha | Alta |
| Entorno | Ciudad baja de 2 a 4 pisos y cerros al fondo; la torre destaca | Alta |
| Interior | Atrio de varios niveles con pasillos perimetrales y 3 ascensores sobre un muro negro brillante | Alta |

## 2. Estimado
| Magnitud | Valor (estimado) | Método |
|---|---|---|
| Altura de piso típica | 3,8 m (3,6–4,0) | Supuesto típico de edificio educativo con falso cielo |
| Altura de planta baja | 5,0 m (4,5–6,0) | Proporción en px × altura de piso supuesta |
| Niveles | 8 (7–9) | Conteo de franjas |
| Coronación | 2,4 m | ~0,68 pisos en px |
| Altura hasta la coronación | ~34 m | 5,0 + 7 × 3,8 + 2,4 |
| Frente | 36 m (30–40) | Proporción frente/altura en px, corregida por un giro supuesto de 25–35° |
| Fondo | 30 m (22–38) | El valor menos fiable; se necesita un atrio con aulas a ambos lados |
| Paño del muro cortina | ~1,3 m | 31,4 m / 6 franjas / 4 paños (supuesto) |

## 3. Desconocido
- Planos, orientación al norte, sótanos y número real de pisos.
- Fachadas posterior y lateral derecha (se representan con una banda de ventanas genérica y se rotulan así).
- Cubierta real, atrio y núcleo exactos.
- Distribución interior y ubicación real de la biblioteca, el auditorio y las oficinas.
- Retícula exacta de la carpintería e ingreso exacto.

## 4. Interiores aplicables (solo de fotos reales)
- **Acabados comunes:**
  - Muros blancos.
  - Porcelanato beige de 60×60 (≈#D9D2C5).
  - Falso cielo modular con paneles LED de luz neutra-fría.
  - Puertas de madera clara (≈#C8955A).
  - Frentes de losa del atrio grises (≈#8E97A4).
  - Barandas de acero.
  - Muro de ascensores negro brillante (≈#0B0C0F).
- **Por tipo de espacio:**
  - **Aulas:** carpetas negras con tablero blanco, proyector y pizarra; ventanal con vidrio de tinte cian (hay aulas contra el muro cortina).
  - **Laboratorio de cómputo:** filas de monitores.
  - **Laboratorio de química:** mesones blancos y tabiques de vidrio.
  - **Auditorio:** revestimiento de madera y cielo blanco con cajones.
- **Modo noche:** ventanas en blanco neutro (≈#FFF1E2).

## 5. Especificación del modelo (estimada)
### 5.1 Constantes
| Constante | Valor | Constante | Valor |
|---|---|---|---|
| `levels` | 8 | `glassBays` × `panesPerBay` | 6 × 4 |
| `footprintW` × `footprintD` | 36 × 30 m | `frontPierW` / `rightEdgeW` | 4,0 / 0,6 m |
| `groundFloorHeight` / `floorHeight` | 5,0 / 3,8 m | `crownH` | 2,4 m |
| `slab` | 0,3 m | `atriumW` × `atriumD` | 14 × 9 m (x +2 m) |
| `corridorW` | 2,4 m | `coreW` × `coreD` | 7 × 9 m |
| `roofBox` | 14 × 8 × 3 m (centro x −6, z −6) | `wallInset` | 0,8 m |

### 5.2 Muro cortina (solo en la fachada +Z)
- **Retícula:** 24 columnas (6 franjas × 4 paños) por 7 filas (niveles 2 a 8).
- **Montantes:** los principales de 0,25 × 0,35 m y los secundarios de 0,08 × 0,15 m.
- **Juntas de losa:** de 0,10 m.

### 5.3 Materiales PBR (valores de partida)
| Material | Color | Roughness | Metalness | Notas |
|---|---|---|---|---|
| Vidrio del muro cortina | #2B5C8F | 0,06 | 0,7 | Physical, clearcoat 0,6; opacidad 0,72 en modo realista y 0,25 en modo datos |
| Panel blanco | #E6E8EA | 0,6 | 0 | Opacidad 0,2 en modo datos |
| Carpintería | #1A1F26 | 0,4 | 0,6 | |
| Vidrio de planta baja | #0E1724 | 0,1 | 0,3 | Opacidad 0,85 |
| Cubierta | #B9BEC4 | 0,85 | 0 | |
| Acento rojo | ≈#C8102E | 0,5 | 0 | Sin letras ni logotipo |
| Losas | #8E97A4 | 0,7 | 0,1 | |
| Contexto / cerros | #1A2436 / #0E1A2E | 0,9 / 1 | 0 | |

**Reflejo e iluminación:**
- **Lightformers:** uno superior color cielo (#9CC8F0) y una franja de horizonte color cerro (#4A5A44), para que el vidrio refleje cielo y cerros.
- **Sol:** direccional, hacia (−40, 70, 35).

### 5.4–5.6 Volúmenes, planta baja y cubierta
- **Volúmenes macizos:** pilastra, borde derecho, lateral izquierdo ciego y coronación. Las fachadas posterior y derecha son genéricas (banda de ventanas por piso), rotuladas como tales.
- **Planta baja:** 7 pilastras de 0,6 × 0,6 m, vidrio oscuro retranqueado 1,5 m, banda blanca de 1,0 m y marquesina de 10 × 4 × 0,25 m a 3,5 m de altura.
- **Cubierta:** losa, caja técnica, 2 o 3 equipos y una claraboya opcional (inferida).

### 5.7 Cámara
- **Por defecto:** azimut −30°, elevación 14° y fov 35°; aproximadamente pos (−38, 37, 66) y objetivo (0, 18,5, 0).
- **Preset de comparación con la foto:** lienzo 1:1, azimut −30°, elevación 13° y ~90 m de distancia.

### 5.8 Presupuesto
- **InstancedMesh por material para todo el edificio:** ~9 draw calls.
- **Peor caso:** ~30 draw calls, por debajo del límite de 60.
- **Geometría:** menos de 15k triángulos, dentro del límite de 120k.

### 5.9 Blender, GLB y AR
- **Escala y orientación:** metros; origen en el centro de la huella a nivel de la planta baja; fachada principal hacia +Z en glTF.
- **Colecciones:** `FACADE`, `FLR_<n>`, `SPC` (mallas `SPC_<piso>_<código>`), `ROOF` y `CONTEXT`. Hasta 10 materiales.
- **Niveles de detalle:** LOD0 ≤120k triángulos, LOD1 (móvil/AR) ≤40k, LOD2 ≤10k.
- **Exportación:** GLB con meshopt; LOD0 ≤3 MB y LOD1 ≤1,5 MB.

## 6. Asignación de espacios (esquemática)
Los ids contienen el piso, así que se mantienen los niveles 1 a 5. Los niveles 6 a 8 son torre sin espacios instrumentados.

| Nivel | Frente (+Z, vidrio) | Fondo (−Z) |
|---|---|---|
| 1 | SPC_1_LOBBY | SPC_1_BIB |
| 2 | SPC_2_A201 | SPC_2_A202 |
| 3 | SPC_3_A301 | SPC_3_LAB1 |
| 4 | SPC_4_A401 | SPC_4_LAB2 |
| 5 | SPC_5_OFI | SPC_5_AUD |

## 7. Criterios verificables de "reconocible"
**Método:** render con el preset de comparación (600×600 px), superpuesto al 50 % sobre la foto **en local, sin publicarla**, con medición en px.

**Rasgos a comprobar:**
1. Silueta: frente/altura entre 0,8 y 1,0 (en la foto, ~0,89).
2. Marco: pilastra izquierda entre el 8 % y el 14 % del frente, coronación y borde derecho estrecho.
3. Retícula: 6 franjas oscuras, 7 filas de vidrio, sin antepechos.
4. Lateral izquierdo: blanco ciego, entre el 35 % y el 55 % del frente en pantalla.
5. Planta baja: entre 1,3 y 1,6 veces un piso, con pilastras, vidrio oscuro y banda blanca.
6. Cubierta: caja blanca retrasada, de entre 0,5 y 0,9 pisos de altura.
7. Color: vidrio azul reflectante, blanco dominante y acento rojo sin logotipo.
8. Contexto: torre sobre un entorno bajo, con cerros al fondo.

**Aprobación:** al menos 7 de 8 rasgos; los rasgos 1 a 4 son obligatorios.

## 8. Instrucciones para la implementación
Hay que tocar `constants.ts`, `facade.ts`, `layout.ts`, `view.ts`, `CampusTwin.tsx` y `budget.ts`, y sus pruebas:
- Constantes de la tabla 5.1.
- Muro cortina solo en +Z.
- Volúmenes macizos, planta baja y acento.
- Alturas de piso no uniformes y 8 niveles (6 a 8 vacíos).
- Filas frente/fondo según el mapa de la tabla 6.
- Instancing por material, modo realista y modo datos, Lightformers de cielo y cerro, contexto y cerros.
- Rótulo: "Modelo aproximado basado en fotografía · dimensiones estimadas".

Sin la comparación del punto 7 no se declara el modelo "reconocible".
