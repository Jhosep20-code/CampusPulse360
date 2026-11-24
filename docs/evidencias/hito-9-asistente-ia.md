# Evidencias: auditoría y corrección del asistente de IA (24-nov-2026, local)

Producción **sin cambios** (`207d3808`). Todos los datos del campus son **SIMULADOS**.

## 1. Defecto y causa exacta
**Pregunta en producción:** «¿Cuál es el espacio más ocupado respecto a su aforo?»
**Respuesta:** «No hay espacios con mayor ocupación respecto a su aforo».

**Causa (en el código, no supuesta):**
1. **No existía ninguna herramienta de ranking.** Las 6 herramientas eran: `get_campus_status`, `get_space_status`, `list_spaces_at_risk`, `get_open_incidents`, `get_space_forecast` y `find_spaces`.
   - La más cercana a la pregunta era `list_spaces_at_risk`, pero solo devuelve espacios en **advertencia o crítico** (ocupación ≥ 90 %).
   - Con el campus en estado normal devolvía `none_at_risk: true`. El modelo lo leyó como «no hay espacio más ocupado».
2. **El respaldo sin IA** (`fallback`) usaba siempre `list_spaces_at_risk`, fuera cual fuera la pregunta.
3. **El prompt no definía los conceptos.** No distinguía porcentaje, absoluto, sobreaforo ni «en riesgo». Además decía «edificio de 5 pisos».
4. **Nada comprobaba** que la redacción de la IA conservara el espacio y las cifras del resultado.

## 2. Corrección
Los cálculos los hace el backend; la IA solo redacta.

| Cambio | Archivo |
|---|---|
| **Enrutado determinista** de 18 familias de preguntas a una herramienta, con detección sin acentos. Las preguntas ambiguas devuelven `null` y la herramienta la elige el modelo | `apps/api/src/ai/intent.ts` (nuevo) |
| **Herramientas nuevas:**<br>• `rank_spaces`: ranking por `occupancy_ratio`, `occupancy`, `co2_ppm`, `temp_c`, `power_w` o `rh_pct`. Excluye los espacios sin conexión e informa de ellos. Devuelve también el mayor en número absoluto y el conteo de sobreaforos.<br>• `list_spaces_by_condition`: `over_capacity` (> 100 %; el 100 % exacto se informa aparte), `empty` (0 personas) u `offline` (> 3 min, con dispositivo y minutos).<br>• `get_bot_activity`: últimas 24 h de `bot_runs` e `incident_events`.<br>• `get_ai_diagnoses`: tabla `ai_outputs` unida a `incidents`, con proveedor, modelo y modo. | `apps/api/src/ai/tools.ts` |
| **Mejoras en las existentes:**<br>• `get_open_incidents`: incluye nombre y código, conteo por severidad y las críticas primero.<br>• `get_campus_status`: añade el más ocupado y el % del aforo total.<br>• El consumo se tiene en cuenta en «en riesgo». | `apps/api/src/ai/tools.ts` |
| **Redacción determinista** en español: nombre, código, piso, valores, porcentaje, estado y «(datos simulados)» | `tools.ts` (`renderRanking`, `renderCondition`, …) |
| **Flujo del chat:**<br>• Con intent, se omite la llamada de selección (**1 llamada de IA en vez de 2**).<br>• La IA recibe el resultado y el `RESUMEN_VERIFICADO`.<br>• **Validación de fidelidad:** la respuesta debe incluir el código o nombre del espacio y su cifra clave. Si no, se descarta (queda registrada con `valid_json=0`) y se responde con el resultado verificado, en `mode: "fallback"`.<br>• El foco del gemelo 3D lo decide el servidor.<br>• El respaldo usa la herramienta del intent, o el estado general si la pregunta es ambigua. | `apps/api/src/ai/chat.ts` |
| **Prompt `assistant@1.1.0`:**<br>• 10 pisos y 10 espacios instrumentados.<br>• Definiciones de ocupación porcentual, absoluta, sobreaforo, vacío, sin conexión y «en riesgo».<br>• Prohíbe cambiar cifras y mencionar detalles internos.<br>• Estados en español y coma decimal. | `apps/api/src/ai/prompts/assistant.v1.ts` |
| **El mock de pruebas** usa el mismo enrutado | `apps/api/src/ai/provider.ts` |
| **Pruebas de regresión:** 46 nuevas | `apps/api/test/engine-assistant-regression.test.ts` |

