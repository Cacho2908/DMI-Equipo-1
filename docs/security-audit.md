# Auditoría de seguridad — Semana 4

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | API Key escrita directamente en el código | Cualquier persona con acceso al repositorio puede ver la clave. | Se movió la clave a una variable de entorno. | `docs/evidence/token-env.png` |
| 2 | Impresión de datos sensibles del usuario en consola | Los logs del sistema pueden exponer información privada. | Se eliminó el objeto sensible de los logs de consola. | `docs/evidence/logs-sanitizados.png` |
| 3 | Riesgo de subir el archivo `.env` al repositorio | Credenciales locales o secretas expuestas en GitHub. | Se verificó y aseguró `.env` dentro de `.gitignore`. | `docs/evidence/gitignore-check.png` |

---

## Detalle de Hallazgos y Correcciones

### Hallazgo 1 — API Key escrita directamente en código
* **Problema:** En el archivo de configuración de servicios se encontraba una clave hardcodeada en texto plano.
* **Riesgo:** Exposición involuntaria de llaves de acceso en el repositorio de GitHub.
* **Solución:** Se sustituyó la clave directa por `process.env.EXPO_PUBLIC_API_KEY` y se creó/actualizó `.env.example`.
* **Antes:**
  ```ts
 const API_KEY = process.env.EXPO_PUBLIC_API_KEY;