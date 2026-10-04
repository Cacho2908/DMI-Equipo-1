# Contrato de API y Mapeo de Dominio (Semana 5)

Este documento especifica el contrato de la API para el cliente de incidentes en la nube (`cloudIncidentClient.ts`), detallando las solicitudes HTTP, la estructura de respuesta (*envelope*), el mapeo entre los DTOs del backend y los modelos de dominio, la gestión de errores y las reglas de validación.

---

## 1. Solicitudes de la API (Endpoints)

El cliente interactúa con los siguientes endpoints principales, requiriendo en todas las peticiones los headers obligatorios: `Authorization: Bearer <token>`, `Content-Type: application/json`, `X-Course-Actor` e `Idempotency-Key`.

*   **`GET /v1/incidents`**
    *   **Descripción:** Obtiene la lista completa de incidentes registrados en el sistema.
    *   **Estructura de respuesta esperada:** Retorna un objeto contenedor cuyo payload contiene un listado bajo la propiedad `{ items: [...] }`.
*   **`GET /v1/incidents/:id`**
    *   **Descripción:** Obtiene el detalle de un incidente específico utilizando su identificador único.
*   **`POST /v1/incidents`**
    *   **Descripción:** Crea un nuevo reporte de incidente en el servidor.
    *   **Body de creación (Ejemplo):**
        ```json
        {
          "description": "Falla en el sensor de temperatura del garaje",
          "location": "Sector Norte",
          "category": "hardware"
        }
        ```

---

## 2. Estructura de Respuesta (Envelope)

Todas las respuestas exitosas de la API envuelven los datos reales dentro de un objeto contenedor estándar (*sobre*), donde la versión se maneja como un número entero:

```json
{
  "id": "uuid-del-mensaje",
  "version": 1,
  "status": "success",
  "payload": {
    "description": "Falla en el sensor de temperatura del garaje",
    "location": "Sector Norte",
    "category": "hardware"
  }
}
```
*   **Detalle:** El objeto superior contiene los campos de metadatos (`id`, `version` de tipo numérico entero, y `status`), mientras que los datos reales de la entidad o listado `{ items: [...] }` se encuentran albergados dentro de la propiedad `payload`.

---

## 3. Límite: DTO del Backend vs. Modelo de Dominio

Para evitar que la interfaz de usuario (UI) y las capas internas dependan directamente de la estructura rígida del backend, se implementó una separación estricta mediante una función de mapeo (`mapIncidentDtoToDomain`):

*   **DTO del Backend:** Contiene los campos nativos que entrega el servidor tal cual (`description`, `location`, `category`, etc.).
*   **Modelo de Dominio (Incident):** Utiliza la estructura estandarizada y propia de la aplicación (`title`, `category`, `status`, `reporterId`).
*   **Justificación del Mapeo:** Se desacopla la UI del backend. La función de mapeo valida estrictamente que campos obligatorios como la categoría (validada contra los tipos reales de `IncidentCategory`) y la descripción no estén vacíos antes de pasarlos al dominio, evitando inventar datos y devolviendo `null` en caso de fallos.

---

## 4. Representación de Errores del Cliente Cloud

El cliente maneja 4 tipos específicos de error (`CloudClientError.kind`) para un control robusto de fallos:

1.  **`invalid_payload`**: Ocurre cuando la estructura de los datos enviados o recibidos no cumple con el esquema esperado, falta algún campo obligatorio (como categoría o descripción válida) o está malformada.
2.  **`timeout`**: Se dispara cuando la solicitud excede el tiempo límite de espera configurado en el cliente (fijado en **4000 ms**).
3.  **`server_error`**: Representa fallas del servidor o respuestas no exitosas devueltas por la API, cubriendo cualquier código de respuesta no exitoso (incluyendo códigos del rango 4xx, no limitándose exclusivamente a 5xx).
4.  **`network_error`**: Ocurre por problemas de conectividad de red o cuando no se puede establecer comunicación con el backend.

---

## 5. Reglas de Validación de Payload

*   **Payload `null`:** Se considera un valor **válido** (por ejemplo, en respuestas o acciones exitosas donde no hay datos adicionales que retornar en el payload) y es estrictamente distinto de un payload malformado, corrupto o incompleto.