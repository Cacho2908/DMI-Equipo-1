import * as SQLite from 'expo-sqlite';
import type { IncidentLocation } from '../../campusops/contracts';

export interface LocationCache {
  get(query: string): Promise<IncidentLocation | null>;
  set(query: string, location: IncidentLocation): Promise<void>;
  clear(): Promise<void>;
}

export function createSqliteLocationCache(
  dbName = 'campusops.db',
  now: () => number = Date.now
): LocationCache {
  const TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
  const MAX_RESULTS = 50;

  const initDb = async () => {
    const db = await SQLite.openDatabaseAsync(dbName);
    // Tabla independiente, sin usar PRAGMA user_version para no chocar con la Semana 8
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS location_cache (
        query TEXT PRIMARY KEY,
        result TEXT NOT NULL,
        expiresAt INTEGER NOT NULL
      );
    `);
    return db;
  };

  return {
    async get(query: string) {
      const db = await initDb();
      const row = await db.getFirstAsync<{ result: string; expiresAt: number }>(
        'SELECT result, expiresAt FROM location_cache WHERE query = ?',
        [query]
      );
      
      if (!row) return null;
      
      // Si ya expiró, lo borramos y devolvemos null (sin renovar TTL al leer)
      if (now() > row.expiresAt) {
        await db.runAsync('DELETE FROM location_cache WHERE query = ?', [query]);
        return null;
      }
      
      return JSON.parse(row.result) as IncidentLocation;
    },

    async set(query: string, location: IncidentLocation) {
      const db = await initDb();
      const expiresAt = now() + TTL_MS;
      
      // Enforzar límite de 50 resultados (FIFO)
      const countRow = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM location_cache');
      const count = countRow ? countRow.count : 0;
      
      if (count >= MAX_RESULTS) {
         // Borra el registro más viejo si se alcanza el límite
         await db.runAsync('DELETE FROM location_cache WHERE query = (SELECT query FROM location_cache ORDER BY expiresAt ASC LIMIT 1)');
      }

      await db.runAsync(
        'INSERT OR REPLACE INTO location_cache (query, result, expiresAt) VALUES (?, ?, ?)',
        [query, JSON.stringify(location), expiresAt]
      );
    },

    async clear() {
      const db = await initDb();
      await db.runAsync('DELETE FROM location_cache');
    }
  };
}