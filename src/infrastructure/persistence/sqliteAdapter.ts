import type { SQLiteDatabase } from 'expo-sqlite';

/** Esquema compartido de la app. Falla inyectable sólo desde pruebas. */
export async function migrateDatabase(db: SQLiteDatabase, failDuringMigration?: () => void): Promise<void> {
  await db.withExclusiveTransactionAsync(async tx => {
    const result = await tx.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const version = result?.user_version ?? 0;
    if (version > 2) throw new Error('unsupported_schema');
    if (version < 1) {
      await tx.execAsync(`CREATE TABLE incidents(actor_id TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(actor_id,id));
        CREATE TABLE pending_operations(operation_id TEXT PRIMARY KEY NOT NULL,actor_id TEXT NOT NULL,incident_id TEXT NOT NULL,data TEXT NOT NULL);
        PRAGMA user_version=1;`);
    }
    if (version < 2) {
      await tx.execAsync(`CREATE TABLE operation_archive(operation_id TEXT PRIMARY KEY NOT NULL,actor_id TEXT NOT NULL,data TEXT NOT NULL,reason TEXT NOT NULL);
        CREATE INDEX pending_actor ON pending_operations(actor_id);`);
      failDuringMigration?.();
      await tx.execAsync('PRAGMA user_version=2;');
    }
  });
}

/** Una sola base: la cola y las migraciones usan el mismo archivo. */
export async function initializeDatabase(
  open: () => Promise<SQLiteDatabase> = async () => {
    const SQLite = await import('expo-sqlite');
    return SQLite.openDatabaseAsync('campusops-offline.db');
  },
  failDuringMigration?: () => void,
): Promise<SQLiteDatabase> {
  const db = await open();
  await migrateDatabase(db, failDuringMigration);
  return db;
}
