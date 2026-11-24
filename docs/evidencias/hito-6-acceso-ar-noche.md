# Evidencias: acceso con passkeys, AR nivel A, identidad nocturna e IA (23-nov-2026)

## 1. Estado real antes de cambiar nada
| Elemento | Estado |
|---|---|
| PR #1 | Abierta, sin fusionar |
| CI del commit 73567b3 | Completo y en verde. La ejecución sobre b760757 se canceló porque la reemplazó el siguiente push |
| Producción | `3d66c483` (commit b760757) atendía el 100 % del tráfico; queda como versión de rollback |
| D1 de producción, solo lectura | 0 usuarios, 0 administradores, 0 passkeys; token de arranque no usado (el secreto existe); 1 desafío de login pendiente |

## 2. Passkeys
**Auditoría:**
- **Desafíos:** de un solo uso, guardados en D1 con caducidad de 5 min y consumidos de forma atómica con `DELETE … RETURNING`.
- **Token de arranque:**
  - se compara en tiempo constante;
  - se reclama de forma atómica (`ON CONFLICT … WHERE used_at IS NULL`);
  - una vez usado no sirve para otra cuenta.
- **Verificación:** exige verificación de usuario y comprueba origen y RP ID: `campuspulse.campuspulse-api.workers.dev`, igual al host de producción.
- **Clave:** `residentKey: required`, compatible con Windows Hello y Android.
- **Protecciones:** rate limit de 10 por minuto, cookie de sesión httpOnly/Secure/SameSite=Strict y auditoría de altas, logins y fallos.

**Problemas encontrados:**
1. **«Algo ha ido mal» en Windows:** fue un intento de **login sin ninguna passkey registrada**, no un fallo al crear credenciales. Faltaba explicarlo en la interfaz. **Corregido:** mensajes distintos para login y registro (NotAllowedError, SecurityError, InvalidStateError y NotSupportedError).
2. **El S25 no tenía forma de obtener acceso.** El token es de un solo uso y la passkey de Windows Hello no se sincroniza con Android. **Corregido** con la vinculación por código:
   - `POST /auth/passkey/link/code` exige sesión y genera un código de 10 caracteres (alfabeto sin ambiguos, unos 49 bits), de un solo uso y válido 10 min. Solo se guarda el sha256 en `link_codes` (migración 0005).
   - `POST /auth/passkey/link/options` acepta el código. La passkey se añade a **la misma cuenta**: no crea usuarios ni cambia roles, y excluye las credenciales que ya tiene la cuenta.

**Pruebas nuevas** (`apps/api/test/api-passkeys-flow.test.ts`), con un autenticador de prueba ECDSA P-256 y la verificación REAL de `@simplewebauthn/server`:
- alta inicial → sesión de administrador → anti-replay del desafío → el token no se reutiliza → login con la passkey y contador actualizado;
- login con una credencial desconocida → 401 y queda auditado;
- vinculación: requiere sesión, la passkey va a la misma cuenta, el código es de un solo uso, solo se guarda su hash y se excluyen las credenciales existentes;
- código inexistente o caducado → 403;
- un visitante no puede escribir ni generar códigos (401).

En la web, `Access.test.tsx` cubre los mensajes y el formato del código.

**Instrucciones paso a paso:** `docs/entregables/FINAL/GUIA_ACCESO_Y_PRUEBAS_FISICAS.md`.

## 3. AR nivel A (WebXR)
**Síntoma en el S25:** aparece el aro cian, pero al tocar sale «Aún no hay superficie detectada».

**Causa** (defecto de código reproducible por inspección): la colocación llamaba a `getHitTestResults()` con el `XRFrame` del evento `select`. WebXR solo entrega resultados de hit-test en los fotogramas de animación, así que la lista llegaba vacía, aunque el aro (calculado en el fotograma de animación) demostraba que sí había superficie.

**Corrección:**
- El toque solo **pide** colocar. La colocación y el ancla se crean en el siguiente fotograma de animación con superficie (`src/ar/placement.ts`).
- Los mensajes indican «Buscando superficie…» → «Superficie detectada: toca…» → «Maqueta colocada».
- Un toque sin superficie espera hasta 4 s y luego explica qué hacer.
- Solo los controles del panel bloquean el toque.
- Hay 5 pruebas de regresión en `placement.test.ts`.

