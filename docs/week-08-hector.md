# Integración de Héctor — semana 8
## Rama y alcance
week08/hector-sincronizacion nace de semana-08. No se modifica main. Git impide crear semana-08/hector porque ya existe semana-08: usar prefijo week08.
Se implementaron coordinador, gateway, interfaz y contratos. Como aún no había implementación de compañeras en la rama consultada, se incluyen adaptadores mínimos de almacenamiento y combinación para ejecutar la integración. Fátima y Janeth deben revisar sus áreas y aportar evidencia propia.
## Comandos
npm ci
node --test tools/week08-hector-check.cjs
npm run typecheck
npm run lint
npm run test:smoke
npm test -- --ci --runInBand course-tests/public/week-08.test.ts
make feedback
make verify-week-08
make public-test-week-08
En Windows, si python3 apunta al alias de Store, usar make PYTHON=python verify-week-08.
## Android: comprobación aún necesaria
1. Tener JDK y SDK compatibles según README y un emulador Android o dispositivo.
2. Configurar EXPO_PUBLIC_COURSE_BACKEND_URL=http://10.0.2.2:4310 para emulador antes de iniciar Metro. No guardar secretos en esa variable.
3. Ejecutar npm run backend en otra terminal; no reiniciarlo a mitad de una prueba idempotente.
4. Reconstruir el cliente nativo con npm run android para incluir expo-sqlite y expo-crypto.
5. Login technician-1, abrir campus-inc-001; esperar caché. Activar modo de prueba offline, guardar inicio de atención y nota ficticia.
6. Cerrar realmente la app (sin borrar datos), reabrir y autenticarse de nuevo si la sesión lo exige. Comprobar pendiente, identidad y nota. Repetir desconectando la red con sesión válida; el botón de prueba no sustituye la desconexión real.
7. En sesión de coordinación separada o cliente del backend, reasignar la incidencia a technician-2. Reconectar y pulsar Sincronizar. Debe conservarse intención bloqueada/conflictiva; no imponer la asignación antigua.
8. Archivar explícitamente la intención aceptando no aplicarla. La fila se conserva en operation_archive.
9. Probar comentario y referencia sintética por separado. Referencia no equivale a fotografía subida.
10. Registrar comandos, dispositivo, esperado y observado. No marcar esta ejecución como pasada antes de realizarla.
## Evidencias
El registro hector.json es una ficha para incorporar al individual.json de tres integrantes, no lo sustituye. Las pruebas automáticas de esta intervención las ejecutó Codex; no se atribuyen como ejecución personal a Héctor. Revisar y explicar el código antes de entregar. No crear week-08-final hasta completar evidencia del equipo y las comprobaciones.
## Incidencia anterior conocida
La prueba FM-08 de course-tests/team/week-05-contract.test.ts espera omitir elementos corruptos, pero el cliente existente rechaza la lista con invalid_payload y comenta explícitamente esa política. El fallo ya estaba mencionado en la evidencia de semana 6. No se alteró esa prueba ni el cliente para ocultarlo.


## Compatibilidad de comprobaciones en Windows
El evaluador suministrado no encontraba npm mediante subprocess en esta instalación. Se agregó resolución con shutil.which antes de ejecutar el mismo comando. Se conservan argumentos, checks y códigos de error; se comprobó explícitamente que un proceso con salida 17 sigue fallando. Usar make PYTHON=python verify-week-08 si python3 es el alias de Store.
