# Modelo local de semana 8
Trabajo integrado de Fátima y Héctor. Se conservaron sus commits y se unificó la migración con el almacenamiento utilizado por la app.
## Almacenamiento
SQLite mediante expo-sqlite, instalado con el rango compatible publicado en bundledNativeModules.json del Expo 57 instalado. Archivo campusops-offline.db. Tokens continúan en SecureStore; no se copian a SQLite. Datos exclusivamente ficticios.
incidents: clave compuesta actor_id,id y data JSON con snapshot remoto.
pending_operations: operation_id único, actor_id, incident_id y data JSON con identidad, baseVersion, base, local, solicitud inmutable, nota local, fecha, estado, campos conflictivos y código controlado.
operation_archive: identidad, actor, contenido íntegro y motivo; conserva confirmaciones y resoluciones explícitas, incluidas notas locales.
El cambio local se representa por la operación persistida, sin sobrescribir la base remota. La UI superpone sólo pendientes normales. Una incidencia admite una operación pendiente por actor para evitar dependencias de versión implícitas.
## Migraciones
PRAGMA user_version: 1 crea caché y cola; 2 agrega archivo e índice. Esquema 1 es una fixture creada para este hito, no un despliegue histórico inventado.
Inicialización y migraciones usan withExclusiveTransactionAsync. Cambio de esquema y versión se confirman juntos. Una falla revierte la transacción y permite reintentar. Versiones futuras se rechazan.
enqueue inserta cola y base conjuntamente; confirm actualiza el caché, archiva la operación completa y retira el pendiente conjuntamente. La versión del caché no retrocede al confirmar una respuesta antigua.
## Pruebas
node --test tools/week08-hector-check.cjs ejecuta el adaptador de producción con un puente a SQLite real de Node, archivo temporal en disco y backend HTTP real. Cierra y reabre la base, prueba rollback de esquema y de confirmación.
Esto NO acredita todavía el módulo Expo SQLite ni cierre/reapertura de Android. Procedimiento nativo: docs/week-08-hector.md.
## Aislamiento y límites
Lecturas y escrituras se filtran por actor autenticado. Logout oculta datos y cambia la revisión de sesión, sin borrar pendientes. No se ofrece acceso offline tras un reinicio sin autenticación válida. Las notas adjuntas a una acción son anotaciones locales archivadas; para enviarlas usar comentario pendiente. Los IDs de evidencia son recursos sintéticos, no archivos fotográficos ni prueba de carga.


## Integración final del equipo
La migración reside en src/infrastructure/persistence/sqliteAdapter.ts; sqliteOfflineStore.ts la invoca al abrir campusops-offline.db. Se retiró la excepción permanente del primer adaptador de Fátima. Ahora el fallo se inyecta sólo desde pruebas y se propaga, sin presentarlo como una inicialización exitosa. La app no crea una segunda base campusops.db. El esquema v1/v2 documentado arriba corresponde al adaptador conectado, con los metadatos de operación serializados en data. Las cuatro pruebas tests/unit/sqlite-queue.test.ts ejecutan el adaptador real contra SQLite en disco mediante el comprobador Node; no sustituyen Android nativo.
