# Auditoría de seguridad — Semana 4

Proyecto: CampusOps
Rama: week4/security-audit-hector
Autor: Héctor Ulises Cacho González

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | Credencial (API key) escrita directamente en `src/api/session.ts` | Cualquier persona con acceso al repositorio podría ver y usar la credencial sin autorización | Se movió a la variable de entorno `EXPO_PUBLIC_SESSION_API_KEY`, definida en `.env.example` sin valor real | `docs/evidence/session-antes.txt`, `docs/evidence/session-despues.txt`, `docs/evidence/env-example.txt` |
| 2 | Se imprimía el objeto completo del usuario (incluyendo su `token`) en consola con `console.log('Usuario autenticado:', user)` | Los logs podían exponer el token de sesión y datos personales del usuario | Se reemplazó por un log que solo incluye `userId` y `role`, sin datos sensibles | `docs/evidence/session-antes.txt`, `docs/evidence/session-despues.txt` |
| 3 | El mensaje de error exponía la URL del backend y la API key completa (`No se pudo conectar a ${baseUrl}/session/login con apiKey=${SESSION_API_KEY}`) | Un mensaje de error visible para el usuario final revelaba información técnica interna que podría facilitar un ataque | Se reemplazó por un mensaje genérico: `'No fue posible iniciar sesión.'` | `docs/evidence/session-antes.txt`, `docs/evidence/session-despues.txt` |

## Hallazgo 1 — Credencial escrita directamente en el código

### Problema encontrado
En `src/api/session.ts`, la constante `SESSION_API_KEY` contenía el valor `'demo_key_123ABC'` escrito directamente en el código fuente, y se usaba tal cual dentro de la URL de la petición de login.

### Riesgo
Cualquier persona con acceso al repositorio (incluyendo el historial de Git) puede ver esta credencial y usarla para hacer peticiones no autorizadas al backend, incluso después de que el archivo se corrija, si no se rota la credencial.

### Solución
Se eliminó el valor hardcodeado y se reemplazó por `process.env.EXPO_PUBLIC_SESSION_API_KEY`, cuyo nombre (sin valor) se documenta en `.env.example`.

### Antes
```ts
const SESSION_API_KEY = 'demo_key_123ABC';
// ...
const response = await fetch(`${baseUrl}/session/login?apiKey=${SESSION_API_KEY}&user=${username}`);
```

### Después
```ts
const apiKey = process.env.EXPO_PUBLIC_SESSION_API_KEY;
const response = await fetch(`${baseUrl}/session/login?apiKey=${apiKey}&user=${username}`);
```

### Evidencia
Antes: `Select-String -Path src\api\session.ts -Pattern "SESSION_API_KEY = '"` encontró la credencial en texto plano (ver `docs/evidence/session-antes.txt`).
Después: `Select-String -Path src\api\session.ts -Pattern "demo_key_123ABC"` no encontró ninguna coincidencia.

## Hallazgo 2 — Información sensible enviada a consola

### Problema encontrado
La función `loginDemo` ejecutaba `console.log('Usuario autenticado:', user)`, imprimiendo el objeto completo del usuario — incluyendo su `token` de sesión — en la consola.

### Riesgo
Los logs pueden quedar almacenados en herramientas de monitoreo, terminales compartidas o archivos de registro, exponiendo el token de sesión y datos personales del usuario a cualquiera con acceso a esos logs.

### Solución
Se reemplazó el log por una versión que solo incluye el `userId` y el `role`, sin el token ni otros datos personales.

### Antes
```ts
console.log('Usuario autenticado:', user);
```

### Después
```ts
console.log('Usuario autenticado correctamente:', { userId: user.id, role: user.role });
```

### Evidencia
`docs/evidence/session-despues.txt` muestra la línea final del log, confirmando que ya no incluye el objeto `user` completo ni el campo `token`.

##