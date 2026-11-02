# Semana 09 — reintentos e integración de Héctor

## Decisión implementada

El coordinador conserva la operación en SQLite antes del envío. Su gateway usa executeWithRetry y planRetry de producción. El adaptador evaluable exporta esa misma función. Cada ciclo permite 4 intentos totales (inicial + 3 repeticiones); desde intento 4 planRetry devuelve retry=false. Por defecto espera 400, 800 y 1600 ms; máximo de espera configurable 30000 ms y timeout de cada solicitud de 4000 ms, incluyendo descarga del cuerpo. Los límites permiten reducir intentos a 1..4, nunca ampliarlos a 5. Para tiempos mayores de Retry-After se informa indisponibilidad en lugar de adelantar una repetición.

Se repiten GET y POST con identidad estable ante timeout/desconexión, 408, 429, 500, 502, 503, 504. POST sin clave no se repite. 400/401/403/404/409/422 y JSON inválido paran; la renovación de sesión existente tiene su propio límite de una renovación y no se convierte en un reintento infinito. Un 409 sigue por la resolución de conflictos de semana 8; un 403 conserva intención bloqueada. No se reintenta con la sesión revocada ni tras cambiar su revisión.

Retry-After admite segundos y fecha HTTP. Se espera el mayor entre backoff y la demora válida recibida; inválidos/no finitos usan backoff. Si una espera válida excede el presupuesto, no se reduce y se detiene. Al agotar el ciclo, queda pendiente en disco y se informa indisponibilidad; no hay temporizador que reinicie ciclos. Un nuevo intento explícito del usuario conserva la identidad y el cuerpo almacenados. No generar otra clave para una operación cuya confirmación se perdió ni actualizar su baseVersion antes de repetirla.

## Instrumentación

RetryOptions.onAttempt recibe únicamente attempt, status, startedAtMs, durationMs, delayMs y retry. No se registra URL, consulta, diagnosis, cuerpo, token, actor ni coordenadas. sleep y now son inyectables para casos deterministas; las métricas de integración incluidas usan reloj/esperas reales. La caída del callback de métricas no convierte una escritura exitosa en fallo.

fetchJson conserva el comportamiento de una solicitud cuando no se pasan opciones. El gateway de cola activa la política; las lecturas y clientes anteriores conservan sus contratos. Fátima puede reutilizar executeWithRetry para su transporte externo sin headers de sesión CampusOps. Janeth puede pasar un operationId estable de borrador para creación e integrar el mismo ejecutor.

## Verificación reproducible

- `npm run typecheck`
- `npm run lint`
- `npm run test:week09:hector` (Node 22.22.0, SQLite del host y backend HTTP del curso, no requiere tener el backend 4310 abierto).
- `npm run test:week08` conserva las pruebas de la semana anterior.
- Pruebas públicas de semana 9: las de retry corresponden a esta parte; la de selectIncidentLocation sigue pendiente de Janeth hasta integrar su rama. No se desactivan ni alteran.

Para generar observaciones parciales con SHA real comprobado en PowerShell:

```powershell
$env:WEEK09_REPORT_SHA = git rev-parse HEAD
npm run test:week09:hector
Remove-Item Env:WEEK09_REPORT_SHA
```

La prueba real abre SQLite en disco, encola resolve, cierra/reabre la base y envía al backend sin modificarlo usando timeout_after_commit. El cliente aborta a 200 ms cuando el servidor ya guardó. La repetición conserva exactamente clave y cuerpo, recibe la confirmación guardada y elimina la cola. Se comprueba versión 4, un único evento resolve y una referencia de evidencia ya existente; otra sincronización con cola vacía no cambia nada. El proyecto no tiene un subsistema de notificaciones: no se afirma haber probado entrega de notificaciones. La referencia sintética no es una carga de imagen real.

No se atribuye esta ejecución del host a una prueba de Expo/Android ni a ejecución personal de Héctor. La prueba manual Android de semana 8 no es prueba de esta nueva integración.

## Alternativas y costo

- Repetir sin límite o con clave nueva: puede saturar y duplicar efectos; descartado.
- No repetir nunca: evita tráfico pero pierde recuperación automática cuando sólo desaparece la confirmación.
- Selección: repeticiones limitadas con clave/cuerpo constantes, esperas y estado persistido. Mejora recuperación; cuesta latencia y mantener estado/idempotencia en servidor. Ante ubicación fallida se debe continuar por texto manual (trabajo de ubicación/UI pendiente), sin sustituir una escritura perdida por un éxito inventado.
