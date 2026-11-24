# Matriz de cumplimiento — Proyecto Final (20 puntos) · estado al 23-nov-2026

**Fuente:** `RUBRICA_PROYECTO_FINAL.pdf`. Leyenda: ✅ con evidencia · 🟡 parcial · ⏳ pendiente · ⛔ bloqueado por dependencia externa.

| # | Criterio | Pts | Evidencia actual | Estado |
|---|---|---|---|---|
| 1 | Problema y objetivo | 2 | INFORME_FINAL §1–2 con objetivos medibles y resultados medidos | ✅ |
| 2 | Tecnologías articuladas | 3 | Cadena IoT → D1 → RPA → IA → gemelo verificada **en producción** (`docs/evidencias/hito-3-despliegue.md`) | ✅ |
| 3 | Desarrollo técnico | 3 | Monorepo modular; 273 pruebas unitarias e integración (incluye passkeys de punta a punta); 15 e2e (Docker) | ✅ |
| 4 | CI/CD y contenedores | 3 | Workflow completo y Docker (simulador, Compose y e2e). La ejecución en GitHub sobre la rama **depende de la PR**; la única ejecución previa tuvo 2 jobs en rojo, ya corregidos en la rama | 🟡 hasta ver Actions en verde |
| 5 | IA y prompt engineering | 3 | Diagnóstico JSON y asistente con IA real en producción (gpt-oss-20b). Limitación: no es la API oficial de OpenAI (ADR-002) | ✅ con limitación declarada |
| 6 | Interfaz (Web/AR/VR) | 1,5 | SPA responsive, gemelo de Blender, reloj y AR web. AR física pendiente | 🟡 |
| 7 | Informe técnico | 1,5 | INFORME_FINAL.md consolidado; faltan datos del grupo y conclusiones | 🟡 |
| 8 | Presentación | 1,5 | GUION_DEMO_5MIN.md; ensayo pendiente | ⏳ |
| 9 | Creatividad | 1,5 | Gemelo conversacional (`focus_spaces`), pronóstico y comparación de foto local | ✅ |

## Ejes temáticos
| Eje | Estado |
|---|---|
| RPA / bots | ✅ bot de incidencias, cierre automático y bot de reportes en producción; Telegram sin configurar (opcional) |
| CI/CD + contenedores | 🟡 local ✅; GitHub Actions ⏳ (PR) |
| IA generativa | ✅ Workers AI real; ⚠ no es la API oficial de OpenAI |
| AR/VR | 🟡 AR web implementada y sin prueba física; VR en Unity (TA5) sin ejecutar |
| IoT | ✅ simulado: ingesta HMAC en producción y simulador en la nube |

## Pendientes que requieren acción física o externa
1. Crear la PR `feature/hito-2 → main` y verificar Actions en verde.
2. Probar la AR (`/ar`) en el Galaxy S25 Ultra: nivel A ya corregido en código, protocolo en `GUIA_ACCESO_Y_PRUEBAS_FISICAS.md` §4–5. Probar `/reloj` en el Galaxy Watch6 Classic.
2b. Crear la cuenta de administrador (alta inicial en Windows) y vincular el S25 (guía §2–3).
3. Medir fps con GPU real en la laptop y en el S25.
4. Ejecutar los bloques visuales B3 y B4 en un entorno con GPU.
5. Completar los datos del grupo, ensayar la demo y escribir las conclusiones.
