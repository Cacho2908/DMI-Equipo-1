# Proveedor de Geocodificación: Photon

- **Endpoint Configurado:** `https://photon.komoot.io/api/`
- **Tasa Límite (Rate Limit):** No publicada oficialmente, pero el adaptador impone una demora base de 1 segundo entre reintentos para no causar estrés.
- **Manejo de Caché:** 
  - Almacenamiento en tabla SQLite independiente (`location_cache`).
  - TTL (Tiempo de vida): 24 horas.
  - Límite FIFO: 50 resultados máximos almacenados.
  - No se almacenan errores de red (429, timeouts) ni consultas con coordenadas inválidas.
- **Resultado de Prueba Externa:** La búsqueda del edificio ficticio "CampusOps 10A E01" retorna un `FeatureCollection` vacío, lo cual redirige al usuario exitosamente a la etiqueta manual como alternativa.