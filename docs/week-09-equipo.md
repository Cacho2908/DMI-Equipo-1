# Semana 09 — plan de Héctor, Fátima y Janeth

Entrega: lunes 2 de noviembre de 2026, 23:59, Ciudad de México. Misma app y repositorio; Expo 57, React Native y TypeScript; Node 22.22.0. No reinstalar el starter ni cambiar las versiones.

## Reparto y dependencias

| Integrante / rama | Responsabilidad | Archivos principales | Evidencia verificable |
|---|---|---|---|
| Héctor / `week09/hector-reintentos` | Política, ejecución de reintentos, integración de cola/sesión y respuesta perdida con HTTP + SQLite reales; integración final | `src/domain/resilience/retryPolicy.ts`, `src/infrastructure/http/retryExecutor.ts`, clientes HTTP, `tools/week09-hector-check.cjs` | Límites, Retry-After, cancelación, misma clave/contenido, una resolución y referencia |
| Fátima / `week09/fatima-ubicacion` | Adaptadores de geocodificación externo/controlado, caché y pruebas | `src/infrastructure/location/`, `src/application/location/locationService.ts`, `course-tests/team/week-09-location.test.ts`, `docs/week-09-provider.md` | Éxito, caché/TTL, datos inválidos/incompletos, timeout real, 429 y desconexión; una consulta externa real |
| Janeth / `week09/janeth-interfaz` | Selección de ubicación válida/manual, pantalla conectada al servicio, pruebas de UI y política del equipo | `src/domain/location/selectIncidentLocation.ts`, export correspondiente en `src/course-evaluation/index.ts`, `src/ui/components/IncidentLocationPicker.tsx`, `App.tsx`, `course-tests/team/week-09-location-ui.test.tsx`, `docs/resilience-policy.md` | Edificio/zona/referencia utilizable cuando falla proveedor, coordenadas válidas solamente, flujo real de creación de reporte |

Las tres cargas incluyen implementación, pruebas y explicación. Héctor integra al final los reportes de las tres partes. Cada una conserva sus commits y escribe su propio registro individual. Nadie declara pruebas personales que sólo ejecutó la IA.

## Acuerdo técnico para trabajar sin pisarse

No necesitamos instalar mapas nativos ni solicitar GPS: la consigna permite geocodificación. El usuario escribe una ubicación ficticia y pulsa Buscar; nunca consultar por cada tecla. Proveedor propuesto: Photon (`https://photon.komoot.io/api/`). Su demo no garantiza disponibilidad; uso moderado, caché, sin carga/estrés ni datos personales. Mostrar atribución OpenStreetMap. Referencia oficial: https://github.com/komoot/photon#demo-server . El endpoint externo debe ser configurable y no recibir headers/tokens del backend del curso.

La consulta externa de evidencia puede usar `Edificio ficticio CampusOps 10A E01`: si no devuelve coincidencias, se documenta ese resultado real y se usa captura manual. No elegir una coincidencia irrelevante como si fuera el edificio ficticio. El éxito determinista se prueba con el doble del curso; el doble no reemplaza la ejecución externa. Si la ejecución externa falla, registrarlo honestamente y revisar con el docente si requiere una ejecución exitosa adicional.

Contrato acordado que Fátima debe exportar (Janeth lo consume):

```ts
// src/application/location/locationService.ts
import type { IncidentLocation } from '../../campusops/contracts';
export interface LocationService {
  select(query: string, manualLabel: string): Promise<IncidentLocation>;
  clearCache(): Promise<void>;
}
export function createLocationService(): LocationService;
```

Fátima recibe resultados desconocidos en su adaptador, normaliza Photon GeoJSON (coordinates es LONGITUD, LATITUD) al contrato `{label, latitude, longitude}` y usa la función de Janeth para validar. Puede desarrollar contra una función inyectada para no esperar el merge; la composición final debe usar la función real. Un resultado no disponible es `null`. No importar funciones de evaluación desde la lógica de ubicación: importar `src/domain/location/selectIncidentLocation.ts` evita ciclos. La exportación evaluable sólo delega a esa función real.

Caché: clave proveedor + consulta normalizada, TTL 24 h configurable, máximo 50 resultados válidos, reloj inyectable, no renovar TTL al leer. Preferir tabla SQLite separada creada con `CREATE TABLE IF NOT EXISTS` y sin alterar `PRAGMA user_version` de la cola. No almacenar errores, inválidos ni etiquetas manuales como resultados del proveedor. Expirado/ausente + red caída => manual; no inventar coordenadas. La etiqueta manual actual tiene prioridad sobre una alternativa manual antigua. Deduplicar solicitudes concurrentes de la misma consulta y limitar frecuencia de consultas externas (regla interna: al menos 1 s; Photon no publica ese número como cuota).

Para el doble del curso usar `/v1/geocoding?q=...`, fixtures de sesión y `X-Course-Scenario` sólo contra localhost/IP de laboratorio: success, incomplete, invalid_coordinates, nullable, malformed, slow, rate_limited. AbortController con timeout finito (por ejemplo 300 ms para probar slow=1200 ms). Desconexión: transporte que rechaza o endpoint local cerrado. La app normal no debe enviar headers de inyección a Photon.

