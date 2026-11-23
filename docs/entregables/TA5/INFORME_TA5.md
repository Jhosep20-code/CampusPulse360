# CampusPulse 360: Diseño e Implementación de un Entorno Virtual 3D con Recorrido FPS y Simulación VR en Unity

> **Estado:** borrador estructural. Cada sección se completa solo con evidencias reales: capturas, versiones instaladas y resultados de pruebas. Los marcadores `[PENDIENTE: ...]` indican lo que falta obtener.

**Curso:** [PENDIENTE] · **Grupo:** [PENDIENTE] · **Integrantes:** [PENDIENTE] · **Fecha:** [PENDIENTE]

## 1. Introducción y objetivos
CampusPulse 360 es un gemelo digital del campus UTP Huancayo. Esta tarea añade una experiencia inmersiva en Unity: un recorrido en primera persona por el campus y su simulación en realidad virtual.

**Objetivo general:** diseñar en Unity un entorno virtual 3D del campus con recorrido FPS y validarlo en un simulador de realidad virtual.

**Objetivos específicos:**
1. Construir un escenario 3D con terreno modificado, edificios, casas, autos y mobiliario, todos con materiales y texturas.
2. Configurar un recorrido FPS fluido con colisiones.
3. Integrar el escenario en un proyecto VR con XR Plug-in Management, OpenXR y Meta XR SDK.
4. Ejecutar el recorrido en un simulador VR con teclado y ratón.

## 2. Herramientas y versiones
| Herramienta | Versión instalada | Uso |
|---|---|---|
| Unity Editor | [PENDIENTE: versión exacta 6000.3.x] | Motor |
| Plantillas | Universal 3D (URP) / VR | Proyectos FPS y VR |
| Input System | [PENDIENTE] | Control FPS |
| XR Plug-in Management | [PENDIENTE] | Gestión de plugins XR |
| OpenXR Plugin | [PENDIENTE] | Runtime XR |
| Meta XR Core SDK | [PENDIENTE] | SDK de Meta |
| XR Interaction Toolkit | [PENDIENTE] | Locomoción e interacción VR |
| Simulador VR | [PENDIENTE: Meta XR Simulator / XR Device Simulator] | Ejecución sin visor |

## 3. Estructura del proyecto
[PENDIENTE: árbol final] Paquete compartido `com.campuspulse.campus` (Runtime, Editor, Tests) y dos proyectos, `apps/unity-fps` y `apps/unity-vr`.

## 4. Parte 1 — Escenario 3D y recorrido FPS
### 4.1 Terreno
[PENDIENTE: descripción, parámetros y captura]
### 4.2 Objetos 3D, prefabs y duplicación
[PENDIENTE: tabla de prefabs con número de instancias, según el JSON del validador]
### 4.3 Materiales, texturas y colores
[PENDIENTE]
### 4.4 Iluminación y ambientación
[PENDIENTE]
### 4.5 Cámara y controlador FPS
[PENDIENTE: controles, parámetros y FPS medidos en el equipo de prueba]

## 5. Parte 2 — Entorno VR
### 5.1 Creación del proyecto VR
### 5.2 Instalación y configuración de plugins
### 5.3 Integración del escenario y navegación
### 5.4 Ejecución en simulador
[PENDIENTE] Aclaración obligatoria: la validación se realizó en simulador, sin prueba con visor físico.

## 6. Pruebas y validación
| Prueba | Método | Resultado |
|---|---|---|
| Validación automática de la escena | `SceneValidator.ValidateFpsScene` | [PENDIENTE] |
| Pruebas EditMode | Unity Test Runner | [PENDIENTE] |
| Recorrido FPS | Play Mode manual | [PENDIENTE] |
| Recorrido VR simulado | Simulador | [PENDIENTE] |

## 7. Capturas y evidencias
[PENDIENTE: capturas de `capturas/` con su descripción]

## 8. Dificultades y soluciones
[PENDIENTE]

## 9. Conclusiones
[PENDIENTE]

## Anexo: documento pendiente
El anexo `TA5_ANEXOS_96SI.docx` no estaba disponible al preparar este informe. Los procedimientos se basaron en el PDF de la TA5 y en la documentación oficial de Unity y de Meta.
