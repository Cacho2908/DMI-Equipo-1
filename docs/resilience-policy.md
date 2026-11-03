# Política de resiliencia

Photon proporciona sugerencias opcionales. La consulta externa registrada devolvió HTTP 200 y una parada en Curitiba para una búsqueda ficticia. El resultado ilustra que una sugerencia puede ser imprecisa. El formulario permite conservar la ubicación escrita. El caché SQLite conserva resultados válidos durante 24 horas, con un límite de 50 entradas. Ante errores o coordenadas inválidas se usa la ubicación manual.

La sincronización limita cada ciclo a cuatro intentos. Respeta Retry-After en segundos o fecha HTTP y se detiene si la espera supera el presupuesto. Las escrituras conservan clave y cuerpo entre intentos. Al agotar el ciclo, la cola mantiene la operación pendiente. Una sesión cancelada detiene las repeticiones.

La prueba real contra el servidor local comprueba HTTP 429, espera indicada por Retry-After, pérdida de confirmación y recuperación desde SQLite sin duplicar efectos. Se reproduce con npm run test:week09:hector.

Detalles en week-09-hector.md y evidencia externa en reports/week-09/provider-execution.json.
