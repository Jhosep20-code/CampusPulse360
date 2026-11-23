# Evidencias — Hito 2 (parcial): AR, contingencia offline, e2e y especificación 3D

- **Fecha:** 22-nov-2026
- **Rama:** `feature/hito-2` (desde `main`)
- **Alcance:** local. Nada desplegado ni publicado.

## 1. Regresión (salida real)
| Paquete | Pruebas | Resultado |
|---|---|---|
| packages/contracts | 9 | Aprobada |
| tools/simulator | 10 | Aprobada |
| apps/web | 79 (antes 58; nuevas: lógica AR y vista inicial) | Aprobada |
| apps/api | 70 | Aprobada |
| **Unitarias/integración** | **168** | **Aprobada** |
| e2e (Playwright, escritorio + Pixel 7) | 13 aprobadas, 1 omitida a propósito (la cadena solo corre en escritorio) | Aprobada |

`pnpm typecheck` termina sin errores en los 5 paquetes.

## 2. Modo local de contingencia (Docker Compose)
| Prueba | Resultado | Estado |
|---|---|---|
| `docker compose build` (api + simulador) | Imágenes construidas | Aprobada |
| Contenedor de la API con usuario sin privilegios | Inicialmente falló por permisos (pnpm y volumen de root); corregido | Aprobada |
| Migraciones D1 locales al arrancar | 0001–0004 aplicadas | Aprobada |
| Healthcheck de la API | `healthy` | Aprobada |
| Simulador en contenedor | Backfill de 610 lecturas aceptadas y luego ciclo en vivo cada 30 s | Aprobada |
| Cron local (`/__scheduled`) | Inicialmente lo interceptaba el fallback de la SPA; corregido con `run_worker_first`. Se registran `bot_runs` | Aprobada |
| SPA servida por el stack | HTTP 200 | Aprobada |
| Funcionamiento con internet desconectado | No probado: no se desconectó la red | No ejecutada |

## 3. Realidad aumentada
| Prueba | Resultado | Estado |
|---|---|---|
| Página `/ar` con niveles A (WebXR en vivo), B (Scene Viewer) y C (3D, no AR) | Renderiza; en escritorio informa de que no hay soporte de AR inmersiva | Aprobada (escritorio) |
| GLB para Scene Viewer | `campus-ar.glb` de 382.620 bytes, cabecera `glTF`, 10/10 mallas `SPC_*`, `model/gltf-binary` | Aprobada |
| Permissions-Policy | `xr-spatial-tracking=(self)` | Aprobada |
| Sesión WebXR `immersive-ar` en Galaxy S25 Ultra | **No probada en dispositivo** (requiere HTTPS público o `adb reverse`) | Bloqueada |
| Scene Viewer en Android | **No probado en dispositivo** | Bloqueada |

## 4. Gemelo 3D
- **Encuadre inicial corregido:** el edificio se ve completo; antes se cortaba por abajo. Verificado en captura a 1440 px.
- **Especificación del director-3d** guardada en `docs/referencias/especificacion-3d.md`.
  - Torre de unos 8 niveles, 36×30 m y muro cortina de 6 franjas. Valores estimados a partir de la única foto exterior.
  - La geometría reconocible todavía **no está implementada**.
- **Hallazgo:** cinco imágenes de la carpeta de referencias no son prueba del edificio y solo se usan como referencia de estilo.
  - Cuatro están retocadas o generadas: atrio, aula, laboratorio y "pasillos de cada piso". Muestran la interfaz de CampusPulse y códigos inventados.
  - La quinta, la biblioteca, es un render.

## 5. CI/CD
- Nuevo job `e2e`: levanta Docker Compose con secretos efímeros aleatorios y ejecuta Playwright. El deploy queda condicionado a `test`, `e2e` y `secrets-scan`.
- **No ejecutado en GitHub Actions:** el repositorio no está publicado.
