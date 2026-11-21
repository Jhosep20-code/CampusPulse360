# ADR-002 — Proveedor de IA generativa

- **Estado:** aceptada con verificación pendiente (tarea D-22-03: llamada real con la cuenta del equipo).

## Contexto
La rúbrica menciona "APIs de OpenAI". La API oficial de OpenAI (api.openai.com) no ofrece cuota gratuita, lo que es incompatible con S/ 0.00. GitHub Models fue retirado el 30-jul-2026.

## Decisión
Adaptador `AIProvider` con tres implementaciones:
1. `workers-ai` (por defecto): `@cf/openai/gpt-oss-20b` en Cloudflare Workers AI, plan Free con 10.000 neuronas/día. Es un modelo de pesos abiertos publicado por OpenAI, **servido por Cloudflare: NO es la API oficial de OpenAI**.
2. `openai`: llamada al endpoint oficial, activada solo si un integrante aporta voluntariamente su clave (`OPENAI_API_KEY`). Nunca se activa facturación desde el proyecto.
3. `mock` (pruebas y CI) y `rules-fallback` (contingencia determinista, rotulada "sin IA").

## Riesgo declarado
El docente puede considerar el criterio 5 como parcialmente cumplido por no usar la API oficial. Se declara de forma explícita en el informe.
