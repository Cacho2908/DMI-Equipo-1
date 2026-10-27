# Política de sincronización e idempotencia
## Decisión
Cola SQLite persistente y explícita, sincronización manual secuencial, identidad UUID por intención y clasificación de conflictos con comparación de tres versiones. Se conservan las funciones y controles de semanas anteriores.
## Identidad y confirmación
Guardar antes de enviar. operationId, autor, incidencia, baseVersion y request son inmutables. El cliente usa operationId en Idempotency-Key y verifica coincidencia del ID de operación, incidencia y versión de la confirmación.
Reenviar primero la misma operación: el servidor puede haber escrito aunque la respuesta se pierda. No consultar una base nueva y descartar como conflicto una escritura ya confirmada en servidor. Repetición produce un solo efecto en el historial.
Sólo una confirmación validada permite actualizar caché, archivar y retirar cola en una transacción. Error de disco deja la operación recuperable. Timeout, error de red o sesión inválida detienen la ejecución sin bucles.
## Combinación y conflicto
Comparación por contenido JSON, claves de objetos sin depender de su orden; arreglos ordenados. Distinguir ausente y null. Cambios independientes se combinan; cambios iguales no son conflicto; cambios diferentes al mismo campo se informan ordenados. work une asignado y estado.
El adaptador evaluable usa la misma implementación que el coordinador.
Un 409 consulta el remoto si está autorizado. Se preservan intención y base; se guarda el remoto por separado. Aunque los campos sean compatibles, un nuevo POST sobre otra base requiere una intención nueva: nunca se altera el cuerpo o clave de un envío incierto. Esta versión requiere resolución explícita, no rebase automático.
Un 403 bloquea la intención y no intenta leer con otra identidad. Es el resultado real posible al reasignar a otro técnico. No se revela información ajena para mostrar un conflicto.
La pantalla ofrece aceptar no aplicar y archivar la intención, conservando contenido y motivo. Para aplicar una intención revisada, el usuario necesita acceso vigente y crear una operación nueva desde el dato actualizado. No existe opción de forzar.
## Sesión y concurrencia
Una sincronización comparte una promesa; se envía secuencialmente. Antes y después de cada solicitud se comprueban actor y revisión de sesión. Logout y nuevo login, incluso del mismo actor, invalidan respuestas anteriores. La renovación de sesión conserva el comportamiento compartido de semana 6.
La autorización local es orientativa con caché; el servidor conserva la decisión final.
## Beneficios, costos y alternativa
SQLite y transacciones reducen estados parciales; UUID evita colisiones de dos intenciones con igual acción y versión. Cuestan una dependencia nativa, pruebas Android y más estados. Una lista en memoria no sobrevive reinicio. Un sobrescrito por último escritor sería más sencillo, pero perdería reasignaciones o intenciones. La resolución explícita es conservadora y exige intervención cuando no se puede enviar sin revisar.
## Verificación y límites
node --test tools/week08-hector-check.cjs: persistencia real en disco con puente SQLite, rollback, single-flight, identidad, cambios de sesión, HTTP real e historial único.
Las pruebas nativas siguen documentadas aparte; no se afirma que una referencia de evidencia represente una imagen subida.

## Reglas de combinación y conflicto verificadas (pruebas SY-01 a SY-15)

`resolveSync(base, local, remote)` compara cada campo con la base común, por contenido JSON. Las pruebas están en `course-tests/team/week-08-sync.test.ts`.

| Situación | Resultado | Prueba |
|---|---|---|
| Solo cambió el lado local | Se conserva el cambio local | SY-01 |
| Solo cambió el remoto | Se conserva el cambio remoto | SY-02 |
| Cambiaron campos distintos | Se combinan | SY-03 |
| Ambos llegan al mismo contenido | Sin conflicto | SY-04 |
| Mismo campo, contenidos distintos | Conflicto en ese campo | SY-05 |
| Varios campos en conflicto | Se informan ordenados por nombre | SY-06 |
| Mismo objeto con claves en otro orden | Sin conflicto falso | SY-07 |
| Inicio local contra reasignación remota (`work`) | Conflicto en `work` | SY-08 |
| Solo inicio local, o solo reasignación remota | Se conserva el lado que cambió | SY-09, SY-10 |
| Propiedad ausente frente a `null` | Son distintas | SY-11 |
| Arreglos | El orden importa | SY-12 |
| Entradas | No se mutan y el resultado no comparte objetos con ellas | SY-13 |
| Registros de otra incidencia | Error `sync_identity_mismatch` | SY-14 |
| `operationId` repetido | Se conserva la primera operación, en orden | SY-15 |

**Ejemplo de la reasignación conflictiva.** Base: `work = { assignedTechnicianId: 'technician-1', status: 'assigned' }`. El técnico inicia atención sin conexión (`status: 'in_progress'`) y coordinación reasigna a `technician-2`. Ambos cambiaron `work` a contenidos distintos, así que el resultado es `{ kind: 'conflict', fields: ['work'] }` (SY-08). No se combina por campos internos: se conserva la intención local y la asignación remota queda como está. La resolución sigue la sección anterior: se informa el conflicto, no se ofrece "forzar mi cambio" y la autorización la decide el servidor (un `403` bloquea la intención).

**Límites.** La comparación se hace por campo de primer nivel: dentro de `work`, un cambio en cualquiera de sus partes cuenta como cambio de todo el campo. Estas pruebas verifican la función de dominio; el envío por HTTP, la idempotencia con el servidor y la persistencia en disco los verifican las pruebas de integración y de almacenamiento del equipo.

