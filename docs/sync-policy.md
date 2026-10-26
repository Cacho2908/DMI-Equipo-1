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

