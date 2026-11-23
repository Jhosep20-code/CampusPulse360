# Matriz de cumplimiento — TA5 (20 puntos)

**Fuente:** `TA5_INDICACIONES Y RUBRICA__96SI.pdf`. Grupos de 3 a 5 estudiantes; dos etapas (FPS y VR).
**Anexo técnico `TA5_ANEXOS_96SI.docx`:** PENDIENTE, no disponible en el repositorio.

> **Estado al 23-nov-2026:** Unity **no está instalado** y el módulo FPS/VR **no se ha ejecutado**. El paquete compartido (`apps/unity-shared`, rama `feature/ta5-unity`) está escrito pero **sin compilar**. Ningún criterio de la TA5 se declara cumplido. El modelo arquitectónico de Blender (`assets/3d/blender`) podrá reutilizarse en Unity cuando se instale.

Estado: ✅ cumplido con evidencia · 🟡 en curso · ⏳ pendiente · ⛔ bloqueado (dependencia externa)

| # | Criterio (pts máx.) | Nivel "Esperado" (2 pts) | Implementación planificada | Evidencia exigible | Estado |
|---|---|---|---|---|---|
| 1 | Diseñar el escenario 3D en Unity (2) | Entorno completo, estructurado y ambientado con diversidad de objetos | Escena `TA5_Campus_FPS`: terreno, avenida, edificio UTP (representativo), casas, autos, árboles, farolas, mobiliario, jerarquía por grupos | Capturas reales y `validacion-escena-fps.json` | 🟡 scripts en curso; ⛔ Unity sin instalar |
| 2 | Aplicar materiales y objetos 3D (2) | Materiales, texturas y colores en todos los objetos, de forma coherente | Texturas procedurales (asfalto, pasto, ladrillo, vidrio...) y materiales URP Lit; el validador comprueba que no queden renderers sin material | JSON del validador y capturas | 🟡 / ⛔ |
| 3 | Configurar recorrido tipo FPS (2) | Recorrido fluido con control total en primera persona | `FirstPersonController`: WASD, ratón, correr, saltar, gravedad y colisiones con CharacterController; HUD con FPS medidos | Video o capturas del recorrido; FPS medidos en este equipo | 🟡 / ⛔ |
| 4 | Implementar el entorno VR en Unity (2) | Escenario 3D integrado al entorno VR con navegación activa | Proyecto `apps/unity-vr` (plantilla VR de Unity) que reutiliza el escenario mediante el paquete compartido y un XR Origin con locomoción | Capturas en el editor con el simulador | ⏳ |
| 5 | Instalar y utilizar los plugins (2) | Todos los plugins requeridos configurados y validados | XR Plug-in Management + OpenXR (1.19) + Meta XR Core SDK + XR Interaction Toolkit (3.7) | Capturas de Package Manager y Project Settings > XR, y versiones | ⏳ (Meta XR SDK: licencia por confirmar) |
| 6 | Ejecutar y navegar el recorrido VR (2) | Simulación con navegación completa e interacción fluida | Meta XR Simulator (Windows, sin visor) o simulador de dispositivo de XRI con teclado y ratón | Video o capturas de la sesión simulada. **No es una prueba con visor físico** | ⏳ |
| 7 | Elaborar el informe técnico (2) | Claro, estructurado, describe todo el proceso | [INFORME_TA5.md](INFORME_TA5.md) | Documento final | 🟡 estructura lista |
| 8 | Incluir capturas y evidencias (2) | Capturas claras, relevantes y organizadas | `EvidenceCapture` genera vistas reales desde Unity; capturas manuales del simulador | `capturas/` | ⏳ |
| 9 | Mantener código limpio y organizado (2) | Carpetas, nombres y scripts claramente definidos | Paquete UPM `com.campuspulse.campus` (Runtime/Editor/Tests), namespaces y asmdefs; pruebas EditMode | Árbol del proyecto y resultados de pruebas | 🟡 |
| 10 | Redactar con claridad y precisión (2) | Lenguaje técnico, ortografía correcta, presentación profesional | Revisión final del informe | Documento final | ⏳ |

## Requisitos de las indicaciones (Partes 1 y 2) frente a la implementación
| Indicación del PDF | Cómo se cubre |
|---|---|
| Crear un nuevo proyecto 3D en Unity | `apps/unity-fps` (plantilla Universal 3D) |
| Terreno modificado | TerrainData con heightmap modificado y capas pintadas |
| Objetos 3D (casas, autos) con materiales de color | Prefabs Casa_A/B/C y Auto_Sedan/SUV con variantes de color y textura |
| Duplicación de objetos | Instancias múltiples de prefabs (casas en fila, estacionamiento, árboles, farolas) |
| Cámara con recorrido FPS | FirstPersonController y cámara a 1,7 m |
| Probar el recorrido | Play Mode en el editor; evidencia en video o capturas |
| Crear un proyecto VR | `apps/unity-vr` (plantilla VR) |
| Instalar Meta XR SDK, OpenXR, XR Plug-in Management | Package Manager / Asset Store (Meta XR SDK requiere Unity ID) |
| Insertar el escenario VR y configurar la navegación | Escena VR que reutiliza los prefabs compartidos y la locomoción de XRI |
| Ejecutar el recorrido con simulador (teclado/ratón) | Meta XR Simulator o XR Device Simulator |

## Reutilizable desde CampusPulse 360 (web)
- Identidad visual (paleta, tipografía conceptual, logo) y nombres de espacios (`SPC_*`).
- Dimensiones estimadas del edificio (48×22 m, 5 pisos, 3,6 m): se rotulan como estimación.
- Cuando exista, el GLB de Blender (contrato `assets/3d/README.md`): Unity importa glTF mediante el paquete oficial `com.unity.cloud.gltfast`, que se verificará antes de añadirlo; si no, FBX exportado desde Blender.
- **No reutilizable:** el código Three.js/React (Unity usa C#); la AR web pertenece al Proyecto Final.
