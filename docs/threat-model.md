# Modelo de amenazas — CampusOps (Semana 3)

## Activos a proteger
- Datos de incidencias (título, categoría, estado, quién la reportó).
- Identidad y rol de los tres perfiles (reportante, técnico, coordinador).
- Credenciales y tokens usados por la app y por el flujo de CI/CD.
- Registros (logs) generados por la app y por GitHub Actions.

## Fronteras de confianza
- Entre la app móvil (cliente) y el backend simulado de CampusOps.
- Entre el repositorio del equipo y el entorno de ejecución de GitHub Actions (CI).
- Entre el código fuente y cualquier archivo de configuración/registro que pudiera contener datos sensibles.

## Amenazas priorizadas

| # | Amenaza | Probabilidad | Impacto | Prioridad |
|---|---|---|---|---|
| 1 | Exponer credenciales (tokens, claves) en el repositorio o en logs | Media | Alto | Alta |
| 2 | Consultar incidencias ajenas sin autorización | Media | Medio | Media |
| 3 | Alterar asignaciones de incidencias sin permiso | Baja | Alto | Media |
| 4 | Filtrar datos sensibles en registros (logs) | Baja | Medio | Baja |

## Control y verificación por amenaza
1. **Exponer credenciales (prioridad alta)** — **Control:** escaneo automático de secretos (`secret_scan`) en cada ejecución del workflow de CI, antes de aceptar cambios. **Verificación:** `reports/week-03/security.json` documenta una detección real (`fail`) y su corrección (`pass`) — ver evidencia de Héctor. **Riesgo residual:** el escaneo detecta patrones conocidos (tokens de GitHub, claves AWS, llaves privadas); no detecta un secreto con formato no reconocido.
2. **Consultar incidencias ajenas sin autorización** — **Control previsto:** los casos de uso de aplicación (`listIncidents`, `getIncidentDetail`) deberán validar el rol/sesión del usuario antes de exponer datos, cuando se implemente sesión (semanas siguientes). **Verificación:** pendiente de prueba automatizada hasta que exista sesión real; por ahora se documenta como control previsto.
3. **Alterar asignaciones sin permiso** — **Control previsto:** solo el caso de uso de "reasignación" debe aceptar cambios de estado válidos según el flujo definido en `docs/CAMPUSOPS.md`. **Verificación:** se relacionará con pruebas de la capa de aplicación en semanas posteriores.
4. **Filtrar datos en registros (logs)** — **Control previsto:** evitar imprimir campos sensibles completos en consola/logs; usar identificadores en vez de contenido completo. **Verificación:** revisión manual del código de logging existente; sin datos sensibles reales en este hito.

## Justificación de la prioridad
Se prioriza "exponer credenciales" porque es la única amenaza con un control ya implementado y verificable automáticamente en este hito (CI real), mientras que las demás dependen de funcionalidad (sesión, permisos) que se construye en semanas posteriores. El riesgo que permanece en las amenazas 2-4 se documenta como previsto y se cerrará cuando exista el código correspondiente.