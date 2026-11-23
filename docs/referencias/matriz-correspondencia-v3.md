# Matriz de correspondencia del modelo Blender v3: referencia → observación → cambio → evidencia

**Fecha:** 23-nov-2026. **Fuente editable:** `assets/3d/blender/build_utp_huancayo.py` y `utp-huancayo.blend`.

**Regla:** no hay planos ni levantamiento. Todas las medidas siguen siendo **estimadas**: 38 × 30 m de planta, atrio de 12 × 9 m, 3,6 m por piso y 10 pisos (dato del equipo). Esta matriz distingue tres tipos de rasgo:
- **verificado:** se ve con claridad en una referencia auténtica;
- **inferido:** surge de combinar varias referencias, sin una vista directa;
- **estimado / aproximado:** no hay dato.

## Referencias usadas
| Id | Referencia | Tipo | Se publica |
|---|---|---|---|
| F1 | `fotos-originales/.../Exterior/sede-hyo.jpg`: vista aérea de la fachada principal | Foto auténtica | No (privada) |
| F2 | `fotos-originales/.../Interior/torre-pasillos-ascensores.jpg`: atrio visto de frente al muro de ascensores | Foto auténtica | No |
| V1 | Video institucional https://youtu.be/h52zjffXTQc, fotogramas t10 (fachada) y t24 (atrio) | Video oficial | No (fotogramas privados) |
| V2 | Short https://youtube.com/shorts/1DgcJ81djWE, fotogramas t11–t13 (atrio y escaleras) | Video oficial | No |
| X | `atrio.jpg`, `aula.jpg`, `laboratorio.jpg` y `pasillos de cada piso.jpg` | **Probablemente generadas por IA**: rótulos perfectos e inventados y estilo de render | **No se usan como evidencia** |

El short https://youtube.com/shorts/Eo8HOh6pVWs no se volvió a analizar en esta iteración (no hay fotogramas locales suyos).

## Matriz
| # | Referencia | Observación | Cambio en Blender (v2 → v3) | Estado del rasgo | Evidencia (render público) |
|---|---|---|---|---|---|
| 1 | F1, V1-t10 | El muro cortina azul reflectante ocupa unos 2/3 del frente; a la izquierda hay un paño blanco ciego | `PIER_L` pasa de 4 a 10,5 m (el paño ocupa ~28 % del frente); bruña vertical que lo divide en dos volúmenes | Proporción verificada a ojo; ancho estimado | `ref-exterior.png` |
| 2 | V1-t10 | Franjas verticales anchas con montantes oscuros marcados (vidrio estructural), no una retícula densa | `BAYS, PANES` de 6 × 4 a 7 × 2; montante intermedio fino | Ritmo verificado; número exacto estimado (6–7) | `ref-exterior.png` |
| 3 | F1, V1-t10 | Marco y coronación de aluminio gris claro alrededor del muro cortina | Marco lateral, coronación y banda baja con el material `ROOF` (gris) | Verificado | `ref-exterior.png` |
| 4 | F1, V1-t10 | Marca UTP arriba a la derecha del muro cortina: cuadros U (rojo) y T (oscuro) arriba y P (rojo) debajo, con letras blancas | Tres cuadros escalonados con letras extruidas (fuente integrada de Blender); sustituye al panel rojo liso | Posición verificada; tamaño estimado; logotipo **simplificado**, no el oficial | `ref-exterior.png`, `exterior-dia.png` |
| 5 | F2, V2 | Bandas de losa gris azulado alrededor del vacío, que cuelgan bajo el cielo raso | `SLAB_FACE` pasa de blanco a `#949FAD` y su canto de 0,6 a 0,9 m | Color verificado; canto estimado | `ref-ascensores.png`, `atrio.png` |
| 6 | F2, V1-t24, V2 | Muro negro brillante frente al vacío con 3 puertas de acero por nivel, indicadores rojos encima y placas claras entre puertas | Indicadores de ámbar a rojo; placas de señalética entre puertas | 3 puertas verificadas; ancho del núcleo estimado | `ascensores.png`, `ref-ascensores.png` |
| 7 | V2-t12/t13, V1-t24, F2 | Tramos rectos abiertos en zigzag, paralelos al muro de ascensores. En V2 se ven delante de la cámara con el muro negro al fondo; en F2, tomada frente al muro, no hay escaleras delante | Las escaleras pasan del centro del vacío a **dos carriles contiguos en el borde oeste** (opuesto al núcleo), con descansos en las esquinas unidos a los pasillos, tramos de 6,8 m y zancas oscuras | **Inferido** de tres vistas; posición exacta, longitud y descansos **no verificados** | `escaleras.png`, `ref-escaleras.png`, `atrio.png` |
| 8 | F2, V2 | Barandas de acero inoxidable de 4–5 tubos horizontales con pasamanos | Barandas de 4 tubos (P1–P5) o 3 (P6–P10) más pasamanos, con postes cada 1,5 m | Verificado (cantidad de tubos aproximada) | `ref-ascensores.png` |
| 9 | F2, V1-t24 | Puertas de aulas color mostaza o madera en pasillos blancos | `WOOD` pasa a `#D7A24C` | Color verificado; posición de puertas estimada | `atrio.png` |
| 10 | F2, V2 | No se ven pilares en las esquinas del vacío: las losas vuelan | Se quitan los 4 pilares de esquina del atrio | Verificado por ausencia en las vistas disponibles | `atrio.png` |
| 11 | — | Distribución de aulas, laboratorios, baños y puertas por piso | Sin cambios (esquemática) | **Aproximado**, sin referencia | `piso-P03-aislado.png` |
| 12 | F1 | Acceso principal con marquesina y vidrio en planta baja | Marquesina y puertas de vidrio de v2 (sin cambios de forma); la banda sobre el acceso pasa a gris | Existencia verificada; forma y medidas aproximadas | `ref-exterior.png` |
| 13 | F1 | Volumen técnico en la cubierta | Sin cambios | Aproximado | `exterior-dia.png` |

## Diferencias que todavía quedan (no se declara un modelo fiel)
- **Vidrio:** en F1 el vidrio refleja el cielo y los cerros y se ve más oscuro y verdoso. El render usa un azul uniforme.
- **Paño blanco izquierdo:** en F1 parece formado por dos volúmenes de distinta altura y profundidad. En v3 es un solo plano con una bruña.
- **Escaleras:** F2 no muestra tramos en primer plano, mientras que en v3 los tramos del borde oeste aparecen delante en esa vista. En V2 se ven más tramos superpuestos. La posición exacta sigue sin verificarse.
- **Corredores:** la anchura del pasillo frente a los ascensores y la del vacío son estimadas.
- **Interiores:** aulas, laboratorios, baños, señalética y mobiliario son esquemáticos.
- **Fachadas laterales y posterior:** genéricas, sin referencia.

## Comparaciones generadas
- **Privada** (contiene fotos y fotogramas; ignorada por git): `docs/referencias/utp-huancayo/comparaciones-privadas/comparacion-referencia-v2-v3.jpg`. Muestra la referencia auténtica junto a v2 y v3 en cinco vistas: exterior, atrio con ascensores, escaleras, zona de ascensores y piso aislado.
- **Pública** (solo renders propios): `docs/entregables/FINAL/capturas/blender/comparacion-v2-v3.jpg`. Los renders v2 están en `capturas/blender/v2/`.
