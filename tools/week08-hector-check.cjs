/* Real SQLite engine + real course backend. No Expo/native execution is claimed here. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = require('node:fs').readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, filename);
};
const { createSqliteOfflineStore } = require('../src/infrastructure/persistence/sqliteOfflineStore.ts');
const { createOfflineSync } = require('../src/application/sync/offlineSync.ts');
const { resolveSync, deduplicateOperations } = require('../src/domain/sync/resolveSync.ts');
const { createOfflineSyncGateway } = require('../src/infrastructure/incidents/offlineSyncGateway.ts');
const { SessionManager } = require('../src/application/session/sessionManager.ts');
const { createHttpAuthGateway } = require('../src/infrastructure/session/httpAuthGateway.ts');
function adapter(db) {
  const value = {
    execAsync: async sql => db.exec(sql),
    getFirstAsync: async (sql, ...params) => db.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params),
    runAsync: async (sql, ...params) => db.prepare(sql).run(...params),
    withExclusiveTransactionAsync: async callback => {
      db.exec('BEGIN IMMEDIATE');
      try { await callback(value); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  return value;
}
const base = { id: 'campus-inc-001', version: 1, title: 'Falla ficticia', category: 'electrical', reporterId: 'reporter-1', assignedTechnicianId: 'technician-1', status: 'assigned' };
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'campusops-week08-'));
  const file = path.join(dir, 'data.db');
  const connections = [];
  function open() { const db = new DatabaseSync(file); connections.push(db); return db; }
  const db = open();
  const store = createSqliteOfflineStore(async () => adapter(db));
  return { store, db, open, cleanup() { for (const c of connections) { try { c.close(); } catch {} } rmSync(dir, { recursive: true, force: true }); } };
}
function coordinator(store, gateway, getSession) {
  let count = 0;
  return createOfflineSync({ store, gateway, session: getSession ?? (() => ({ actor: { actorId: 'technician-1', role: 'technician' }, revision: 1 })), newId: () => 'operation-test-' + (++count) });
}
test('SQLite: pending identity and local note survive close/reopen; actor isolation', async () => {
  const f = fixture();
  try {
    const sync = coordinator(f.store, {});
    const op = await sync.enqueue(base, { action: 'start' }, 'Nota ficticia recuperable');
    f.db.close();
    const reopened = createSqliteOfflineStore(async () => adapter(f.open()));
    assert.deepEqual(await reopened.listPending('technician-1'), [op]);
    assert.equal((await reopened.listCached('technician-1'))[0].version, 1);
    assert.deepEqual(await reopened.listPending('technician-2'), []);
    assert.deepEqual(await reopened.listCached('technician-2'), []);
  } finally { f.cleanup(); }
});
test('SQLite: v1 migration rollback preserves data and schema; retry upgrades intact', async () => {
  const f = fixture();
  try {
    f.db.exec('CREATE TABLE incidents(actor_id TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(actor_id,id)); CREATE TABLE pending_operations(operation_id TEXT PRIMARY KEY NOT NULL,actor_id TEXT NOT NULL,incident_id TEXT NOT NULL,data TEXT NOT NULL); PRAGMA user_version=1;');
    f.db.prepare('INSERT INTO incidents VALUES(?,?,?)').run('technician-1', base.id, JSON.stringify(base));
    const data = JSON.stringify({ operationId: 'migrated-operation', actorId: 'technician-1', incidentId: base.id });
    f.db.prepare('INSERT INTO pending_operations VALUES(?,?,?,?)').run('migrated-operation', 'technician-1', base.id, data);
    let fail = true;
    const store = createSqliteOfflineStore(async () => adapter(f.db), () => { if (fail) throw new Error('injected_migration_failure'); });
    await assert.rejects(store.initialize(), /injected_migration_failure/);
    assert.equal(f.db.prepare('PRAGMA user_version').get().user_version, 1);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='operation_archive'").get().n, 0);
    assert.equal(f.db.prepare('SELECT data FROM pending_operations').get().data, data);
    fail = false;
    await store.initialize();
    assert.equal(f.db.prepare('PRAGMA user_version').get().user_version, 2);
    assert.equal((await store.listCached('technician-1'))[0].id, base.id);
    assert.equal((await store.listPending('technician-1'))[0].operationId, 'migrated-operation');
  } finally { f.cleanup(); }
});
test('deduplication and merge preserve inputs; nested JSON equality, null/deletion and conflict ordering', () => {
  const b = { id: 'x', version: 1, fields: { a: { x: 1, y: 2 }, z: 0, work: { assignedTechnicianId: 'technician-1', status: 'assigned' } } };
  const local = { ...b, fields: { ...b.fields, a: { y: 2, x: 1 }, z: 1 } };
  const remote = { ...b, version: 2, fields: { ...b.fields, work: { assignedTechnicianId: 'technician-2', status: 'assigned' } } };
  const before = JSON.stringify([b, local, remote]);
  assert.deepEqual(resolveSync(b, local, remote), { kind: 'merged', fields: { a: { y: 2, x: 1 }, z: 1, work: remote.fields.work } });
  assert.equal(JSON.stringify([b, local, remote]), before);
  assert.deepEqual(resolveSync(b, { ...local, fields: { ...local.fields, a: 1 } }, { ...remote, fields: { ...remote.fields, a: 2, z: 2 } }), { kind: 'conflict', fields: ['a', 'z'] });
  assert.deepEqual(resolveSync({ id: 'x', version: 0, fields: { a: null } }, { id: 'x', version: 0, fields: {} }, { id: 'x', version: 1, fields: { a: null } }), { kind: 'merged', fields: {} });
  const operations = [{ operationId: '1', value: 1 }, { operationId: '1', value: 2 }, { operationId: '2' }];
  assert.deepEqual(deduplicateOperations(operations), [operations[0], operations[2]]);
});
test('save failure never calls the gateway or reports a queued change', async () => {
  let sends = 0;
  const sync = coordinator({ listPending: async () => [], enqueue: async () => { throw new Error('disk_full'); } }, { send: async () => { sends++; } });
  await assert.rejects(sync.enqueue(base, { action: 'start' }), /disk_full/);
  assert.equal(sends, 0);
});
test('pending identity cannot be overwritten or duplicated for the same incident', async () => {
  const f = fixture();
  try {
    const sync = coordinator(f.store, {});
    const op = await sync.enqueue(base, { action: 'start' });
    await f.store.enqueue(op);
    await assert.rejects(f.store.enqueue({ ...op, note: 'other' }), /identity_reused/);
    await assert.rejects(sync.enqueue(base, { action: 'start' }), /pending_operation/);
    assert.equal((await f.store.listPending('technician-1')).length, 1);
  } finally { f.cleanup(); }
});
test('unavailable send retains exact identity/body and stops; explicit retry confirms once', async () => {
  const f = fixture();
  try {
    let count = 0; const seen = [];
    const sync = coordinator(f.store, {
      send: async op => { seen.push(JSON.stringify(op.request)); return ++count === 1 ? { kind: 'unavailable' } : { kind: 'confirmed', incident: { ...base, version: 2, status: 'in_progress' } }; },
    });
    const op = await sync.enqueue(base, { action: 'start' });
    await sync.synchronize();
    assert.equal((await f.store.listPending(op.actorId))[0].operationId, op.operationId);
    await sync.synchronize();
    assert.deepEqual(seen, [JSON.stringify(op.request), JSON.stringify(op.request)]);
    assert.equal((await f.store.listPending(op.actorId)).length, 0);
    assert.equal((await f.store.listCached(op.actorId))[0].version, 2);
  } finally { f.cleanup(); }
});
test('concurrent synchronization shares a single send', async () => {
  const f = fixture();
  try {
    let calls = 0;
    const sync = coordinator(f.store, { send: async () => { calls++; return { kind: 'confirmed', incident: { ...base, version: 2 } }; } });
    await sync.enqueue(base, { action: 'start' });
    const a = sync.synchronize(), b = sync.synchronize();
    assert.equal(a, b); await Promise.all([a, b]); assert.equal(calls, 1);
  } finally { f.cleanup(); }
});
test('logout/relogin of same actor invalidates late response without deleting pending', async () => {
  const f = fixture();
  try {
    let revision = 1, release, sent;
    const started = new Promise(resolve => { sent = resolve; });
    const sync = coordinator(f.store, { send: () => { sent(); return new Promise(resolve => { release = resolve; }); } },
      () => ({ actor: { actorId: 'technician-1', role: 'technician' }, revision }));
    await sync.enqueue(base, { action: 'start' });
    const running = sync.synchronize(); await started; revision = 3;
    release({ kind: 'confirmed', incident: { ...base, version: 2 } }); await running;
    assert.equal((await f.store.listPending('technician-1')).length, 1);
  } finally { f.cleanup(); }
});
test('409 reassignment preserves local work; explicit resolution archives instead of losing it', async () => {
  const f = fixture();
  try {
    const sync = coordinator(f.store, { send: async () => ({ kind: 'conflict' }), read: async () => ({ ...base, version: 2, assignedTechnicianId: 'technician-2' }) });
    const op = await sync.enqueue(base, { action: 'start' }, 'Intención que debe conservarse');
    await sync.synchronize();
    const stored = (await f.store.listPending(op.actorId))[0];
    assert.equal(stored.status, 'conflict'); assert.deepEqual(stored.conflictFields, ['work']); assert.equal(stored.note, op.note);
    assert.equal((await f.store.listCached(op.actorId))[0].assignedTechnicianId, 'technician-2');
    await f.store.archiveResolution(op.actorId, op.operationId, 'Acepto no aplicar la intención obsoleta');
    assert.equal((await f.store.listPending(op.actorId)).length, 0);
    assert.equal(JSON.parse(f.db.prepare('SELECT data FROM operation_archive').get().data).note, op.note);
  } finally { f.cleanup(); }
});
test('403 preserves blocked intention and never requests inaccessible remote data', async () => {
  const f = fixture();
  try {
    let reads = 0;
    const sync = coordinator(f.store, { send: async () => ({ kind: 'forbidden' }), read: async () => { reads++; } });
    await sync.enqueue(base, { action: 'start' }); await sync.synchronize();
    assert.equal((await f.store.listPending('technician-1'))[0].status, 'blocked'); assert.equal(reads, 0);
  } finally { f.cleanup(); }
});
test('failed confirmation transaction rolls back cached snapshot and queue removal', async () => {
  const f = fixture();
  try {
    const op = await coordinator(f.store, {}).enqueue(base, { action: 'start' });
    f.db.exec("CREATE TRIGGER prevent_delete BEFORE DELETE ON pending_operations BEGIN SELECT RAISE(ABORT,'injected_delete_failure'); END;");
    await assert.rejects(f.store.confirm(op.actorId, op.operationId, { ...base, version: 2 }), /injected_delete_failure/);
    assert.equal((await f.store.listPending(op.actorId)).length, 1);
    assert.equal((await f.store.listCached(op.actorId))[0].version, 1);
  } finally { f.cleanup(); }
});
test('wrong actor cannot enqueue or synchronize another actor operation', async () => {
  const f = fixture();
  try {
    const sync = coordinator(f.store, {});
    await assert.rejects(sync.enqueue({ ...base, assignedTechnicianId: 'technician-2' }, { action: 'start' }), /forbidden/);
    assert.deepEqual(await f.store.listPending('technician-1'), []);
  } finally { f.cleanup(); }
});
test('real HTTP backend: lost confirmation replay, valid envelope, single history effect and reassignment 403', async () => {
  const f = fixture();
  const child = spawn(process.execPath, ['course-backend/server.mjs'], { env: { ...process.env, COURSE_BACKEND_HOST: '127.0.0.1', COURSE_BACKEND_PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('backend_timeout')), 10000);
      child.once('error', reject);
      child.stdout.on('data', chunk => { const match = /listening at (http:\/\/\S+)/.exec(chunk.toString()); if (match) { clearTimeout(timer); resolve(match[1]); } });
    });
    const session = new SessionManager({ gateway: createHttpAuthGateway(url), store: { save: async () => {}, clear: async () => {} } });
    await session.login('technician-1');
    const gateway = createOfflineSyncGateway('technician-1', session, url);
    const initial = await gateway.read(base.id);
    assert(initial);
    const sync = coordinator(f.store, gateway);
    const op = await sync.enqueue(initial, { action: 'start' });
    // Server commits, but the client intentionally discards the first response and leaves SQLite pending.
    const first = await gateway.send(op); assert.equal(first.kind, 'confirmed');
    await sync.synchronize();
    assert.equal((await f.store.listPending('technician-1')).length, 0);
    const raw = await (await fetch(url + '/v1/incidents/' + base.id, { headers: { Authorization: 'Bearer course-valid-token', 'X-Course-Actor': 'coordinator-1' } })).json();
    assert.equal(raw.payload.history.filter(h => h.operationId === op.operationId).length, 1);
    const assign = await fetch(url + '/v1/incidents/' + base.id + '/actions', { method: 'POST', headers: { Authorization: 'Bearer course-valid-token', 'X-Course-Actor': 'coordinator-1', 'Content-Type': 'application/json', 'Idempotency-Key': 'coordinator-reassign-1' }, body: JSON.stringify({ action: 'assign', technicianId: 'technician-2', baseVersion: raw.version }) });
    assert.equal(assign.status, 201);
    const blocked = await gateway.send({ ...op, operationId: 'different-pending-id' });
    assert.equal(blocked.kind, 'forbidden');
    const other = createOfflineSyncGateway('technician-2', session, url);
    assert.equal((await other.send(op)).kind, 'forbidden');
    await session.logout();
  } finally { child.kill(); f.cleanup(); }
});