Janeth: validar objeto no-array; label string no vacío; lat/lon tipo number, finitos, dentro de [-90,90]/[-180,180]; aceptar 0 y extremos. Si falla, `{source:'manual', label:manualLabel}` sin propiedades de coordenadas. La precondición es etiqueta manual no vacía; la pantalla exige `trim()` antes de continuar.

Pantalla: en sesión reportante añadir formulario de reporte (descripción, categoría válida y edificio/zona/referencia), botón Buscar ubicación opcional, fuente elegida y botón Crear reporte. Usar `createCloudIncidentClient(...).createIncident({category,description,location:seleccion.label})`; el backend exige location textual. Conservar el texto manual y permitir crear aunque falle Photon; no bloquear el formulario detrás de la búsqueda. No enviar coordenadas en lugar del texto del contrato. Ocultar/limpiar el formulario al cerrar sesión, ignorar respuestas obsoletas y desactivar doble envío. No regenerar una identidad si se vuelve a enviar una creación que pudo guardarse: extender el cliente para aceptar un `operationId` generado una sola vez por borrador (y conservarlo junto con el mismo cuerpo); usar los reintentos de Héctor o cola persistida. No afirmar que un error de red significa que no se guardó.

Héctor ya dejó `fetchJson(..., init, retryOptions)` y `executeWithRetry`. Para geocodificación externa Fátima puede usar `executeWithRetry` con GET, timeout por intento y headers Retry-After; no debe usar el cliente autenticado del curso para Photon. Usar máximo 2 intentos en ubicación para llegar pronto a la alternativa manual y baseDelayMs de al menos 1000 para el proveedor externo. El máximo general permitido es 4 intentos, nunca 5.

## Paso a paso común (después de publicar la rama compartida)

1. Abrir la carpeta existente CampusOps-Semana-01 en VS Code y una terminal PowerShell.
2. Ejecutar `git status`. Si hay trabajo propio sin guardar, guardarlo en su rama antes de cambiar. No borrar archivos ni usar reset hard. Los reportes viejos no entran en esta entrega.
3. Ejecutar `git fetch origin`, `git switch semana-09`, `git pull --ff-only origin semana-09`.
4. Cada integrante crea SU rama indicada en la tabla con `git switch -c NOMBRE`. Si ya existe, usar `git switch NOMBRE`.
5. Comprobar `node --version` = v22.22.0 y `npm ci`. El backend se inicia aparte con `npm run backend`.
6. Leer `docs/assignments/week-09.md`, `week-09-repository.md`, `week-09-rubric.md`, `docs/CAMPUSOPS_API.md`, este acuerdo y `docs/EVIDENCE_CONTRACT.md`.
7. Implementar sólo los archivos asignados; no cambiar pruebas públicas ni quitar controles existentes.
8. Ejecutar pruebas propias, `npm run typecheck` y `npm run lint`; corregir errores reales.
9. Revisar `git diff` y agregar rutas concretas con `git add RUTAS`. Evitar `git add .` porque existen reportes viejos sin seguimiento.
10. Hacer commit con su identidad Git registrada y mensaje descriptivo; consultar `git rev-parse HEAD`.
11. Ejecutar `git push -u origin NOMBRE-DE-SU-RAMA`.
12. Crear PR con BASE `semana-09` y COMPARE su rama. Revisar el destino antes de crear. No hacer push directo a main.
13. Enviar a Héctor enlace del PR, SHA completo, comando y salida real de pruebas, archivos y explicación. Compartir sus campos para el ÚNICO `evidence/week-09/individual.json`.

## Fátima: orden de trabajo y pruebas

1. Crear su rama y las carpetas de ubicación; implementar normalizador Photon y cliente HTTP externo configurable. No añadir una dependencia de mapas ni claves.
2. Implementar el adaptador controlado del curso y puertos inyectables (fetch, reloj, caché, espera) para pruebas.
3. Implementar caché con límites anteriores y servicio `select`. Si proveedor/caché falla, devolver alternativa manual mediante selector real.
4. Probar éxito y límites de coordenadas, mismo query dos veces con una llamada, vencimiento con nueva consulta, límite de tamaño, aislamiento entre proveedores y solicitudes concurrentes.
5. Probar incomplete/invalid/nullable/malformed, timeout con abort real, 429 con Retry-After y desconexión; nunca guardar un resultado inválido.
6. Ejecutar `npx jest --runInBand course-tests/team/week-09-location.test.ts` y guardar resultados.
7. Ejecutar UNA consulta externa real con datos ficticios. Registrar fecha ISO, proveedor, comando, estado HTTP, duración y resultado sanitizado en `reports/week-09/provider-execution.json`; no inventar éxito y no registrar tokens ni texto de usuarios reales. Separar prueba externa de tests repetibles.
8. Documentar restricciones/caché/resultado en `docs/week-09-provider.md`; enviar a Janeth datos para la política y a Héctor observaciones para los reportes finales.
9. Commit, push y PR hacia semana-09. Declarar asistencia IA si la utiliza y completar SU evidencia.

