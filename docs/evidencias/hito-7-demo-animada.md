# Evidencias: demostración animada, escenarios configurables y recorrido guiado (23-nov-2026, local)

**Estado de partida (verificado):**
- HEAD `6835dd0` con CI en verde; PR #1 abierta y sin fusionar.
- Producción en `207d3808` (commit `252de1f`), sin cambios en esta fase: **no se desplegó nada**.

## Implementado
| Pieza | Archivos | Cómo funciona |
|---|---|---|
| Escenarios configurables (admin) | `apps/api/src/engine/scenarios.ts`, `routes/ops.ts`, `packages/contracts/src/api.ts`, migración `0006_custom_scenarios.sql` | `POST /scenarios/custom` (espacio, tipo, intensidad y duración) y `POST /scenarios/restore`, con detalle abajo |
| Corrección | `scenarios.ts` | Los escenarios escribían `devices.last_seen`. El simulador en la nube interpretaba que había un gateway activo y dejaba de simular **todo el campus** durante 2 min. Ya no se escribe |
| Umbral visual de consumo | `packages/contracts/src/thresholds.ts` | Consumo ≥ 4,5 kW pasa a advertencia y ≥ 6 kW a crítico |
| Panel «Demostración» (solo admin) | `apps/web/src/components/DemoPanel.tsx`, `src/demo/pipeline.ts` | Siete pasos con estados derivados **solo** de la API (respuesta del escenario, `/live`, `/bots/runs`, `/incidents`). Avisa si el diagnóstico vino del respaldo por reglas. Sondea cada 5 s, como máximo 6 min, y se detiene al terminar. **No hace llamadas de IA** |
| Balizas por causa | `apps/web/src/twin/colors.ts` (`statusCause`), `CampusTwin.tsx` | La baliza muestra la causa y su valor (CO₂, temperatura, aforo o consumo). El estado sin conexión se ve en gris con ⊘ y sin pulso; el crítico pulsa más rápido. Solo cambia el espacio afectado |
| Enfoque de incidencias | `CommandCenter.tsx` | Al lanzar el escenario o detectar la incidencia, se aísla el piso y se selecciona el aula |
| Recorrido guiado | `apps/web/src/twin/tour.ts`, `useGuidedTour.ts`, `CommandCenter.tsx`, `hooks/useReducedMotion.ts` | Ver la secuencia abajo |

**Escenarios configurables:**
- Tipos: CO₂, temperatura, sobreaforo, consumo y sin conexión.
- Se insertan lecturas `sim-scenario`: 2 en rampa y 4 sostenidas. El bot mantiene el perfil cada minuto.
- «Sin conexión» no inventa ni borra lecturas: el espacio pasa a gris a los 3 min.
- Hay 2 reglas nuevas de consumo eléctrico (migración aditiva).

**Recorrido guiado:**
- Secuencia: aérea → fachada → atrio → piso → aula con datos → regreso.
- Usa los **presets de cámara existentes**, que interpolan con easing, y no mueve la cámara por su cuenta: no atraviesa muros.
- Controles: pausa, reanudar, reiniciar, salir y media velocidad.
- Se cancela con cualquier interacción manual (arrastre real de cámara, botones de vista o Restablecer).
- Se pausa con la pestaña oculta y respeta `prefers-reduced-motion`.
- Avanza por tiempo real, no por fotogramas.

**No implementado:** la animación del ascensor. El núcleo es una sola malla `CORE_BLACK` sin cabinas y la disposición real de los dos grupos de ascensores no está confirmada; animarlo exigiría rehacer el modelo. Queda pendiente.

## Verificación con GPU (navegador integrado, stack Docker local, clics reales)
**Escenario en Aula A401 (no A301):** CO₂ crítico.
1. Los pasos Sensor, API y D1, Reglas (CO₂ elevado y CO₂ crítico) y Gemelo (crítico) pasaron a hecho al lanzar.
2. P4 se aisló solo (28 draw calls, 0 degeneradas).
3. En el siguiente ciclo del cron:
   - `incident-bot` registró «reglas=6; nuevas=1»;
   - se abrió la incidencia «CO2 critico en Aula A401»;
   - el diagnóstico vino del **respaldo por reglas (sin IA)**, porque el stack local no tiene Workers AI, y el panel lo indicó con un aviso.
4. **Restaurar** devolvió «escenario retirado, 1 incidencia cerrada»; los KPI volvieron a 10/10 normales.

**Recorrido**, muestreado cada segundo:
- Pasos 1–6 en orden: aérea (0–5 s), fachada, atrio (12–17 s), P2 aislado (18–28 s), regreso (29–32 s) e inactivo a los 33 s (previsto: 31,5 s).
- La pausa mantuvo el paso durante 7 s y reanudar continuó.
- Reiniciar volvió al paso 1; Restablecer durante el recorrido lo canceló.
- Un **arrastre real** de la cámara lo canceló.

**Móvil 375×812:** los controles del recorrido caben (325 px) y no hay desplazamiento horizontal; el panel de demostración va debajo del gemelo.

**Rendimiento** (escritorio, GLB de LOD completo):

| Vista | Antes | Después |
|---|---|---|
| Fachada | 43 draw calls | 43 draw calls (103.364 triángulos, ~94 MB de heap JS) |
| Piso aislado | 25–27 | 28 (P4) |

- El chunk 3D (`twin-*.js`) no cambia: 1.151,65 kB.
- Las balizas y el panel son DOM; no hay geometrías nuevas ni trabajo por fotograma nuevo.
- **No se midieron FPS:** el panel del navegador estaba oculto y `requestAnimationFrame` iba limitado. Falta medirlo con GPU real en el portátil y en el S25.

## Pruebas (local)
- **Tipos:** sin errores.
- **Unitarias e integración:** 293 (contratos 9, API 91, web 183, simulador 10). Nuevas:
  - motor y HTTP de escenarios configurables (8 + 1);
  - pipeline (5);
  - recorrido (6).
- **Build:** ok.
- **e2e contra Docker reconstruido:** 15 aprobadas y 3 omitidas a propósito.
- **gitleaks:** sin hallazgos.

**Despliegue: no realizado.** Requiere aplicar la migración 0006 en D1 remoto (aditiva) y conservar el rollback a `207d3808`.
