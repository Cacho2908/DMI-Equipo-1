# Prueba Android manual de Hector

Fecha: 26 de octubre de 2026, Ciudad de Mexico. Telefono Android con Expo Go SDK 57. Modelo y version Android no proporcionados. Ejecucion manual de Hector; documentacion de Codex a partir de capturas y salidas compartidas.

- Pendiente start de technician-1 recuperado al cerrar/reabrir e iniciar sesion.
- Coordinacion reasigno campus-inc-001 de technician-1 a technician-2: version 2, assigned. El start anterior quedo Bloqueada y conservado. El GET posterior mantuvo version 2 y solo el evento assign.
- technician-2 guardo otro start con red interrumpida y la nota Prueba Android: nota guardada sin conexion. La captura muestra la nota dentro del recuadro persistido.
- Al cerrar/reabrir Expo Go sin red aparecio Something went wrong. Hector tuvo que reconectar para cargar el proyecto y autenticarse. Despues recupero el pendiente con la nota. No se declara arranque totalmente offline.
- Tras sincronizar con conexion, GET mostro version 3, in_progress, technician-2 y un unico start con operationId 7e425552-f525-4526-8486-aba6b8496e2e.
- Tras otra sincronizacion sin crear otra accion, GET mantuvo version 3 y exactamente dos eventos: assign version 2 y start version 3.

Limites: no se mostro el UUID antes del cierre, por lo que no se comparo visualmente su identidad antes/despues. La segunda sincronizacion no equivale a reenviar el mismo POST con la misma clave; ese caso tiene pruebas automaticas HTTP y SQLite. La nota adjunta es local: notes del servidor quedo vacio. No se probo carga de fotografias. La primera nota de technician-1 estaba solo en un campo sin guardar y no se conto como persistida.
