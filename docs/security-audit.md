# Auditoría de seguridad y privacidad — Semana 4

## Resumen Ejecutivo
Como parte del proceso de auditoría básica de seguridad sobre la aplicación, se revisó la estructura del código fuente, el manejo de credenciales de acceso, la gestión de logs del sistema y la configuración del archivo de rastreo de Git. Se identificaron tres posibles vulnerabilidades de seguridad y privacidad, de las cuales se implementó una corrección efectiva en el código fuente para dos de ellas y se validó la adecuada exclusión de archivos sensibles en el repositorio.

---

## Tabla de Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | Credenciales/API Keys escritas directamente en el código fuente | Exposición pública o interna de llaves de acceso en el repositorio. | Se refactorizó el código para consumir variables de entorno (`process.env`) y se definió `.env.example`. | `docs/evidence/token-env.png` |
| 2 | Registro de información sensible de usuario en logs de consola | Filtración accidental de datos personales (PII) o tokens de sesión en sistemas de monitoreo/consola. | Se sanitizó el `console.log` eliminando datos sensibles e imprimiendo únicamente estados generales de confirmación. | `docs/evidence/logs-sanitizados.png` |
| 3 | Riesgo de rastreo y subida del archivo `.env` a GitHub | Exposición de credenciales de desarrollo o producción en el control de versiones. | Se verificó e incluyó la regla `.env` dentro de `.gitignore` comprobando su estado mediante Git. | `docs/evidence/gitignore-check.png` |

---

## Detalle de Hallazgos, Riesgos y Soluciones Aplicadas

### Hallazgo 1 — Credenciales/API Keys escritas directamente en código (`src/config.ts`)

* **Ubicación del problema:** Archivo de configuración central de servicios (`src/config.ts`).
* **Descripción del problema:** Durante la revisión del código se detectó que las claves de acceso a APIs externas y endpoints de servicio se encontraban escritas como cadenas de texto fijas (hardcodeadas) dentro del código fuente.
* **Por qué representa un riesgo:** Cualquier colaborador con acceso al repositorio (o público si el repositorio fuera expuesto) puede extraer libremente las llaves de acceso. Esto permite a terceros no autorizados realizar consumo indebido de APIs, suplantar peticiones o sobrepasar las cuotas de uso de los servicios.
* **Solución aplicada:** Se removió la asignación estática de las cadenas de texto y se configuró la lectura dinámica a través de `process.env.EXPO_PUBLIC_API_KEY`. Adicionalmente, se actualizó la plantilla `.env.example` para documentar la variable requerida sin exponer su contenido real.
* **Código Antes:**
  ```typescript
  const API_KEY = "demo_key_ficticia_12345";

  código después export const API_KEY = process.env.EXPO_PUBLIC_API_KEY || "demo_key_ficticia";