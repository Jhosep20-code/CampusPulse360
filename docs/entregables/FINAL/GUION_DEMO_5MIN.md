# Guion de demostración — CampusPulse 360 (máximo 5 minutos)

**Antes de empezar:**
- Abrir la demo pública y el modo noche apagado.
- Tener el S25 Ultra con Chrome en `/ar` y el reloj emparejado.
- Respaldo de red: hotspot del S25.
- Respaldo sin conexión: `docker compose up` en la laptop.

| Tiempo | Quién | Qué se muestra | Qué se dice |
|---|---|---|---|
| 0:00–0:30 | Integrante 1 | Centro de mando: KPIs en vivo, insignia SIMULADO y gemelo de la sede | El problema: gestión reactiva del campus. La propuesta: un gemelo digital con IoT, IA, RPA, AR y DevOps a S/ 0 |
| 0:30–1:20 | Integrante 2 | Gemelo de Blender: Fachada → Aérea → **Atrio** (corte: escaleras en zigzag y muro de ascensores) → aislar **P3** y **P9** → Restablecer vista | Modelo en Blender, reproducible por script, con 10 pisos y espacios vinculados a sensores. Es una representación aproximada sin planos |
| 1:20–2:20 | Integrante 3 | Escenario "aula saturada" (rol admin) → balizas en A301 → Incidencias: diagnóstico IA con modelo y hora | IoT simulado → D1 → bot RPA cada minuto → diagnóstico con IA real (gpt-oss-20b en Workers AI; no es la API oficial de OpenAI) |
| 2:20–3:00 | Integrante 3 | Asistente: "¿Qué aulas están en riesgo?" → "Ver en el gemelo" | La IA consulta solo datos reales con herramientas de solo lectura y cita espacios |
| 3:00–3:40 | Integrante 4 | S25 Ultra: `/ar` nivel A (esperar el aro cian y tocar) o nivel B (Scene Viewer) · reloj `/reloj` | AR con datos en vivo, o la maqueta estática de Blender en Scene Viewer como respaldo; vista de reloj |
| 3:40–4:30 | Integrante 5 | GitHub: rama, PR y Actions · Sistema: versión desplegada y uso de IA | CI/CD con pruebas, e2e en Docker, gitleaks y despliegue en Cloudflare con rollback |
| 4:30–5:00 | Integrante 1 | Cierre: limitaciones honestas e impacto | Datos simulados, interior aproximado y pruebas físicas pendientes; impacto y siguientes pasos |

**Plan de contingencia:**
- Sin Wi-Fi: hotspot.
- Sin internet: `docker compose up` (IA en modo "sin IA" rotulado).
- Si falla la AR: nivel B o C.
- Si se agota la cuota de IA: respaldo por reglas rotulado.
- Si falla todo: grabación rotulada con su fecha, nunca presentada como en vivo.
