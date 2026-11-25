# Evidencias: despliegue del cierre (`004eaa4`) y modo sin internet (24-nov-2026)

## 1. Estado antes de desplegar (verificado)
| Elemento | Valor |
|---|---|
| Commit autorizado | `004eaa4` (`feature/hito-2`) |
| CI de `004eaa4` | Run 45492073983 en verde; deploy *skipped* por diseño |
| Producción anterior | Worker `d9180962-e65a-4c90-b693-3dd8000693fc` (commit `513ce1e`) |
| Migraciones remotas pendientes | Ninguna |
| `main` y `DEPLOY_ENABLED` | Sin fusión y sin activar |

## 2. Respaldo de D1 y punto de restauración
- **Time Travel:** marcador `00000013-000001a2-0000512d-10a7d7bebd4c9c41794b47dfd46baaff`.
- **Exportación:** `backups/d1-prod-20261124-pre-004eaa4.sql`, fuera de git.
  - SHA-256: `8ca876b651064274dad5b3a953493d7d0f6addf3d40ac5dd50b256910cade7de`.
- **Verificación:** 1 usuario, 2 passkeys, 13 incidencias (0 abiertas), 7 reglas, 31 entradas de auditoría y 0 escenarios activos; coinciden con D1 remoto.

## 3. Despliegue
- Worktree en el commit exacto, instalación con lockfile y build de la web.
- `wrangler deploy` con las variables de producción: `GIT_COMMIT=004eaa4`, `ENVIRONMENT=production`, `CLOUD_SIM=on` y WebAuthn del host público.
- **Versión nueva:** `9fca1ec7-2a13-4b09-88fd-e1e55608bccd`.
- Secretos, passkeys, usuarios y configuración conservados; no se modificó ningún secreto. Plan Free.

**Rollback del Worker** (desde `apps/api`):
```
npx wrangler rollback d9180962-e65a-4c90-b693-3dd8000693fc
```
Revertir el Worker no revierte D1; este despliegue no cambió el esquema.

## 4. Validación en producción
| Prueba | Resultado |
|---|---|
| `/system/health` y `/system/info` | `ok`; commit `004eaa4` |
| Autorización | 401 en escenario sin sesión y en ingesta con firma inválida; 403 con origen ajeno |
| Rutas públicas y modelo GLB de AR | 200 |
| Telemetría | Lecturas avanzando |
| Vistas | Fachada, Aérea, Atrio, Referencia, pisos explotados y noche correctas; 11 opciones de piso |
| Recorrido guiado | Avanza, la pausa se mantiene y se puede salir |
| Primera persona | Cruce de puerta, colisión con el núcleo de ascensores, subida hasta P10 y salida con Esc; 120 FPS (vista general 119 FPS) |
| Consola del navegador | Sin errores |
| Asistente | 2 de 2 respuestas contrastadas con `/live` (A201 35/40 = 87,5 %; CO₂ de A201 1008 ppm), «En vivo» gpt-oss-20b |
| `/ar` y `/reloj` | Correctas en navegador de escritorio (sin WebXR en escritorio) |
| Consumo de IA | 54 de 250 llamadas del día (≈ 1.027 neuronas) a las 18:07 |

No se crearon incidencias nuevas: la cadena con escenarios se apoya en la evidencia del mismo día sobre `513ce1e` (hito-10 e informe §10).

**Token de arranque:** en la base de producción figura como usado, por lo que no permite registrar más cuentas.

## 5. Docker sin internet (local)
Proyecto de Compose aislado con red interna **sin salida** y las imágenes ya construidas:
- API sana y web 200;
- 10 de 10 espacios con datos;
- ingesta firmada con HMAC: 610 de 610;
- bot de incidencias en `success` con 7 reglas;
- asistente en respaldo por reglas.

## 6. Alta de administrador en Docker local
Segundo proyecto aislado con base vacía y un **autenticador virtual** de Chromium (no Windows Hello físico):

| Paso | Resultado |
|---|---|
| Alta con el `BOOTSTRAP_TOKEN` local | Passkey registrada y sesión de administrador |
| Panel Demostración | Habilitado; escenario lanzado |
| Incidencia | `RULE_CO2_CRIT` crítica en la Biblioteca, diagnóstico `rules-fallback` (sin IA) |
| Cerrar sesión e iniciar con la passkey | Correcto |
| Segunda alta con el mismo token | **403** |

Los dos proyectos aislados se eliminaron al terminar. La base del stack local habitual no se modificó.

## 7. Pruebas automáticas
- 350 unitarias y de integración aprobadas (contratos 9, API 140, web 191, simulador 10).
- e2e con Docker Compose + Playwright: 15 aprobadas, 0 fallidas, 3 omitidas a propósito (5,6 min).
- gitleaks sin hallazgos.
- `infra/generar-env-local.mjs`: genera un `infra/local.env` coherente y no sobrescribe uno existente.

## 8. Pendiente
- AR en el Galaxy S25 Ultra y reloj en el Watch6 sobre `004eaa4`.
- Primera persona en un teléfono físico.
- Preparación del modo local en una segunda laptop.

## 9. Actualización del 25-nov: rotación de la clave del gateway
Autorizada por el propietario. No cambió el código ni la base de datos.

| Comprobación | Resultado |
|---|---|
| Cuenta de Cloudflare | Solo la del proyecto |
| Antes de rotar | Clave vigente aceptada (400 a un cuerpo no válido) y clave aleatoria rechazada (401) |
| Cambio | `wrangler secret put GATEWAY_KEYS` por entrada estándar; ningún valor se mostró |
| Versión resultante | `182f079c-19ee-49c6-83ed-f566a57515dc` (origen *Secret Change*), al 100 % |
| Clave nueva / anterior | 400 (aceptada) / **401 (rechazada)** |
| Configuración | Mismas variables (`GIT_COMMIT=004eaa4`, `ENVIRONMENT=production`, `CLOUD_SIM=on`, WebAuthn) y secretos `BOOTSTRAP_TOKEN` y `GATEWAY_KEYS` presentes |
| Después | `/system/health` `ok`, telemetría con lecturas posteriores al cambio y 0 incidencias abiertas |

La comprobación de la clave no inserta lecturas. Usuarios, passkeys y sesiones no se modificaron.

**Rollback:** una versión anterior puede restaurar la clave anterior. Tras cualquier `wrangler rollback` hay que verificar la clave y volver a rotarla.
