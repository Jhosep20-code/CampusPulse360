# Evidencias: animación visible del gemelo, alertas en 3D y grabación real (23/24-nov-2026, local)

Producción **sin cambios** (`207d3808`). Todo se validó en el stack Docker local (`http://localhost:8787`) y en el servidor de Vite (`:5173`).

## 1. Defecto «Paso 1 de 6 con el visor negro» (móvil)
**Diagnóstico** (medido, no supuesto):
- **Navegador visible** (Chrome/Brave con GPU real): el GLB se pide a los 615 ms y el modelo queda listo a 1,2 s.
- **Panel integrado oculto con emulación móvil:** la petición del GLB empezó a los **57,8 s** de cargar la página, y la descarga duró 43 ms.

El tiempo extra no es de red: en una pestaña oculta el navegador frena `requestAnimationFrame`, que es lo que hace avanzar el montaje del lienzo R3F y Suspense. Es una espera transitoria agravada por el estrangulamiento, no un fallo de carga.

**Defecto real:** el recorrido se podía iniciar **antes** de que el modelo terminara de cargar. Con la red móvil basta un retraso de unos segundos para ver el lienzo negro con «Cargando modelo 3D» mientras el recorrido avanza.

**Corrección:**
- El gemelo informa de su estado de carga (`onModelState`).
- El botón queda deshabilitado con el texto «Cargando modelo 3D…» hasta que el modelo está listo. Verificado en emulación móvil: deshabilitado durante toda la carga.

## 2. Movimiento cinematográfico
- **Durante el recorrido:**
  - **Transiciones lentas:** `CameraControls.smoothTime` pasa a 1,1 s, de modo que el descenso a la fachada y los acercamientos se ven, no saltan.
  - **Fuera del Atrio:** órbita continua de 0,11 rad/s alrededor del objetivo.
  - **En el Atrio:** solo un balanceo de ±0,22 rad, para no mostrar el corte de sección de lado.
- **Cómo se aplica la órbita:** se suma al destino de la transición en curso (`rotate(..., true)`), usa delta time y respeta `prefers-reduced-motion`. No se añadió GSAP.
- **Tras el enfoque automático de una alerta:** 14 s de órbita lenta sobre el piso afectado.
- **Cancelación:** el arrastre manual cancela el recorrido y la órbita (`controlstart`, que camera-controls solo emite ante entrada del usuario).

## 3. Alertas visibles en el gemelo (dependen de `/live`)
| Efecto | Implementación |
|---|---|
| Transición de color del espacio | `SpaceVolume` interpola el color (amortiguado, unos 0,5 s). En alerta, el volumen pasa a opacidad 0,45 (advertencia) o 0,62 (crítico), así se ve también en la vista realista |
| Pulso | El volumen crítico pulsa en emisión. La baliza DOM late más rápido en crítico; sin conexión se ve en gris con ⊘ y sin pulso |
| **Ventana en la fachada** (nuevo) | La ventana del espacio afectado se ilumina **también de día**: dorado fijo (advertencia) o rojo pulsante (crítico). Vuelve sola a su brillo normal al restaurar. Solo en el LOD de escritorio: el LOD móvil no tiene ventanas por espacio |
| Etiqueta con el valor | Baliza «A401 · CO₂ 1.720 ppm» y etiqueta «Aula A401 · Crítico» |
| Enfoque de cámara | Al lanzar el escenario y al detectar la incidencia: aísla el piso, selecciona el aula y orbita |
| Respuesta inmediata | El panel fuerza un `/live` justo después de lanzar o restaurar (`refresh()`), sin esperar el ciclo de 10 s. Los datos siguen siendo los de la API |

## 4. Flujo animado de la automatización
- La franja `FlowStrip` sobre el gemelo muestra Sensor → API → Reglas → Bot → Incidencia → IA → Gemelo.
- Cada etapa se ilumina **solo** cuando el backend lo confirma (`pipelineSteps`).
- La etapa pendiente late y el conector se llena al completarse la anterior.
- Si el diagnóstico vino del respaldo por reglas, la etapa IA queda en dorado con «sin IA». Captura 02: flujo completo en A401 con «IA · sin IA», porque Docker no tiene Workers AI.

