# ADR-003 — Autenticación con passkeys

- **Estado:** aceptada (prueba técnica en Workers pendiente: D-22-05).

## Decisión
- WebAuthn (passkeys) para administradores y operadores: no se almacenan contraseñas y la verificación (una firma) cuesta poca CPU dentro del límite de 10 ms.
- Sin registro público: el alta exige un token de arranque de un solo uso (`BOOTSTRAP_TOKEN`, secreto). Se guarda solo su hash y se marca como usado.
- Sesión: identificador aleatorio de 32 bytes en una cookie HttpOnly, Secure y SameSite=Strict de 8 h; en D1 se guarda solo su SHA-256.
- El visitante es anónimo y de solo lectura.
- Descartado: PBKDF2 en el Worker (el coste de CPU obligaría a rebajar iteraciones). Alternativa si WebAuthn falla: Cloudflare Access, solo si no exige tarjeta.
