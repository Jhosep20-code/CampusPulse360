# Guía de acceso de administrador y pruebas físicas (S25 Ultra y Watch6 Classic)

**Demo:** https://campuspulse.campuspulse-api.workers.dev · **Estado al 24-nov-2026**

> **Seguridad:** nunca pegues tokens ni claves en chats, capturas, commits o documentos.

## 1. Estado en producción (24-nov-2026)
| Elemento | Valor |
|---|---|
| Usuarios / administradores | 1 / 1 |
| Passkeys registradas | 2 (escritorio y Android) |
| Token de arranque | **Consumido**: no permite registrar más cuentas |
| RP ID / origen WebAuthn | `campuspulse.campuspulse-api.workers.dev` / `https://campuspulse.campuspulse-api.workers.dev` |

## 2. Cuenta de administrador
**Ya está creada; no hay que repetir el alta.** Entra en **Acceso → Iniciar sesión con passkey**. Si Windows muestra «Algo ha ido mal», ese equipo no tiene una passkey de CampusPulse: vincúlalo como en el §3. El alta con token local de Docker se explica en `LEEME.txt` §3.

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

## 7. Galaxy Watch6 Classic (probado el 23-nov en una versión anterior; repetir sobre `004eaa4`)
1. En el reloj, abrir el navegador (Samsung Internet para Wear OS, si está instalado) y entrar en `https://campuspulse.campuspulse-api.workers.dev/reloj`.
2. Comprobar:
   - que la esfera circular se ve completa;
   - que los KPIs (estado, CO₂ y alertas) son legibles;
   - que, al girar o tocar, cambia de pantalla.
3. Si no hay navegador en el reloj, se documenta como no probado (no se declara funcional).
