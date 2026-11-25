# Demostración animada (60–90 s) para el video de 5 minutos

Requisitos: sesión de **administrador** (passkey) en el Centro de mando y la demo pública abierta. Todo lo que aparece está **funcionando de verdad**, excepto lo marcado como *simulado*.

| Tiempo | Acción en pantalla | Qué ocurre realmente | Qué decir |
|---|---|---|---|
| 0–30 s | **Recorrido guiado** (botón del gemelo): aérea → fachada UTP → atrio → piso → aula → regreso | Secuencia de los presets de cámara existentes con transiciones suaves; se cancela si alguien mueve la cámara | "Este es el gemelo digital de la sede, modelado en Blender con 10 pisos. Es una representación aproximada, sin planos oficiales" |
| 30–40 s | Panel **Demostración**: elegir un aula que **no** sea A301 (por ejemplo «P4 · Aula A401»), anomalía «CO₂ elevado», intensidad «Crítica», y pulsar **Lanzar escenario** | El servidor inserta lecturas **simuladas** (`sim-scenario`) y fija el perfil; el gemelo aísla P4 y enfoca el aula | "Simulamos un sensor de CO₂ que sube en esta aula. Los datos son simulados y están rotulados" |
| 40–55 s | Ver los pasos 1–3 en verde: **Sensor**, **API y D1**, **Reglas**; el aula se pone **roja** con la baliza «A401 · CO₂ 1.720 ppm» | El color sale del estado que calcula la API con los umbrales, no de una animación | "La API guarda la lectura y evalúa las reglas. Solo esta aula cambia de color" |
| 55–75 s | Esperar el paso 4 **Automatización** (ciclo del cron, como máximo 60 s) y el paso 5 **Incidencia** | El bot RPA de Cloudflare se ejecuta cada minuto, detecta la condición sostenida y abre la incidencia | "El bot detecta el problema y abre la incidencia sin intervención humana" |
| 75–85 s | Paso 6 **Diagnóstico IA** (en producción, Workers AI `@cf/openai/gpt-oss-20b`; si dice «Respaldo por reglas (sin IA)», decirlo tal cual) | El bot pide el diagnóstico a Workers AI (1 por minuto); el panel muestra el proveedor, el modelo y la latencia reales | "La IA explica la causa probable y propone acciones. No es la API oficial de OpenAI, sino un modelo de OpenAI servido por Cloudflare" |
| 85–90 s | Pulsar **Restaurar** | Se quita el escenario, se registra una lectura normal y se cierra la incidencia de esa aula (auditado) | "Y el sistema vuelve a la normalidad" |

**Variantes disponibles** (cualquier espacio instrumentado):
- **CO₂:** advertencia (1.320 ppm) o crítico (1.720 ppm).
- **Temperatura:** 28,6 °C o 31,2 °C.
- **Sobreaforo:** 95 % o 120 % del aforo.
- **Consumo eléctrico:** 4,8 kW o 6,4 kW. Las reglas de consumo son nuevas.
- **Sin conexión:** el sensor deja de enviar y, a los 3 minutos, el espacio pasa a gris «sin conexión». No genera incidencia, porque no hay regla de desconexión.

**Si el ciclo del cron tarda:** el paso 4 avanza en menos de 60 s. Mientras tanto, se puede explicar la arquitectura señalando la baliza ya roja.

**Lo que NO es real:**
- los sensores (son simulados);
- la distribución interior y los ascensores y escaleras (aproximados).

La TA5 (Unity, FPS, VR) es una entrega aparte y no se cubre con este visor web.
