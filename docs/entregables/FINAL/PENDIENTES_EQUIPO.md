# Pendientes del equipo antes de entregar (al 24-nov-2026)

Fecha límite: **viernes 27-nov-2026**. Esta es la lista única de pendientes manuales de la entrega.

## 1. Datos académicos
Completar los `[COMPLETAR]` en la portada del informe (Word), en `PRESENTACION_FINAL.pptx` (diapositiva 1 y notas) y en `LEEME.txt`:
- [ ] facultad o carrera;
- [ ] curso y sección;
- [ ] docente;
- [ ] número de grupo;
- [ ] apellidos, nombres y código de los 2 integrantes;
- [ ] (opcional) un dato institucional con su fuente (informe §1).

Después de editar el Word, actualizar el índice y volver a exportar el PDF.

## 2. Confirmaciones del docente
- [ ] Grupo de **2** integrantes (la consigna pide de 3 a 5).
- [ ] Workers AI (`gpt-oss-20b`) en lugar de la API oficial de OpenAI.
- [ ] TA5 en versión web: sin Unity, OpenXR, Meta XR ni visor VR (criterios 1, 4, 5 y 6).
- [ ] Si la propuesta inicial (entregable 1) ya se entregó; si no, adjuntarla.

## 3. Pruebas físicas sobre la versión publicada (`004eaa4`)
- [ ] AR en el Galaxy S25 Ultra (`/ar`, nivel A o B) con captura o grabación.
- [ ] Reloj en el Galaxy Watch6 Classic (`/reloj`) con foto.
- [ ] Primera persona en el teléfono.
- [ ] Captura de la pantalla Acceso con la sesión iniciada, con el nombre recortado.
- [ ] Preparar el modo sin internet en la laptop de la sustentación (`LEEME.txt` §3).

## 4. Video (no grabado)
- [ ] Antes de grabar, revisar estas frases del guion, que no coinciden con la implementación:
  - 1:15, «el sensor simulado de A401 envía lecturas firmadas a nuestra API»: el escenario entra con la sesión del administrador y se guarda en D1 **sin firma HMAC**;
  - 2:20, «El asistente no inventa cifras»: es una afirmación absoluta. Decir que el backend calcula las cifras y que la validación **reduce** el riesgo de error;
  - 4:15, «Cada push ejecuta 350 pruebas»: el pipeline corre en cada actualización del PR.
- [ ] Grabar, montar (máximo 5 minutos) y agregarlo en `02_video/`.

## 5. Cierre
- [ ] Rehacer el ZIP con el número de grupo: `PROFINAL_U5_GRUPO_N.zip`.
- [ ] Ensayar la sustentación (5 diapositivas por integrante) y la defensa de la TA5 (informe §8.5).
