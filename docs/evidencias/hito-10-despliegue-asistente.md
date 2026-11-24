# Evidencias: despliegue del asistente corregido en producción (24-nov-2026)

## 1. Estado antes de desplegar (verificado)
| Elemento | Valor |
|---|---|
| HEAD de `feature/hito-2` | `513ce1e`, igual a `origin/feature/hito-2` |
| CI de `513ce1e` | Run 45342538882 (intento 2) en verde: escaneo de secretos, tipos/pruebas/build, e2e con Docker Compose + Playwright e imagen del simulador. Deploy *skipped* por diseño (`DEPLOY_ENABLED` sin activar, rama ≠ `main`) |
| PR #1 | Abierta, base `main`, sin fusionar |
| Producción anterior | `207d3808-9c4e-4cad-9c9d-2e07fcb0aa91` (commit 252de1f) al 100 % |
| Variables de producción | `CLOUD_SIM=on`, `ENVIRONMENT=production`, Workers AI `@cf/openai/gpt-oss-20b`, `AI_DAILY_LIMIT=250`, WebAuthn del host público. Secretos: `BOOTSTRAP_TOKEN` y `GATEWAY_KEYS` |
| Migraciones remotas pendientes | Solo `0006_custom_scenarios.sql` |

## 2. Respaldo de D1 (verificable)
- **Time Travel:** marcador `00000011-000002cb-0000512d-a07f62eb807235530590b581fada8ac0`, tomado antes de migrar.
- **Exportación completa:**
  - archivo `backups/d1-prod-20261124-pre0006.sql` (5,0 MB), fuera de git: `backups/` está en `.gitignore`;
  - SHA-256: `17900e8a3906c4c78a5f41aac16e31ba319c22db70f336015ea35ab544136eca`.
- **Verificación:** se importó en SQLite y los conteos coinciden con D1 remoto: 1 usuario, 2 passkeys, 6 incidencias, 4 reglas, 25 salidas de IA y 9 entradas de auditoría. Además contiene 23.894 lecturas y 2.312 ejecuciones del bot.

## 3. Auditoría de la migración 0006
- **Contenido:**
  - `ALTER TABLE scenario_overrides ADD COLUMN mode TEXT NOT NULL DEFAULT 'values'`;
  - `INSERT OR IGNORE` de `RULE_POWER_HIGH` (≥ 4500 W, 120 s, advertencia) y `RULE_POWER_CRIT` (≥ 6000 W, 60 s, crítica).
  - No contiene DELETE, UPDATE ni DROP.
- **Ensayo sobre una copia restaurada del respaldo:**
  - ninguna tabla pierde ni cambia filas;
  - las 4 reglas existentes quedan idénticas y se suman 2;
  - el INSERT de la versión anterior (columnas explícitas, sin `mode`) sigue funcionando y toma `mode = 'values'`.
- **Compatibilidad hacia atrás:**
  - la versión anterior ya soportaba la métrica `power_w`;
  - tras migrar y antes de desplegar, `/system/health` de la versión anterior respondió `ok`.
- **Única salvedad de un rollback:** un escenario `offline` que estuviera activo justo en ese momento volvería a producir lecturas hasta su vencimiento (≤ 15 min).

## 4. Despliegue
**Procedimiento:**
1. Worktree `.deploy-wt` en el commit exacto `513ce1e`, con `pnpm install --frozen-lockfile` y build de la web.
2. `wrangler d1 migrations apply campuspulse-db --remote` → `0006` ✅. Conteos después: 1 / 2 / 6 / **6 reglas** / 9 / 25.
3. `wrangler deploy` con las mismas variables de producción: `GIT_COMMIT=513ce1e`, `ENVIRONMENT=production`, `CLOUD_SIM=on` y WebAuthn del host público.

**Resultado:**
- **Versión nueva:** `d9180962-e65a-4c90-b693-3dd8000693fc`.
- **`/system/info`:** `commit 513ce1e`, `environment production`, `workers-ai · @cf/openai/gpt-oss-20b`, `telemetry_simulated: true`.
- **Secretos conservados:** `BOOTSTRAP_TOKEN` y `GATEWAY_KEYS`, sin cambios. Ningún secreto se leyó ni se modificó.
- **Costo:** plan Free, sin facturación.

**Rollback del Worker:**
```
cd apps/api
npx wrangler rollback 207d3808-9c4e-4cad-9c9d-2e07fcb0aa91
```
Revertir el Worker **no** revierte D1. Para volver los datos al estado previo a la migración se usa el marcador de Time Travel del §2; no hace falta porque la migración es aditiva.