**Estado:** corregido en código y probado con pruebas unitarias. **No verificado todavía en el S25 Ultra.** El protocolo físico está en la guía (sección 4).

**Nivel B (Scene Viewer):** usa `utp-huancayo-ar.glb` (Blender, 1:60, sin ventanas nocturnas), servido como `model/gltf-binary`. Tampoco se ha probado en el dispositivo.

## 4. Identidad nocturna (Blender v3.1)
- Las letras U/T/P de la marca usan `LED_CROWN`: blancas de día y encendidas de noche (el visor modula la emisión).
- Letrero «Universidad Tecnológica del Perú» con letras de 0,8 m en la **banda gris sobre la planta baja**; la tira LED baja al borde inferior.
- **Posición aproximada:**
  - No hay una foto nocturna auténtica en el repositorio local. Las imágenes del `.docx` son tableros generados por IA y no se usan como evidencia.
  - La banda sí aparece en la foto exterior auténtica.
  - En el tercer piso solo hay muro cortina (en la foto y en el modelo), así que allí no hay soporte para el letrero.
- **Sin materiales nuevos** (no suma draw calls): con GPU, la fachada de día queda en 43 draw calls y de noche en 65, porque se encienden las ventanas por espacio.
- **GLB:** escritorio de 56.768 triángulos (3,00 MB), móvil de 24.688 (1,32 MB) y AR de 21.352 (1,14 MB).
- **Capturas:** `capturas/blender/comparacion-dia-noche-v31.jpg`, `exterior-dia.png`, `exterior-noche.png` y `letrero-noche.png`.

## 5. IA
Ver `docs/entregables/FINAL/EXPLICACION_DEMO.md`.
- El asistente, el diagnóstico y el reporte usan `getProvider(env)` → Workers AI `@cf/openai/gpt-oss-20b`.
- Llamada en vivo del 23-nov en producción: `meta.provider = workers-ai`, `meta.model = @cf/openai/gpt-oss-20b`, `mode = live`, 1,8 s.
- No hay `OPENAI_API_KEY` en producción.

## 6. Pruebas (local, 23-nov-2026)
- **Tipos:** sin errores en los 5 paquetes.
- **Unitarias e integración:** 273 (contratos 9, API 82, web 172, simulador 10).
- **e2e contra el stack Docker reconstruido:** 15 aprobadas y 3 omitidas a propósito. En ese stack, `link/options` con un código inválido devuelve 403 (la migración 0005 está aplicada) y `link/code` sin sesión devuelve 401.
- **B3/B4 completas sobre SwiftShader:** no se relanzaron. Siguen documentadas como pendientes.

## 7. Despliegue (23-nov-2026, 19:05 aprox.)
- **Migración D1 remota:** `0005_link_codes.sql` aplicada. Es aditiva: crea la tabla `link_codes` y no toca datos existentes.
- **Versión desplegada:** `207d3808-9c4e-4cad-9c9d-2e07fcb0aa91` (commit 252de1f), con las mismas variables que la anterior.
- **Rollback:** a la versión anterior con `npx wrangler rollback 3d66c483-bf84-4d5a-a3ab-72f2046f3883` desde apps/api. La tabla nueva no afecta a esa versión.
- **Verificado en producción:**
  - `/system/health` ok, con `commit 252de1f`.
  - Las 6 rutas responden 200 y los 3 GLB llegan como `model/gltf-binary`.
  - `link/options` con un código inválido → 403; `link/code` sin sesión → 401; `register/options` con un token incorrecto → 403.
  - `login/options` usa `rpId = campuspulse.campuspulse-api.workers.dev` con `userVerification = required`.
- **D1 después del despliegue:** 0 usuarios, 0 passkeys y token de arranque **todavía sin usar**. El alta del administrador queda para la persona responsable.
- **GPU en producción:**
  - Fachada: 43 draw calls, 0 degeneradas.
  - Modo noche: 65 draw calls, letras U/T/P encendidas.
