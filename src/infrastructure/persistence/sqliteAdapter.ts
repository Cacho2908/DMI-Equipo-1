import * as SQLite from 'expo-sqlite';

export async function initializeDatabase() {
  const db = await SQLite.openDatabaseAsync('campusops.db');
  
  // 1. Consultar la versión actual del esquema
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = result?.user_version || 0;

  // 2. Esquema 1: Tablas base (Simulando lo anterior)
  if (currentVersion === 0) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS incidents (
        incidentId TEXT,
        actorId TEXT,
        data TEXT,
        PRIMARY KEY (incidentId, actorId)
      );
      CREATE TABLE IF NOT EXISTS pending_operations (
        operationId TEXT PRIMARY KEY,
        actorId TEXT,
        incidentId TEXT,
        baseVersion INTEGER,
        base TEXT,
        local TEXT,
        request TEXT,
        createdAt TEXT
      );
    `);
    await db.execAsync('PRAGMA user_version = 1');
    currentVersion = 1;
    console.log("Migración a versión 1 exitosa");
  }

  // 3. Esquema 2: Estados de conflicto y archivo (Semana 8 - Migración Transaccional)
  if (currentVersion === 1) {
    try {
      // withTransactionAsync asegura que si algo falla, se hace un Rollback automático
      await db.withTransactionAsync(async () => {
        await db.execAsync(`
          ALTER TABLE pending_operations ADD COLUMN status TEXT DEFAULT 'pending';
          ALTER TABLE pending_operations ADD COLUMN conflictFields TEXT;
          ALTER TABLE pending_operations ADD COLUMN lastErrorCode TEXT;

          CREATE TABLE IF NOT EXISTS operation_archive (
            operationId TEXT PRIMARY KEY,
            actorId TEXT,
            reason TEXT,
            result TEXT
          );
        `);

        // 🚨 DEFECTO CONTROLADO  🚨
        // Esta línea detendrá la migración a la mitad para demostrar que los datos no se corrompen.
        throw new Error("Falla intencional en migración para evidencia de Janeth");

        await db.execAsync('PRAGMA user_version = 2');
        console.log("Migración a versión 2 exitosa");
      });
    } catch (error) {
      console.error("Rollback ejecutado. Error en migración:", error);
    }
  }
  
  return db;
}