## Janeth: orden de trabajo y pruebas

1. Crear su rama, implementar selector puro y sustituir ÚNICAMENTE el stub selectIncidentLocation de evaluación por reexport real. No modificar la exportación planRetry.
2. Crear componente con servicio inyectable: etiqueta manual siempre editable, búsqueda opcional, resultado/fuente y estado de búsqueda. Los mocks de UI son para control de fallos, no sustituyen el servicio de producción.
3. Integrar componente en formulario de creación reportante y conectarlo al servicio de Fátima; extender identidad estable de creación como se explica arriba. Conservar sesión, cola y pantallas anteriores.
4. Probar proveedor válido y cada dato inválido; en UI, timeout/429/desconexión permiten continuar con texto manual; la creación envía ese texto y muestra confirmación real. Probar que repetir búsqueda y cerrar sesión no reaplican una respuesta antigua ni borran el texto manual.
5. Probar creación con respuesta perdida conservando operationId y cuerpo o reutilizar una prueba de integración de cliente real, sin reemplazar las aserciones públicas.
6. Ejecutar `npx jest --runInBand course-tests/team/week-09-location-ui.test.tsx course-tests/public/week-09.test.ts` (el adaptador real de Fátima debe estar integrado para la corrida final).
7. Redactar `docs/resilience-policy.md` con proveedor/restricciones, ejecución externa, caché/TTL, alternativa manual y la política de reintentos de `docs/week-09-hector.md`. Incluir cuándo parar y conservar operación pendiente.
8. Enviar observaciones con id/status/scenarioType/command/evidence a Héctor y sus campos individuales reales. Commit, push y PR hacia semana-09.

## Héctor: trabajo implementado y cierre pendiente del equipo

La implementación y pruebas de reintentos están en su rama. Ver `docs/week-09-hector.md`; ejecutar `npm run test:week09:hector`. Revisar y comprender antes de explicar. La ejecución automática inicial fue de Codex, no se atribuye como prueba manual de Héctor.

1. Publicar ramas semana-09 y week09/hector-reintentos; integrar primero su PR a semana-09 para que ambas compañeras partan de esta base.
2. Revisar PR de selector/ubicación y PR de UI. Si Janeth necesita el servicio de Fátima, integrar Fátima primero o desarrollar con puerto inyectado y unir ambos antes de checks finales. Resolver conflictos preservando trabajo de las dos y sus commits (merge, no squash).
3. Ejecutar pruebas del equipo y las anteriores; revisar también app Android: fallo proveedor => manual => crear reporte, y resolución con respuesta perdida sin duplicados.
4. Completar `docs/resilience-policy.md`, consolidar observaciones en `reports/week-09/fault-injection.json` y `retry-metrics.json`; conservar intentos/tiempos reales. Los archivos hector-* son evidencia parcial, NO sustituyen los reportes finales completos.
5. Integrar exactamente tres registros reales en `evidence/week-09/individual.json`, y actualizar `engineering.json` con alternativas, beneficio/costo y verificaciones reales de toda la integración. No usar SHAs de semana 8 como aportación de semana 9 ni inventar las contribuciones pendientes.
6. Hacer commit de código/documentación y obtener SHA técnico. Ejecutar con ese SHA los generadores de reportes; actualizar commitSha de todas las evidencias a esa versión.
7. Ejecutar `make feedback`, `make verify-week-09 PYTHON=python` y `make public-test-week-09 PYTHON=python`. Conservar errores y corregirlos; si cambia código, recomprobar y renovar SHA.
8. Hacer commit EXCLUSIVO de reports/ y evidence/ como hijo directo del técnico. Si se integra a main mediante PR, verificar que el commitSha sigue siendo el técnico final o su padre inmediato de evidencias aceptado; regenerar antes de fijar etiqueta si se añade un merge de código.
9. Crear `git tag -a week-09-final -m "DMI week 09 final"` sólo al estar completo. Ejecutar `make evidence-week-09 PYTHON=python`; si falla, corregir antes de enviar. No publicar etiqueta provisional ni mover la de semana 8.
10. Subir rama y etiqueta (push directo a main NO). Si se requiere integrar main, hacerlo por PR revisado y después etiquetar la versión exacta comprobada. Verificar en GitHub tag y SHA completo con `git rev-list -n 1 week-09-final`.
11. Cada quien entrega en Classroom enlace, etiqueta week-09-final y SHA completo, y comprueba estado Entregada. El quiz semanal es separado. Classroom pegado indica 3 puntos; guías instaladas dicen 2: confirmar con docente, no mezclarlo con los 8 de la actividad.

La tarea completa NO está lista mientras falten ubicación, UI y evidencias reales de las compañeras. No declarar checks finales aprobados antes de integrarlas.
