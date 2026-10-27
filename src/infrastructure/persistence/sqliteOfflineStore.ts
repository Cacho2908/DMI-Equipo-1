import { migrateDatabase } from './sqliteAdapter';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { OfflineStore, PendingOperation } from '../../domain/offline';
import type { IncidentSnapshot } from '../../domain/incidentActions';
import { equalJson } from '../../domain/sync/resolveSync';
export function createSqliteOfflineStore(open: () => Promise<SQLiteDatabase> = async () => {
  const sqlite = await import('expo-sqlite');
  return sqlite.openDatabaseAsync('campusops-offline.db');
}, migrationHook?: () => void): OfflineStore {
  let ready: Promise<SQLiteDatabase> | null = null;
  async function database(): Promise<SQLiteDatabase> {
    if (!ready) ready = (async () => {
      const db = await open();
      await migrateDatabase(db, migrationHook);
      return db;
    })().catch(error => { ready = null; throw error; });
    return ready;
  }
  async function read(tx: SQLiteDatabase, actor: string, id: string): Promise<PendingOperation | null> {
    const row = await tx.getFirstAsync<{ data: string }>('SELECT data FROM pending_operations WHERE actor_id=? AND operation_id=?', actor, id);
    return row ? JSON.parse(row.data) as PendingOperation : null;
  }
  return {
    async initialize() { await database(); },
    async saveRemote(actor, incident) {
      await (await database()).runAsync('INSERT OR REPLACE INTO incidents(actor_id,id,data) VALUES(?,?,?)', actor, incident.id, JSON.stringify(incident));
    },
    async listCached(actor) {
      return (await (await database()).getAllAsync<{ data: string }>('SELECT data FROM incidents WHERE actor_id=? ORDER BY id', actor)).map(r => JSON.parse(r.data) as IncidentSnapshot);
    },
    async enqueue(operation) {
      await (await database()).withExclusiveTransactionAsync(async tx => {
        const previous = await tx.getFirstAsync<{ data: string }>('SELECT data FROM pending_operations WHERE operation_id=?', operation.operationId);
        if (previous) { if (!equalJson(JSON.parse(previous.data), operation)) throw new Error('operation_identity_reused'); return; }
        if (await tx.getFirstAsync('SELECT operation_id FROM operation_archive WHERE operation_id=?', operation.operationId)) throw new Error('operation_already_archived');
        if (await tx.getFirstAsync('SELECT operation_id FROM pending_operations WHERE actor_id=? AND incident_id=?', operation.actorId, operation.incidentId)) throw new Error('incident_has_pending_operation');
        await tx.runAsync('INSERT INTO pending_operations(operation_id,actor_id,incident_id,data) VALUES(?,?,?,?)', operation.operationId, operation.actorId, operation.incidentId, JSON.stringify(operation));
        await tx.runAsync('INSERT OR IGNORE INTO incidents(actor_id,id,data) VALUES(?,?,?)', operation.actorId, operation.incidentId, JSON.stringify(operation.base));
      });
    },
    async listPending(actor) {
      return (await (await database()).getAllAsync<{ data: string }>('SELECT data FROM pending_operations WHERE actor_id=? ORDER BY rowid', actor)).map(r => JSON.parse(r.data) as PendingOperation);
    },
    async mark(actor, id, status, fields, code) {
      await (await database()).withExclusiveTransactionAsync(async tx => {
        const operation = await read(tx, actor, id);
        if (operation) await tx.runAsync('UPDATE pending_operations SET data=? WHERE actor_id=? AND operation_id=?', JSON.stringify({ ...operation, status, conflictFields: fields, lastErrorCode: code }), actor, id);
      });
    },
    async confirm(actor, id, incident) {
      await (await database()).withExclusiveTransactionAsync(async tx => {
        const op = await read(tx, actor, id);
        if (!op || op.incidentId !== incident.id) throw new Error('confirmation_mismatch');
        const cached = await tx.getFirstAsync<{ data: string }>('SELECT data FROM incidents WHERE actor_id=? AND id=?', actor, incident.id);
        if (!cached || (JSON.parse(cached.data) as IncidentSnapshot).version <= incident.version) await tx.runAsync('INSERT OR REPLACE INTO incidents(actor_id,id,data) VALUES(?,?,?)', actor, incident.id, JSON.stringify(incident));
        await tx.runAsync('INSERT OR REPLACE INTO operation_archive(operation_id,actor_id,data,reason) VALUES(?,?,?,?)', id, actor, JSON.stringify(op), 'confirmed');
        await tx.runAsync('DELETE FROM pending_operations WHERE actor_id=? AND operation_id=?', actor, id);
      });
    },
    async archiveResolution(actor, id, reason) {
      if (!reason.trim()) throw new Error('resolution_reason_required');
      await (await database()).withExclusiveTransactionAsync(async tx => {
        const op = await read(tx, actor, id);
        if (!op || op.status === 'pending') throw new Error('unresolved_operation');
        await tx.runAsync('INSERT INTO operation_archive(operation_id,actor_id,data,reason) VALUES(?,?,?,?)', id, actor, JSON.stringify(op), reason);
        await tx.runAsync('DELETE FROM pending_operations WHERE actor_id=? AND operation_id=?', actor, id);
      });
    },
  };
}


