# ADR-005 — TA5 con una alternativa inmersiva web (sustituye a ADR-004)

- **Estado:** aceptada el 24-nov-2026, por decisión del equipo.
- **Sustituye a:** [ADR-004](ADR-004-ampliacion-unity-ta5.md) (Unity). La rama local `feature/ta5-unity` se conserva como trabajo futuro, **no se usa en la entrega** y **no se declara implementada**.

## Contexto
- **Plazo:** viernes 27-nov-2026. El Proyecto Final tiene prioridad absoluta.
- **Lo que pide la TA5:** Unity (proyecto 3D con recorrido FPS y proyecto VR con Meta XR SDK, OpenXR, XR Plug-in Management y simulador VR).
- **Situación real:**
  - Unity **no está instalado** y su paquete C# está **sin compilar**.
  - Instalar Unity Hub, el Editor y los SDK de XR, y aceptar sus licencias, exige tiempo y cuentas del equipo.
  - El proyecto ya tiene, en producción, un gemelo 3D de 10 pisos modelado en Blender 5.3 y visualizado con Three.js/React Three Fiber, con AR WebXR.

## Decisión
1. **Un solo producto y un solo informe:** la TA5 se resuelve con la misma aplicación web (CampusPulse 360). No hay un segundo proyecto.
2. **Recorrido en primera persona (FPS) web** sobre el modelo de Blender existente (`apps/web/src/twin/fps.ts`):
   - **Controles:** WASD o flechas, ratón o dedo para mirar, cruceta táctil, cambio de piso P1–P10 y salida con Esc.
   - **Colisiones simples** en planta, con las medidas del GLB.
   - **Sin geometría ni dependencias nuevas.**
3. **Inmersión:**
   - AR WebXR (nivel A, datos en vivo), Scene Viewer (nivel B) y vista 3D (nivel C, que no es AR).
   - Recorrido cinematográfico guiado, vistas de cámara y aislamiento de pisos.
4. **No se afirma** que Unity, OpenXR para Unity, Meta XR SDK, XR Plug-in Management ni el simulador VR de Unity estén implementados. El informe separa lo **funcionalmente equivalente** de lo que **no cumple literalmente** la consigna.

## Consecuencias
- **TA5:** los criterios de Unity y VR (4, 5 y 6, y la parte de "en Unity" de los 1–3) quedan **sin cumplimiento literal**. Su puntaje depende de que el docente acepte la alternativa. Es un riesgo explícito, recogido en la matriz del informe.
- **Ventajas** (ver §8 del informe):
  - funciona en escritorio y en el móvil sin instalar nada;
  - comparte datos en vivo (IoT, incidencias e IA) con el gemelo;
  - mantiene el costo en S/ 0,00.
- **Camino futuro:** importar `utp-huancayo.glb` en Unity (glTFast) y añadir XR Origin con OpenXR. Es posible porque el modelo es GLB estándar y la jerarquía `FLOOR_Pxx/SPC_*` se conserva.