## 5. Validación en producción
| Prueba | Resultado | Evidencia |
|---|---|---|
| Migración 0006 aplicada | **Aprobada** | `migrations list --remote` → «No migrations to apply» |
| Versión pública con el recorrido, el panel Demostración y el asistente corregido | **Aprobada** | `/system/info` muestra `513ce1e`; el bundle público contiene «Lanzar escenario», «Demostración» y «Pausar recorrido» |
| Asistente: ranking de ocupación (el caso del defecto, con todo el campus normal) | **Aprobada** | «Aula A201… 29/40 = 72,5 %», `live`, gpt-oss-20b. Recalculado a mano desde `/live`: A201 72,5 % > LAB1 63,3 % > OFI 60 % |
| Asistente: CO₂ más alto, sobreaforo, más personas, incidencias y estado general | **Aprobada** | A201 901 ppm; «ningún espacio supera…»; AUD 78 personas; «sin incidencias»; 298/595 (50,1 %), cuadra con `/live`. 5 de 6 respuestas en `live`. La de «más personas» tardó más de 20 s en Workers AI y se respondió con el **respaldo determinista** (correcto y rotulado) |
| Asistente desde la interfaz `/asistente` | **Aprobada** | «Oficinas administrativas (OFI, piso 5): 15/20 = 75 %», marcado «En vivo · @cf/openai/gpt-oss-20b». Coincide con `/live`: OFI 75 % > A301 71,1 % > A201 70 % |
| Asistente: consulta final de ocupación | **Aprobada, con una observación** | Respondió A202 28/40 = 70 %. Hay un empate exacto con OFI 14/20 = 70 %, y el backend lo resuelve a favor del espacio con más personas, regla ya probada. La respuesta no menciona el empate: es una mejora pendiente que no justifica otro despliegue |
| Recorrido guiado | **Aprobada** | Movimiento continuo (aérea → fachada → atrio → P2 → aula). **Pausa:** se mantuvo 9 s en el paso 5, «en pausa». **Reinicio:** vuelve al paso 1. **Cancelación:** arrastrar el lienzo y «Salir del recorrido» quitan la barra |
| Vistas | **Aprobada** | Fachada, Aérea, Atrio (con «▲ Ascensor · P6», indicador ilustrativo), Referencia (comparar con foto) y noche (ventanas y marca UTP iluminadas) |
| Aislamiento P1–P10 | **Aprobada** | Las 11 opciones cambian el gemelo. P6–P10 muestran «Piso N · sin espacios instrumentados». Sin errores en consola |
| `/ar` | **Aprobada en escritorio, con límites** | Muestra los niveles A, B y C, y en escritorio indica correctamente que no hay WebXR. **La AR real en el S25 está pendiente** |
| `/reloj` | **Aprobada (navegador)** | Esfera con «SIMULADO» y «Campus normal». **La prueba en el Watch6 está pendiente** |
| Cadena automática (cron) | **Aprobada (observación)** | `incident-bot` cada minuto con `success`, también después del despliegue; el simulador en la nube mantiene `/live` con lecturas de unos 100 s. Los diagnósticos anteriores son `live` gpt-oss-20b |
| Responsive móvil en producción | **Pendiente** | La ventana de Chrome no se pudo redimensionar (siguió en 1536 px). Cubierto por el e2e móvil de CI en este mismo commit; falta comprobarlo en el S25 |
| Login con passkey y permisos de administrador | **Pendiente** | Ni el Chrome usado ni el navegador integrado tienen sesión de administrador (rol `visitor`). El login exige la passkey del usuario |
| Escenario controlado de CO₂ crítico en A401 (cadena completa) | **Omitida (sin sesión de administrador)** | Ver §6 |
| Escenarios de temperatura, ocupación, energía y desconexión en producción | **Pendiente** | Probados en integración y en Docker; en producción requieren una sesión de administrador |

## 6. Prueba controlada pendiente: CO₂ crítico en A401
La realiza el administrador, con su passkey, desde el escritorio:
1. Abrir `https://campuspulse.campuspulse-api.workers.dev/acceso` e iniciar sesión con la passkey. La cabecera debe mostrar el rol de administrador.
2. En **Centro de mando → Demostración**, elegir «P4 · Aula A401», «CO₂ elevado», «Crítica» y una duración de 5 min. Pulsar **Lanzar escenario**. Captura 1: A401 en rojo con la baliza «CO₂ 1.720 ppm».
3. Esperar 1–2 ciclos del cron, un máximo de 2 min. En la franja Sensor → API → Reglas → Bot → Incidencia → IA → Gemelo deben completarse las etapas, con **IA = Workers AI** (no «sin IA»). Captura 2.
4. Abrir **Incidencias**: debe haber una `RULE_CO2_CRIT` crítica en A401, con el diagnóstico y el modelo `@cf/openai/gpt-oss-20b`. Captura 3.
5. Pulsar **Restablecer vista**: la ventana de A401 en la fachada debe verse roja. Captura 4.
6. Pulsar **Restaurar**: el panel debe indicar «escenario retirado, 1 incidencia(s) cerrada(s)» y A401 debe volver a «Normal». Captura 5.
7. **Comprobación final:** en **Incidencias** no debe quedar ninguna abierta de A401 y en el Centro de mando debe verse «Sin alertas activas».

## 7. Consumo
- **Cuota de la app:** `/system/info` indicaba **32 de 250** llamadas y unas **507 neuronas estimadas** (de 10.000 diarias) al desplegar. Las 8 consultas de esta validación consumen de ese mismo cupo.
- **Costo:** S/ 0,00. Plan Free, sin facturación.
