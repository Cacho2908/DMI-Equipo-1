import { createLocationService } from '../../src/application/location/locationService';
import type { LocationCache } from '../../src/infrastructure/location/sqliteLocationCache';
import type { IncidentLocation } from '../../src/campusops/contracts';

// Caché simulado para aislar las pruebas de la base de datos real
const createMockCache = (): LocationCache => {
  const store = new Map<string, IncidentLocation>();
  return {
    get: async (q) => store.get(q) || null,
    set: async (q, l) => { store.set(q, l); },
    clear: async () => store.clear()
  };
};

describe('Location Service', () => {
  let mockCache: LocationCache;

  beforeEach(() => {
    mockCache = createMockCache();
  });

  it('Debe devolver ubicación de proveedor en caso de éxito determinista', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ features: [{ properties: { name: 'Edificio A' }, geometry: { coordinates: [-99.1, 19.4] } }] })
    });
    const service = createLocationService(mockCache, mockFetch as any);
    
    const result = await service.select('query', 'Manual A');
    expect(result).toEqual({ source: 'provider', label: 'Edificio A', latitude: 19.4, longitude: -99.1 });
  });

  it('Debe deduplicar solicitudes concurrentes (misma query)', async () => {
    const mockFetch = jest.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50)); // Simula retardo
      return { ok: true, status: 200, json: async () => ({ features: [{ properties: { name: 'X' }, geometry: { coordinates: [0, 0] } }] }) };
    });
    const service = createLocationService(mockCache, mockFetch as any);
    
    // Lanzamos dos promesas al mismo tiempo
    const [res1, res2] = await Promise.all([
      service.select('test-dedup', 'Manual'),
      service.select('test-dedup', 'Manual')
    ]);
    
    expect(res1).toEqual(res2);
    expect(mockFetch).toHaveBeenCalledTimes(1); // Solo hizo una llamada real
  });

  it('Debe caer a manual si los datos son inválidos (coordenadas fuera de límite)', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ features: [{ properties: { name: 'Falla' }, geometry: { coordinates: [200, 100] } }] }) // Lat/Lon inválidos
    });
    const service = createLocationService(mockCache, mockFetch as any);
    
    const result = await service.select('query', 'Fallo Manual');
    expect(result).toEqual({ source: 'manual', label: 'Fallo Manual' });
  });

  it('Debe manejar un HTTP 429 (Rate Limit) y caer a manual tras fallar reintentos', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false, status: 429, headers: new Headers({ 'Retry-After': '1' })
    });
    const service = createLocationService(mockCache, mockFetch as any);
    
    const result = await service.select('query', 'Limite Excedido');
    expect(result).toEqual({ source: 'manual', label: 'Limite Excedido' });
  });

  it('Debe manejar un timeout/desconexión real y caer a manual', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network request failed'));
    const service = createLocationService(mockCache, mockFetch as any);
    
    const result = await service.select('query', 'Desconectado');
    expect(result).toEqual({ source: 'manual', label: 'Desconectado' });
  });
});
