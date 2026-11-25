# Evidencias — Corrección de errores reales y auditoría visual

- **Fecha:** 23-nov-2026
- **Rama:** `feature/hito-2`
- **Producción:** commit `4bac699`

## 1. Error móvil "l is not a function" (crítico)
- **Causa comprobada:**
  - En `apps/web/src/ar/ARPage.tsx`, `useEffect(() => handleRef.current?.setWidth(width))` devolvía el resultado de `setWidth`.
  - `applyWidth` (`xrSession.ts`) devolvía el `Vector3` de three, porque `scale.setScalar` es encadenable.
  - React tomaba ese objeto como función de limpieza y fallaba con "destroy is not a function" (en el bundle minificado, "l is not a function"). El `ErrorBoundary` de página mostraba "Error al mostrar la página".
  - Solo ocurre con una sesión WebXR activa (dispositivos AR como el Galaxy S25 Ultra), al ampliar o reducir la maqueta o al salir de `/ar`.
- **Reproducción:** `ARPage.test.tsx` fallaba antes del arreglo con "destroy is not a function" y pasa después.
- **Prevención:** guardia estática `src/test/effects-guard.test.ts`, que detecta efectos con retorno implícito. Se comprobó que detecta el patrón antiguo.
- **Mensajes de producción:**
  - sin instrucciones de desarrollo (`wrangler dev`, puerto 8787);
  - errores de red, de servidor y de fragmentos traducidos;
  - recarga automática única ante fragmentos JS obsoletos tras un despliegue.
- **Recorrido móvil Playwright contra producción:** navegación completa, vistas 3D, día/noche, pisos P1–P10, regreso, orientación y sesión prolongada de 90 s. 2/2 aprobadas, sin excepciones.

## 2. Vista "Foto" → "Referencia"
- **Antes:** era solo un preset de cámara casi igual a Fachada.
- **Ahora:**
  - encuadre de referencia 1:1;
  - panel "Comparar con fotografía" para cargar voluntariamente una foto local (object URL que nunca se sube);
  - modos Render / Foto / Superposición, opacidad de 0 a 100 % y guías (silueta y tercios);
  - aviso de privacidad y de precisión aproximada.

## 3. Vista Atrio
Corte de sección con planos de recorte que muestra:
- barandas de tubos y núcleo negro de 3 ascensores con puertas de acero por nivel;
- 2 escaleras en U con descansos, pasillos de porcelanato y falso cielo con luminarias;
- mobiliario en biblioteca, aula y laboratorios.

Se rotula como "Interior esquemático basado en fotografías; distribución no verificada". La captura es `docs/entregables/FINAL/capturas/gemelo-atrio-escritorio.png`.

## 4. Acabado del gemelo
- Balizas de estado sobre los espacios en warning o critical.
- Entrada con pórtico, marquesina con canto, puertas de vidrio y escalón.
- Contexto urbano reducido y variado, con color por instancia.
- GLB de AR regenerado: 889.580 bytes, SPC_* 10/10.

## 5. Vista de reloj `/reloj`
- **Esfera:** circular, sin scroll a 220 px, con 3 pantallas y controles de 44 px.
- **Vista previa:** con bisel simulado en pantallas anchas.
- **Rutas:** `/watch` redirige a `/reloj`.
- **Validación:** solo en navegador; **el reloj físico no se ha probado.**

## 6. Coherencia de datos (defecto encontrado en el recorrido)
- **Defecto:** en producción, las incidencias críticas de A301 seguían abiertas aunque el aula estaba normal.
- **Corrección:** cierre automático tras 10 min de condición normalizada.
- **Verificado en producción:** `bot_runs` registra "cerradas=2" y ambas incidencias pasan a `resolved`.

## 7. Rendimiento móvil (diagnóstico)
- **Síntoma:** en el navegador de pruebas con WebGL por software (SwiftShader), escritorio y móvil rinden igual (1,3 y 1,9 fps). Eso no representa el rendimiento con GPU.
- **Captura real del gemelo en móvil:** se hizo con el navegador integrado y GPU real a 375×812, y se renderiza correctamente.
- **Pendiente:** medir fps en el Galaxy S25 Ultra.

## 8. Pruebas (salida real)
- **Unitarias e integración:** 231 (contratos 9, simulador 10, API 77, web 135).
- **e2e (Docker Compose + Playwright):** 15 aprobadas y 3 omitidas a propósito.
- **gitleaks** (historial completo): "no leaks found".
- La rama no contiene fotos privadas: las capturas son renders propios.