## 5. Ascensores
- El GLB **no tiene cabinas**: el núcleo es una sola malla (`CORE_BLACK`, fusionada en la clase METAL). Animar cabinas exigiría rehacer el modelo.
- **Implementado:** un **indicador de recorrido** en la vista Atrio, frente al muro de ascensores. Es un marcador cian que viaja entre niveles, con arranque y frenado suaves, y una etiqueta «▲/▼/● Ascensor · Pn — indicador ilustrativo, sin cabina modelada».
- Verificado: P1 → ▲ P6 → P6 → ▼ P3 → P3 (captura 03).

## 6. Móvil
- La barra del recorrido va **debajo del lienzo** (medido: barra en y = 551 px y lienzo hasta 542 px) y no tapa el modelo. El panel de espacio no se muestra durante el recorrido.
- Se usa el LOD móvil y el movimiento reducido se respeta.

## 7. Grabación real
**Archivo:** `docs/entregables/FINAL/capturas/video/demo-animada-local.webm`
- 55,4 s, 1194×560, WebM VP9, 9,2 MB.
- Grabada con `MediaRecorder` sobre `canvas.captureStream(30)` en Chrome/Brave, con GPU real y la ventana visible.
- **FPS medio durante la grabación: 113.**
- **Limitación:** graba solo el lienzo WebGL. Las balizas, etiquetas y la franja del flujo son DOM y no salen en el video, sino en las capturas 01–03.

**Análisis** (`capturas/video/analizar-video.html`, muestreo cada 0,5 s durante la reproducción):
- **87 % de las muestras con movimiento**; el tramo quieto más largo dura 5,6 s y está al final, tras restaurar.
- Hoja de contacto en la captura 05.

**Contenido del video:**

| Tiempo | Qué se ve |
|---|---|
| 0–5 s | Vista aérea |
| ~8 s | Descenso a la fachada |
| 12–16 s | Atrio con balanceo |
| 20–24 s | Piso P2 aislado |
| 28 s | Regreso al edificio |
| 33 s | Lanzamiento en A401 |
| 38–42 s | **P4 aislado con A401 en rojo** y órbita |
| 46 s | Fachada con **la banda de P4 iluminada en rojo** |
| 50–55 s | Tras «Restaurar», vuelta al color normal |

**Antes y después:**
- Captura 00: estado normal, 10/10.
- Capturas 01 y 02: anomalía.
- Fotogramas 50–54 s de la hoja de contacto: estado restaurado.

**Rendimiento** (GPU real, ventana visible):

| Medida | Valor |
|---|---|
| Fachada | 43 draw calls (sin cambios) |
| P4 aislado | 28 draw calls |
| Atrio con indicador | 35–36 draw calls (antes 33: el indicador suma una malla y una línea) |
| FPS en reposo | 117 |
| FPS medio durante el recorrido y la anomalía | 113 |

## 8. Reproducir a mano
1. Iniciar sesión como administrador y abrir el **Centro de mando**. Esperar a que el botón deje de decir «Cargando modelo 3D…».
2. Pulsar **Recorrido guiado** y observar 30 s: aérea, fachada, atrio, piso y aula con la cámara siempre en movimiento. Arrastrar la cámara para cancelarlo.
3. En **Demostración**, elegir «P4 · Aula A401», «CO₂ elevado» y «Crítica», y pulsar **Lanzar escenario**:
   - el piso se aísla y el aula pasa a rojo y pulsa;
   - aparecen la baliza con el valor y la franja del flujo.
4. Esperar el ciclo del cron (como máximo 60 s) para ver Bot → Incidencia → IA en la franja. En producción, la etapa IA mostrará Workers AI y en Docker, «sin IA».
5. Pulsar **Restablecer vista** para ver la ventana roja de A401 en la fachada.
6. Pulsar **Restaurar**: el color vuelve a la normalidad.
7. Vista **Atrio**: indicador de recorrido del ascensor.
