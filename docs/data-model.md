# Modelo de Datos - Persistencia Local (Semana 8)
**Responsable:** Fatima Avelino Celis

La persistencia local se gestiona mediante `expo-sqlite` utilizando transacciones y control de versiones a través de `PRAGMA user_version`.

## Esquema de Tablas (Versión 2)

### 1. Tabla `incidents`
Conserva la última versión del servidor conocida por la aplicación.
- Se mantiene aislada mediante el campo `actorId` para evitar cruce de datos entre sesiones.

### 2. Tabla `pending_operations`
Almacena la cola de operaciones locales (intenciones) que aún no han sido confirmadas por el servidor.
| Campo | Uso |
|---|---|
| `operationId` | Identificador único (Idempotency-Key) generado antes del envío. |
| `actorId` | Usuario dueño de la operación. |
| `incidentId` | Incidencia afectada. |
| `baseVersion` | Versión remota utilizada al crear la operación local. |
| `base` | Contenido antes del cambio local. |
| `local` | Contenido después del cambio local. |
| `request` | Petición exacta que se enviará al servidor. |
| `status` | Estado actual: `pending`, `conflict` o `blocked`. |
| `createdAt` | Marca de tiempo para ordenamiento. |
| `conflictFields`| Registro de campos incompatibles. |
| `lastErrorCode` | Código técnico de error en caso de fallo. |

### 3. Tabla `operation_archive`
Almacena el historial de intenciones que entraron en conflicto y que el usuario decidió archivar.
- Campos principales: `operationId`, `actorId`, `reason` (motivo del conflicto) y `result` (resolución aplicada).

## Reglas de Idempotencia aplicadas en SQLite
- Si se intenta insertar un `operationId` duplicado con el **mismo contenido**, la base conserva la primera operación intacta.
- Si se intenta insertar un `operationId` duplicado con **contenido distinto**, la transacción rechaza la reutilización para proteger la integridad.