## 3. Verificación con el modelo real (sin desplegar)
**Montaje:**
- `wrangler dev` local en `:8788`.
- D1 desechable en el scratchpad, con lecturas simuladas:
  - A201: 30/40 personas;
  - AUD: 100/150 personas y 4.800 W;
  - A401: 40/45 personas y CO₂ 1.720 ppm;
  - LAB1: 28,5 °C.
- Binding `AI` remoto, cuenta `5ca29…`, plan Free.

**Resultado:**
- Las 12 respuestas llegaron con `meta.provider = "workers-ai"`, `meta.model = "@cf/openai/gpt-oss-20b"` y `mode = "live"`.
- Latencia de 2,7 a 5,2 s.
- **15 llamadas de IA** en total, incluida la repetición de la pregunta 7 tras ajustar el prompt.

| # | Pregunta | Respuesta real del modelo (resumen fiel) | ¿Correcta? |
|---|---|---|---|
| 1 | ¿Cuál es el espacio más ocupado respecto a su aforo? | «…es Aula A401 (A401, piso 4): 40/45 personas = 88,9 % del aforo, estado crítico (datos simulados).» | Sí: 88,9 % > A201 75 % > AUD 66,7 % |
| 2 | ¿Qué espacios superan su aforo? | «Ningún espacio supera su aforo (más del 100 %). El más cercano es Aula A401… 88,9 %… (Datos simulados.)» | Sí |
| 3 | ¿Dónde está el CO2 más alto? | «…Aula A401 (piso 4): 1720 ppm, estado crítico…» | Sí |
| 4 | ¿Qué espacio tiene la temperatura más alta? | «…Laboratorio de computo (LAB1, piso 3): 28,5 °C, estado advertencia…» | Sí |
| 5 | ¿Qué incidencias activas hay y cuál es su gravedad? | «No hay incidencias activas (datos simulados).» | Sí: la D1 de prueba no tenía incidencias |
| 6 | ¿Qué dispositivos están desconectados? | «No hay dispositivos desconectados. (Datos simulados.)» | Sí |
| 7 | ¿Cuál es el consumo eléctrico por espacio? | **1.ª:** cifras correctas, pero decía «estado ok» y mencionaba «la herramienta rank_spaces». **Tras el prompt 1.1.0:** «…Auditorio (AUD, piso 5) con 4800 W, estado advertencia (datos simulados). Ocupación: 100/150 personas = 66,7 %…» | Sí (redacción corregida) |
| 8 | ¿Qué acciones automáticas hizo el bot? | «El bot no registró ejecuciones en las últimas 24 h (datos simulados).» | Sí: sin cron en esa D1 |
| 9 | ¿Qué diagnósticos generó la IA? | «Todavía no hay diagnósticos de incidencias registrados…» | Sí |
| 10 | Dame el estado general del campus | «10 espacios (7 normales, 2 en advertencia, 1 crítico, 0 sin datos). Ocupación 205/595 personas (34,5 %)… Mayor ocupación relativa: Aula A401… 88,9 %… En riesgo: A401 (CO₂ 1720 ppm); Laboratorio de cómputo (28,5 °C); Auditorio (4800 W).» | Sí: 205 = 7×5 + 30 + 40 + 100 |
| 11 | ¿Qué espacio tiene más personas? | «…el Auditorio (AUD, piso 5): 100 personas (66,7 % de su aforo de 150), estado advertencia…» | Sí: el absoluto se distingue del porcentaje |
| 12 | «Oye, ¿y qué tal anda todo por ahí?» (ambigua) | El modelo eligió el estado general: misma respuesta que la 10 | Sí |

