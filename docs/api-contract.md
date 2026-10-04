# Contrato de API y Mapeo de Dominio (Semana 5)

Este documento especifica el contrato de la API para el cliente de incidentes en la nube (`cloudIncidentClient.ts`), detallando las solicitudes HTTP, la estructura de respuesta (*envelope*), el mapeo entre los DTOs del backend y los modelos de dominio, la gestión de errores y las reglas de validación.

---

## 1. Solicitudes de la API (Endpoints)

El cliente interactúa con los siguientes endpoints principales:

*   **`GET /v1/incidents`**
    *   **Descripción:** Obtiene la lista completa de incidentes registrados en el sistema.
    *   **Headers requeridos:** `Authorization: Bearer <token>`, `Content-Type: application/json`.
*   **`GET /v1/incidents/:id`**
    *   **Descripción:** Obtiene el detalle de un incidente específico utilizando su identificador único.
    *   **Headers requeridos:** `Authorization: Bearer <token>`, `Content-Type: application/json`.
*   **`POST /v1/incidents`**
    *   **Descripción:** Crea un nuevo reporte de incidente en el servidor.
    *   **Headers requeridos:** `Authorization: Bearer <token>`, `Content-Type: application/json`.
    *   **Body de creación (Ejemplo):**
        ```json
        {
          "description": "Falla en el sensor de temperatura del garaje",
          "location": "Sector Norte"
        }
        ```

---

## 2. Estructura de Respuesta (Envelope)

Todas las respuestas exitosas de la API envuelven los datos reales dentro de un objeto contenedor estándar (*sobre*):

```json
{
  "id": "uuid-del-mensaje",
  "version": "1.0",
  "status": "success",
  "payload": {
    "description": "Falla en el sensor de temperatura del garaje",
    "location": "Sector Norte"
  }
}
```
*   **Detalle:** El objeto superior contiene los campos de metadatos (`id`, `version`, `status`), mientras que los datos reales de la entidad se encuentran albergados dentro de la propiedad `payload`.

---

## 3. Límite: DTO del Backend vs. Modelo de Dominio

Para evitar que la interfaz de usuario (UI) y las capas internas dependan directamente de la estructura rígida del backend, se implementó una separación estricta mediante una función de mapeo (`parseRemoteResource`):

*   **DTO del Backend:** Contiene los campos nativos que entrega el servidor tal cual (por ejemplo: `description`, `location`, etc.).
*   **Modelo de Dominio (Incident de la Semana 2):** Utiliza la estructura estandarizada y propia de la aplicación (por ejemplo: `title`, `category`, `status`).
*   **Justificación del Mapeo:** Se desacopla la UI del backend. Si la base de datos o la API cambia los nombres de sus columnas o estructura, la aplicación cliente no se rompe, ya que la función de mapeo traduce de forma centralizada los campos del DTO al modelo de dominio.

---

## 4. Representación de Errores del Cliente Cloud

El cliente maneja 4 tipos específicos de error (`CloudClientError.kind`) para un control robusto de fallos:

1.  **`invalid_payload`**: Ocurre cuando la estructura de los datos enviados o recibidos no cumple con el esquema esperado o está malformada.
2.  **`timeout`**: Se dispara cuando la solicitud excede el tiempo límite de espera configurado con el servidor.
3.  **`server_error`**: Representa fallas internas ocurridas en el servidor (códigos HTTP del rango 5xx).
4.  **`network_error`**: Ocurre por problemas de conectividad de red o cuando no se puede establecer comunicación con el backend.

---

## 5. Reglas de Validación de Payload

*   **Payload `null`:** Se considera un valor **válido** (por ejemplo, en respuestas o acciones exitosas donde no hay datos adicionales que retornar) y es estrictamente distinto de un payload malformado o corrupto.