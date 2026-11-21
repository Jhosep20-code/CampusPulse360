# Registro de riesgos

| # | Riesgo | Prob. | Mitigación | Estado |
|---|---|---|---|---|
| R1 | Límite de 10 ms de CPU por invocación (cron, WebAuthn) | Media | Agregación en SQL, cron acotado, medir con `wrangler tail` | Abierto: medir en D-22-04 |
| R2 | Cuota de 10k neuronas/día de Workers AI | Media | Límite de 60 llamadas/día en la app, caché por incidencia, `rules-fallback` rotulado | Abierto |
| R3 | Criterio 5 penalizado por no usar la API oficial de OpenAI | Media | ADR-002, adaptador oficial listo, declaración en el informe | Abierto |
| R4 | Fotos tardías de la UTP Huancayo | Media | Geometría provisional con contrato `SPC_*` y sustitución por GLB sin cambiar código | Mitigado parcialmente |
| R5 | Fallo del hit-test de AR en la feria | Media | Póster con textura, nivel B (Scene Viewer) y nivel C (3D) | Abierto |
| R6 | Wi-Fi de la feria | Alta | Hotspot del S25 Ultra y modo local con Docker | Abierto |
| R7 | Secretos en el repositorio público | Baja | `.gitignore`, gitleaks en CI, `.dev.vars.example` sin valores | Mitigado |
| R8 | Herramientas en versiones muy recientes (TS 7, Vitest 5, Vite 8) | Media | Versiones fijadas en el lockfile; CI con `--frozen-lockfile` | Abierto |