**Notas sobre esta verificación:**
- Las preguntas 8 y 9, con bot y diagnósticos reales, se comprobaron en las pruebas de integración (§4), que ejecutan el bot real con el proveedor mock.
- El límite de la app, de **6 consultas por minuto e IP**, devolvió 429 en la 7.ª pregunta seguida. Es el comportamiento esperado: se reenviaron en el minuto siguiente.

## 4. Pruebas automatizadas (24-nov-2026)
Archivo `engine-assistant-regression.test.ts`, con **46 pruebas**:
- **21 frases distintas** enrutadas a su familia, más la ambigua, que da `null`.
- **Las 10 consultas en ambos modos:** con IA (mock, `live`) y sin IA (`rules-fallback`), comprobando los mismos datos y la etiqueta SIMULADO.
- **Casos normal, advertencia, crítico y sin datos.**
  - **Clave:** con A201 en 30/40 (75 %) y AUD en 100/150 (66,7 %), sin sobreaforo ni riesgo, la respuesta es **A201 · 75 %**. Además indica que «Ningún espacio supera el 100 %» y que AUD es el mayor en número absoluto.
  - Sin datos, no inventa ningún espacio.
  - Un espacio sin conexión se excluye y se informa.
- **El 100 % exacto no cuenta como sobreaforo.**
- **IA que contradice el cálculo,** tanto si cambia el espacio como si cambia la cifra: la respuesta se descarta y se usa el resultado verificado.
- **IA fiel:** se acepta en `live` y usa una sola llamada.
- **Coherencia fuera de A301:** escenario personalizado de sobreaforo crítico en **AUD** (180/150) más un ciclo real del bot.
  - Se abre la incidencia `RULE_OVERCAP` crítica.
  - El estado en vivo es `critical` con ratio 1,2.
  - «El más ocupado», «Sobreaforo» e «Incidencias» señalan AUD con 120 % y el foco del gemelo apunta a `SPC_5_AUD`.

**Resultados:**
- **Tipos:** ok en los 5 paquetes.
- **Unitarias e integración:** **340** (contratos 9, API 137, web 184, simulador 10). Antes eran 294 (+46).
- **Build:** ok.
- **gitleaks:**
  - historial `main..HEAD`: sin hallazgos;
  - escaneo del directorio: 10 avisos, todos en archivos ignorados por git (`.dev.vars`, `infra/*.env`, `dist/`; los de `dist/` son un falso positivo de una librería ASN.1). Ninguno en archivos versionados.
- **e2e contra Docker reconstruido:** ver §6.
- **Comprobación HTTP contra Docker** (`:8787`): las preguntas devuelven los rankings correctos en modo `fallback`, porque Docker no tiene acceso a Workers AI. El motivo se muestra con un texto honesto: «error del proveedor o tiempo agotado».

## 5. Límites del plan gratuito
- **Límite de la app:** `AI_DAILY_LIMIT` = 250 llamadas al día.
- **Workers AI Free:** 10.000 neuronas al día. Al agotarse da error, sin cobro.
- **Ahorro:** con el enrutado determinista, cada pregunta conocida usa **1** llamada en lugar de 2.
- **Al agotarse el cupo:** el asistente sigue respondiendo con el cálculo determinista, rotulado `rules-fallback`.

## 6. e2e (Docker reconstruido con este código, 24-nov-2026)
**Suite completa:** **14 aprobadas, 1 fallida y 3 omitidas a propósito (6,1 min).**
- **La fallida** es «Estabilidad móvil · navegación completa, vistas 3D, día/noche, pisos y regreso», con WebGL por software. No se guardó el mensaje de error, porque el log se recortó.
- **Esa prueba sola:** **aprobada en 3,3 min.**
- **Relación con el asistente:** ninguna directa. La prueba solo abre `/asistente`, sin preguntar nada. Esta prueba ya falló por su límite de tiempo en el hito 8 cuando la máquina estaba cargada.
