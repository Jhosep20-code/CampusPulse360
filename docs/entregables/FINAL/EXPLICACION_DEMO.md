# Cómo funciona CampusPulse 360: explicación para la exposición

**Verificado el 23-nov-2026** en código, configuración de producción y una ejecución real.

## Modelo de IA (confirmado, no solo documentado)
| Uso | Código | Proveedor y modelo en producción |
|---|---|---|
| Asistente conversacional | `apps/api/src/ai/chat.ts` → `getProvider(env)` | Cloudflare **Workers AI**, `@cf/openai/gpt-oss-20b` |
| Diagnóstico automático de incidencias | `apps/api/src/engine/diagnose.ts` → `getProvider(env)` | El mismo |
| Reporte diario | `apps/api/src/engine/report-bot.ts` → `getProvider(env)` | El mismo |

**Evidencia de que es así:**
- **Configuración desplegada:** `AI_PROVIDER=workers-ai` y `AI_MODEL=@cf/openai/gpt-oss-20b`, según `wrangler versions view` y `/api/v1/system/info`.
- **Registros reales en D1 (`ai_outputs`):** asistente 4, diagnóstico 2 y reporte 1. Todos con `workers-ai` / `@cf/openai/gpt-oss-20b` y JSON válido.
- **Llamada en vivo del 23-nov:** respuesta con `meta.provider = "workers-ai"`, `meta.model = "@cf/openai/gpt-oss-20b"`, `mode = "live"`, 1,8 s, citando `SPC_2_A202`.
- **Clave de OpenAI:** no hay `OPENAI_API_KEY` en producción. Los secretos son solo `BOOTSTRAP_TOKEN` y `GATEWAY_KEYS`.

**Qué decir:**
- *Usamos Workers AI de Cloudflare con gpt-oss-20b, un modelo de pesos abiertos publicado por OpenAI y ejecutado en la infraestructura de Cloudflare (plan gratuito).*
- *No usamos la API oficial de OpenAI. El código tiene un adaptador para ella, pero está desactivado porque requiere una clave de pago.*

Si se agota la cuota diaria (10.000 neuronas, con un límite propio de 250 llamadas), el sistema responde con reglas y lo rotula «sin IA».

## Recorrido de los datos, paso a paso
1. **Sensores IoT (simulados).**
   - Hay 10 dispositivos virtuales, uno por espacio. Miden 5 variables: CO₂, temperatura, humedad, ocupación y potencia.
   - Siguen perfiles por tipo de espacio y por hora de Lima (un aula se llena en horario de clases y el CO₂ sube con la ocupación).
   - Un gateway firma cada lote con **HMAC-SHA256** y lo envía a `POST /api/v1/ingest`. El Worker rechaza firmas inválidas y relojes desfasados más de 60 s.
   - En producción, un simulador en la nube publica una lectura por minuto y se detiene si llega un gateway real. Todo dato lleva `source=sim` y la insignia **SIMULADO**.
2. **Detección de anomalías (reglas en SQL).** Las reglas de `alert_rules` exigen una condición **sostenida**:
   - CO₂ ≥ 1200 ppm durante 2 min (advertencia);
   - CO₂ ≥ 1500 ppm durante 1 min (crítico);
   - temperatura ≥ 28 °C durante 3 min;
   - ocupación ≥ 100 % del aforo durante 1 min (sobreaforo).
3. **RPA (bots programados).** Un Cron de Cloudflare se ejecuta **cada minuto** y:
   - evalúa las reglas;
   - abre la incidencia (deduplicada, sin repetir la misma);
   - pide el diagnóstico;
   - notifica (Telegram si está configurado);
   - registra la ejecución en `bot_runs`;
   - cierra solas las incidencias que llevan 10 min normalizadas.

   Otro Cron diario genera el reporte.
4. **Cuándo interviene la IA.**
   - **Diagnóstico:** cuando el bot abre una incidencia (como máximo una por minuto, para cuidar la cuota). El prompt incluye las lecturas reales de 30 min, el umbral y el aforo. La salida es JSON validado con zod: causa probable, severidad, acciones, evidencia y confianza.
   - **Asistente:** cuando alguien pregunta. Elige entre consultas **de solo lectura** predefinidas (nunca escribe SQL libre), cita los espacios y puede mover la cámara del gemelo hacia ellos (`focus_spaces`).
5. **Actualización del gemelo.**
   - La web consulta `/api/v1/live` cada 10 s.
   - Cada aula del modelo de Blender (`SPC_*`) cambia de color según su estado: cian normal, dorado advertencia, rojo crítico. Las balizas marcan las alertas.
   - De noche, las ventanas se iluminan según la ocupación.
6. **Roles.**
   - **Visitante** (sin cuenta): solo lectura, es decir, centro de mando, gemelo, incidencias, asistente, AR y reloj.
   - **Operador:** además reconoce y resuelve incidencias y pide diagnósticos.
   - **Administrador:** además activa o desactiva reglas, lanza escenarios de demostración y ejecuta bots.
   - El acceso es con **passkeys** (WebAuthn), sin contraseñas ni registro público. La primera cuenta necesita un token de un solo uso; los otros dispositivos se vinculan con un código de 10 minutos.

## Frase de cierre sugerida
*Es un gemelo digital funcional y desplegado a coste cero: los datos son simulados, pero el protocolo, las reglas, los bots, la IA y la visualización son reales y están verificados en producción. El modelo 3D es una representación aproximada, sin planos oficiales.*
