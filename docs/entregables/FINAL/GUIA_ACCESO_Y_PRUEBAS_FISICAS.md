# Guía de acceso de administrador y pruebas físicas (S25 Ultra y Watch6 Classic)

**Demo:** https://campuspulse.campuspulse-api.workers.dev · **Estado al 23-nov-2026**

> **Seguridad:** el token de arranque es un secreto. No lo pegues en chats, capturas, commits ni documentos. Está en tu PC, en `infra/production.secrets.local.env` (variable `BOOTSTRAP_TOKEN`). Ese archivo está excluido de git.

## 1. Estado verificado en producción (consultas de solo lectura a D1)
| Elemento | Valor |
|---|---|
| Usuarios / administradores | 0 / 0 |
| Passkeys registradas | 0 |
| Token de arranque | **No usado** (el secreto `BOOTSTRAP_TOKEN` existe en el Worker) |
| RP ID / origen WebAuthn | `campuspulse.campuspulse-api.workers.dev` / `https://campuspulse.campuspulse-api.workers.dev` |

**Por qué Windows mostró «Algo ha ido mal»:** pulsaste «Iniciar sesión con passkey» cuando todavía **no existía ninguna passkey** de CampusPulse en ese equipo. No fue un fallo al crear credenciales. La página ahora lo explica.

## 2. Crear tu cuenta de administrador (Windows 11, una sola vez)
1. Usa Chrome o Edge actualizados en tu PC con Windows Hello configurado (PIN, huella o rostro). Abre la demo → **Acceso**.
2. En **Alta inicial**:
   - **Token de arranque:** copia el valor de `BOOTSTRAP_TOKEN` desde `infra/production.secrets.local.env`, solo el valor, sin comillas ni espacios.
   - **Nombre:** tu nombre.
   - **Rol:** **Administrador**.
3. Pulsa **Registrar passkey**. Windows pedirá crear una passkey para `campuspulse.campuspulse-api.workers.dev`; confirma con tu PIN, huella o rostro.
4. Verás «Passkey registrada y sesión iniciada»; en Acceso aparecerá «Sesión activa: … (administrador)». **Desde ese momento el token queda consumido:** nadie más puede crear cuentas con él, y serás el único administrador.
5. Comprueba que tienes permisos: en **Automatizaciones** los interruptores de reglas y los escenarios de demostración (solo admin) deben estar habilitados.

**Si falla:**
- **«Token de arranque inválido»:** el valor no es exacto. Revisa espacios y comillas.
- **«Se canceló o expiró»:** repite el paso y confirma el aviso de Windows dentro de los 5 minutos.

## 3. Acceso desde el Galaxy S25 Ultra (vincular el teléfono)
Una passkey de Windows Hello se guarda en el PC y no se sincroniza con Android. Por eso, el teléfono se vincula a **tu misma cuenta** con un código de un solo uso:
1. En el PC, con la sesión iniciada: **Acceso → Vincular otro dispositivo → Generar código**. Verás un código `XXXXX-XXXXX` válido 10 minutos.
2. En el S25, en Chrome: abre la demo → **Acceso → Vincular este dispositivo**, escribe el código y pulsa **Vincular con passkey**.
3. Android te pedirá guardar la passkey (Gestor de contraseñas de Google); confírmala con tu huella o rostro. Quedará la sesión iniciada en el teléfono, con el mismo rol.
4. A partir de ahí, en el S25 usa **Iniciar sesión con passkey**.

Generar un código nuevo invalida el anterior. El código no crea usuarios ni cambia roles.

## 4. AR nivel A (WebXR) en el S25 Ultra: prueba concreta
**Corregido el 23-nov:** antes la colocación leía el hit-test en el fotograma del toque, donde WebXR no entrega resultados. Por eso el aro cian se veía pero al tocar decía «Aún no hay superficie detectada». Ahora el toque solo pide colocar, y la maqueta se coloca en el siguiente fotograma con superficie.

**Preparación:**
- Chrome actualizado y "Servicios de Google Play para AR" actualizado.
- Mesa con textura (madera, mantel estampado o un póster).
- Buena luz, sin superficies brillantes ni negras lisas.

| Paso | Qué hacer | Resultado esperado |
|---|---|---|
| 1 | Abrir `/ar` → **Iniciar AR** y aceptar la cámara | Mensaje «AR iniciada con el modelo de Blender… Buscando superficie…» |
| 2 | Apuntar a la mesa a unos 50 cm y mover el teléfono despacio de lado a lado durante 3–5 s | Aparece el **aro cian** sobre la mesa y el mensaje «Superficie detectada: toca la pantalla…» |
| 3 | Tocar la pantalla (fuera de los botones) | La maqueta (~0,60 m) aparece sobre el aro, con la fachada mirando hacia ti, y el mensaje «Maqueta colocada» |
| 4 | Tocar un aula de color | Panel con estado, CO₂ y ocupación (datos simulados) |
| 5 | Probar **Recolocar** y los botones de tamaño | Vuelve a buscar superficie; el tamaño cambia |

**Anota:**
- si el aro aparece y en cuántos segundos;
- si la maqueta se coloca;
- si la escala y la orientación son correctas;
- fps aproximados o tirones.

**Si el aro no aparece en 10 s,** el problema es de detección (luz, textura o movimiento), no del código: prueba otra superficie.

## 5. AR nivel B (Scene Viewer): respaldo para la exposición
1. Abrir `/ar` → **Abrir en Scene Viewer**. Se abre el visor de ARCore con `utp-huancayo-ar.glb`: el mismo modelo de Blender, a escala 1:60 y sin ventanas nocturnas.
2. Comprobar:
   - escala inicial: unos 0,63 m de frente; se puede ajustar con dos dedos;
   - orientación: base sobre la mesa;
   - materiales: vidrio azul, paño blanco y marca UTP.
3. Es una **maqueta estática**, sin telemetría en vivo. La telemetría en AR solo existe en el nivel A.

## 6. Medir el rendimiento en el S25 (opcional, recomendado)
1. Activar la depuración USB en el teléfono, conectarlo al PC y abrir `chrome://inspect` en el PC.
2. Abrir la demo con `?visualtest=1` y, en la consola, ejecutar `__twinDebug()`. Da `drawCalls` y `triangles`.
3. Activar el contador de FPS (DevTools → Rendering → Frame rendering stats).
4. Medir Fachada, Pisos explotados y P10 aislado.

**Referencia con GPU en el navegador del PC:** perfil móvil con 29 / 141 / 19 draw calls.

## 7. Galaxy Watch6 Classic (no probado todavía)
1. En el reloj, abrir el navegador (Samsung Internet para Wear OS, si está instalado) y entrar en `https://campuspulse.campuspulse-api.workers.dev/reloj`.
2. Comprobar:
   - que la esfera circular se ve completa;
   - que los KPIs (estado, CO₂ y alertas) son legibles;
   - que, al girar o tocar, cambia de pantalla.
3. Si no hay navegador en el reloj, se documenta como no probado (no se declara funcional).
