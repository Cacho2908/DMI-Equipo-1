# Auditoría de seguridad — Semana 4

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | Token/API Key escrita directamente en el código | Cualquier persona con acceso al repositorio podría obtener la clave y usarla sin autorización | Se movió la clave a una variable de entorno (`process.env`) | Captura 1 |
| 2 | Se imprimía información del usuario en consola | Los logs de ejecución podían revelar información sensible del usuario (ID, tokens, datos personales) | Se eliminaron los datos sensibles del log, dejando solo un mensaje de confirmación | Captura 2 |
| 3 | El archivo `.env` no estaba correctamente protegido | Las credenciales locales podían subirse accidentalmente al repositorio remoto | Se verificó que `.env` esté incluido en `.gitignore` y se confirmó con `git status` | Captura 3 |

---

## Hallazgo 1 — Token/API Key escrita directamente en código

### Problema encontrado
En el archivo `src/config.ts`, la clave utilizada para conectarse al servicio estaba escrita directamente en el código como texto plano.

### Riesgo
Cualquier persona con acceso al repositorio (por ejemplo, en GitHub) podría ver la clave y utilizarla sin autorización.

### Solución
Se sustituyó la clave directa por una variable de entorno (`process.env.EXPO_PUBLIC_API_KEY`), manteniendo un valor ficticio como respaldo solo para desarrollo local.

### Antes
```ts
const API_KEY = "demo_key_12345";
```

### Después
```ts
export const API_KEY = process.env.EXPO_PUBLIC_API_KEY || "demo_key_ficticia";
export const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://api.ejemplo.com";

export { API_KEY, API_URL };
```

### Evidencia
`docs/evidence/token-env.png`

---

## Hallazgo 2 — Exposición de datos de usuario en consola

### Problema encontrado
En `src/config.ts` se imprimía información asociada al usuario directamente en la consola, incluyendo datos que no deberían mostrarse en logs.

### Riesgo
Los logs de ejecución podían exponer información sensible del usuario si son revisados por terceros o quedan almacenados en algún sistema de monitoreo.

### Solución
Se sanitizó la salida a consola, imprimiendo únicamente un identificador no sensible junto con un mensaje de confirmación.

### Antes
```ts
console.log("Usuario autenticado:", { name: "Juan", token: "abc123secret" });
```

### Después
```ts
const userSession = { id: 101, status: "active" };
console.log("Sesión de usuario iniciada correctamente con ID:", userSession.id);
```

### Evidencia
`docs/evidence/logs-sanitizados.png`

---

## Hallazgo 3 — Protección de variables de entorno mediante `.gitignore`

### Problema encontrado
Era necesario confirmar que el archivo `.env`, donde se guardan las credenciales reales del proyecto, no estuviera siendo rastreado por Git.

### Riesgo
Si `.env` no está ignorado correctamente, las credenciales locales podrían subirse por accidente al repositorio remoto y quedar expuestas públicamente.

### Solución
Se revisó el archivo `.gitignore` y se confirmó que contiene la línea `.env`. Se ejecutó `git status` para verificar que el archivo no aparece entre los archivos rastreados o por subir.

### Evidencia
`docs/evidence/gitignore-check.png` — captura de `git status` donde se confirma que `.env` no aparece en la lista de archivos modificados/untracked.

---

## Comprobación final

Se ejecutó `git status` antes de la entrega para confirmar que `.env` no fue agregado accidentalmente al repositorio, y que ningún archivo con credenciales reales quedó incluido en el commit. Todos los valores utilizados (`demo_key_ficticia`, `abc123secret`, etc.) son ficticios y no corresponden a credenciales reales.