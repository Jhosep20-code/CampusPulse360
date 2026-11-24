# ADR-004 — Ampliación Unity para la TA5

- **Estado:** **sustituida** el 24-nov-2026 por [ADR-005](ADR-005-ta5-inmersiva-web.md) (TA5 con alternativa inmersiva web). Se conserva como registro histórico; Unity no se instaló ni se ejecutó.
- **Estado anterior:** aceptada (21-nov-2026), pendiente del anexo `TA5_ANEXOS_96SI.docx`.
- **Rama:** `feature/ta5-unity`, creada desde `eda8a26` con el árbol limpio.

## Contexto
La TA5 pide dos etapas en Unity: un proyecto 3D con terreno, casas, autos, materiales, duplicación y cámara FPS, y un proyecto VR con Meta XR SDK, OpenXR, XR Plug-in Management y recorrido en simulador. El Proyecto Final mantiene como núcleo la plataforma web, que no se modifica.

## Decisión
1. **Dos proyectos Unity**, tal como piden las indicaciones ("Crear un nuevo proyecto 3D" y "Crear un proyecto VR"):
   - `apps/unity-fps`: plantilla Universal 3D (URP).
   - `apps/unity-vr`: plantilla VR de Unity, que trae XR Plug-in Management, OpenXR y XR Interaction Toolkit.
2. **Sin duplicar recursos:** un paquete UPM local, `apps/unity-shared/com.campuspulse.campus`, contiene scripts, generadores, prefabs y pruebas. Ambos proyectos lo referencian con `"file:../../unity-shared/com.campuspulse.campus"`.
3. **Escenario generado por código** (Editor scripts con `-executeMethod`): es reproducible, se puede verificar en batchmode y evita descargar recursos de terceros. Las texturas son procedurales, sin licencias externas.
4. **Versiones** (documentación oficial, 21-nov-2026):
   - Unity 6.3 LTS, soportada hasta diciembre de 2027.
   - XR Interaction Toolkit 3.7.
   - OpenXR Plugin 1.19.
   - Meta XR Simulator: instalador independiente para Windows 10+ que no necesita visor. El paquete de la Asset Store está deprecado.
   - Meta XR Core SDK: se recomienda instalarlo desde la Asset Store, que requiere Unity ID. **Su licencia debe revisarse y aceptarla el equipo antes de añadirlo.**
5. **Sin conexión en tiempo real con D1** en esta entrega: se prioriza que FPS y VR funcionen.
6. **El pnpm workspace no incluye los proyectos Unity:** no tienen `package.json` en `apps/*`, y el `package.json` UPM está un nivel más abajo.

## Consecuencias
- Hay que instalar Unity Hub y el Editor 6.3 LTS. Requiere cuenta Unity ID y aceptar la licencia de Unity Personal (gratuita, con ingresos menores de 200.000 USD); son acciones del equipo.
- La validación VR es **simulada en el editor**: no se declara hardware VR verificado.
- Las regresiones de la web no se ven afectadas: no se tocan `apps/web`, `apps/api` ni `packages/`.
