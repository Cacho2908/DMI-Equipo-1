import type { IncidentLocation } from '../../campusops/contracts';
import { executeWithRetry } from '../../infrastructure/http/retryExecutor';
import { createSqliteLocationCache, type LocationCache } from '../../infrastructure/location/sqliteLocationCache';

export interface LocationService {
  select(query: string, manualLabel: string): Promise<IncidentLocation>;
  clearCache(): Promise<void>;
}

// Función inyectada temporal para validar como lo hará Janeth
function validateLocation(location: any, manualLabel: string): IncidentLocation {
  const isNumber = (val: any) => typeof val === 'number' && Number.isFinite(val);
  const validLat = isNumber(location.latitude) && location.latitude >= -90 && location.latitude <= 90;
  const validLon = isNumber(location.longitude) && location.longitude >= -180 && location.longitude <= 180;
  
  if (validLat && validLon) {
    return { source: 'provider', label: location.label || manualLabel, latitude: location.latitude, longitude: location.longitude };
  }
  return { source: 'manual', label: manualLabel.trim() };
}

export function createLocationService(
  cache: LocationCache = createSqliteLocationCache(),
  fetchFn: typeof fetch = global.fetch
): LocationService {
  const ongoingRequests = new Map<string, Promise<IncidentLocation>>();

  const fetchFromProvider = async (query: string, manualLabel: string): Promise<IncidentLocation> => {
    try {
      const result = await executeWithRetry(
        { method: 'GET', idempotencyKey: query },
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000); // Timeout real
          
          try {
            const response = await fetchFn(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`, {
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.status === 429) {
              const retryAfter = response.headers.get('Retry-After');
              return { status: 429, value: null, retryAfterMs: retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 };
            }

            if (!response.ok) return { status: response.status, value: null };

            const data = await response.json();
            return { status: 200, value: data };
          } catch (error: any) {
            clearTimeout(timeoutId);
            return { status: error.name === 'AbortError' ? 'timeout' : 0, value: null };
          }
        },
        {
          limits: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 2000 },
        }
      );

      // Normalizar GeoJSON de Photon a nuestro formato
      if (result && result.features && result.features.length > 0) {
        const feature = result.features[0];
        const [longitude, latitude] = feature.geometry.coordinates;
        const label = feature.properties.name || manualLabel;
        
        const validated = validateLocation({ label, latitude, longitude }, manualLabel);
        if (validated.source === 'provider') {
          await cache.set(query, validated);
          return validated;
        }
      }
      return { source: 'manual', label: manualLabel.trim() };

    } catch (error) {
      // Si la red cae o se cancelan reintentos, caemos a manual silenciosamente
      return { source: 'manual', label: manualLabel.trim() };
    }
  };

  return {
    async select(query: string, manualLabel: string): Promise<IncidentLocation> {
      if (!manualLabel || manualLabel.trim() === '') {
         return { source: 'manual', label: manualLabel };
      }

      // 1. Revisar caché
      const cached = await cache.get(query);
      if (cached) return cached;

      // 2. Deduplicar peticiones concurrentes
      if (ongoingRequests.has(query)) {
        return ongoingRequests.get(query)!;
      }

      // 3. Ejecutar y guardar promesa en mapa
      const requestPromise = fetchFromProvider(query, manualLabel).finally(() => {
        ongoingRequests.delete(query);
      });
      
      ongoingRequests.set(query, requestPromise);
      return requestPromise;
    },
    
    async clearCache() {
      await cache.clear();
    }
  };
}
