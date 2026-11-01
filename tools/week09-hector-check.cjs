/* global __dirname */
/* Host integration: production TS + real SQLite + unmodified course backend. */
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, filename);
const { planRetry, parseRetryAfter } = require('../src/domain/resilience/retryPolicy.ts');
const { executeWithRetry } = require('../src/infrastructure/http/retryExecutor.ts');
const { fetchJson } = require('../src/infrastructure/incidents/cloudIncidentClient.ts');
const { createOfflineSyncGateway } = require('../src/infrastructure/incidents/offlineSyncGateway.ts');
const { createOfflineSync } = require('../src/application/sync/offlineSync.ts');
const { createSqliteOfflineStore } = require('../src/infrastructure/persistence/sqliteOfflineStore.ts');
const { SessionManager } = require('../src/application/session/sessionManager.ts');
const { createHttpAuthGateway } = require('../src/infrastructure/session/httpAuthGateway.ts');
const observations = [];
const metrics = [];
const command = 'node --test tools/week09-hector-check.cjs';
const record = (id, scenarioType, evidence) => observations.push({ id, status: 'pass', scenarioType, command, evidence });
const limits = { maxAttempts: 4, baseDelayMs: 10, maxDelayMs: 1000 };

test('policy: transient statuses, bounded attempts, safe POST identity and progressive waits', () => {
  for (const status of [408, 429, 500, 502, 503, 504, 'timeout']) {
    assert.equal(planRetry({ method: 'GET', status, attempt: 1 }).retry, true);
    assert.equal(planRetry({ method: 'GET', status, attempt: 4 }).retry, false);
  }
  for (const status of [200, 400, 401, 403, 404, 409, 422, 501]) assert.equal(planRetry({ method: 'GET', status, attempt: 1 }).retry, false);
  for (const attempt of [0, -1, NaN, Infinity, 1.5, 5]) assert.equal(planRetry({ method: 'GET', status: 503, attempt }).retry, false);
  for (const idempotencyKey of [undefined, '', '   ']) assert.deepEqual(planRetry({ method: 'POST', status: 503, attempt: 1, idempotencyKey }), { retry: false, delayMs: 0, requiresStableIdempotencyKey: true });
  assert.equal(planRetry({ method: 'POST', status: 'timeout', attempt: 1, idempotencyKey: 'stable-fixture-operation' }).retry, true);
  assert.deepEqual([1, 2, 3].map(attempt => planRetry({ method: 'GET', status: 503, attempt }).delayMs), [400, 800, 1600]);
  record('retry-policy', 'boundary', 'Only transient statuses retry; waits 400/800/1600 ms; attempt 4 stops; POST without stable identity does not repeat.');
});
test('Retry-After: seconds, HTTP date, invalid/nonfinite values and maximum wait', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  assert.equal(parseRetryAfter('2'), 2000);
  assert.equal(parseRetryAfter('Sun, 01 Nov 2026 12:00:03 GMT', now), 3000);
  for (const value of ['garbage', '-2', 'Infinity', '1e300', null]) assert.equal(parseRetryAfter(value, now), undefined);
  assert.equal(planRetry({ method: 'GET', status: 429, attempt: 1, retryAfterMs: 800 }).delayMs, 800);
  assert.equal(planRetry({ method: 'GET', status: 429, attempt: 1, retryAfterMs: 60000 }).retry, false);
  for (const retryAfterMs of [NaN, Infinity, -5]) assert.equal(planRetry({ method: 'GET', status: 429, attempt: 1, retryAfterMs }).delayMs, 400);
  for (const bad of [{ ...limits, maxAttempts: 5 }, { ...limits, baseDelayMs: 0 }, { ...limits, maxDelayMs: Infinity }]) assert.throws(() => planRetry({ method: 'GET', status: 500, attempt: 1 }, bad), /invalid_retry_limits/);
  record('retry-after-bounds', 'boundary', 'Seconds and HTTP-date parsed; 800 ms respected; 60 s exceeds 30 s budget and stops rather than retrying early; nonfinite inputs cannot create infinite delays.');
});
test('executor: actual wait boundaries, maximum four sends and sanitized metrics', async () => {
  const samples = []; let calls = 0;
  await executeWithRetry({ method: 'GET' }, async () => { calls++; return { status: 503, value: false }; }, { limits, onAttempt: m => samples.push(m) });
  assert.equal(calls, 4); assert.deepEqual(samples.map(m => m.delayMs), [10, 20, 40, 0]);
  for (let i = 1; i < samples.length; i++) assert(samples[i].startedAtMs - samples[i-1].startedAtMs >= samples[i-1].delayMs - 2);
  for (const sample of samples) assert.deepEqual(Object.keys(sample).sort(), ['attempt', 'delayMs', 'durationMs', 'retry', 'startedAtMs', 'status']);
  metrics.push({ scenario: 'persistent-503', attempts: samples });
  record('retry-exhaustion', 'failure', `Persistent 503: ${calls} calls, then terminal failure; real waits 10/20/40 ms, technical fields only.`);
});
test('executor: POST without key sends once, cancellation before resend and telemetry failure isolation', async () => {
  let calls = 0;
  await executeWithRetry({ method: 'POST' }, async () => { calls++; return { status: 503, value: false }; });
  assert.equal(calls, 1);
  let active = true; calls = 0;
  await assert.rejects(executeWithRetry({ method: 'GET' }, async () => { calls++; return { status: 503, value: false }; }, {
    shouldContinue: () => active, sleep: async () => { active = false; }, onAttempt: () => { throw new Error('metric_sink_failed'); },
  }), /retry_cancelled/);
  assert.equal(calls, 1);
  record('retry-cancellation', 'failure', 'No-key POST sends once; cancellation during wait prevents second request; a broken metrics callback does not change delivery.');
});
async function backend(run) {
  const child = spawn(process.execPath, ['course-backend/server.mjs'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, COURSE_BACKEND_HOST: '127.0.0.1', COURSE_BACKEND_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('backend_start_timeout')), 10000); let text = '';
      child.stdout.on('data', chunk => { text += chunk; const m = text.match(/http:\/\/127\.0\.0\.1:\d+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
      child.once('error', err => { clearTimeout(timer); reject(err); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error('backend_exit_' + code)); });
    });
    await run(url);
  } finally { child.kill(); }
}
const headers = { Authorization: 'Bearer course-valid-token', 'X-Course-Actor': 'technician-1', 'Content-Type': 'application/json' };
function sqlAdapter(db) {
  const port = {
    execAsync: async sql => db.exec(sql), getFirstAsync: async (sql, ...params) => db.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params), runAsync: async (sql, ...params) => db.prepare(sql).run(...params),
    withExclusiveTransactionAsync: async fn => { db.exec('BEGIN IMMEDIATE'); try { await fn(port); db.exec('COMMIT'); } catch (err) { db.exec('ROLLBACK'); throw err; } },
  }; return port;
}
test('real HTTP: lost resolution response, SQLite recovery, exact key/body replay and no duplicate effect', async () => {
  await backend(async url => {
    const dir = mkdtempSync(path.join(tmpdir(), 'campusops-week09-')); let db = new DatabaseSync(path.join(dir, 'queue.db'));
    const originalFetch = global.fetch; const sends = []; const samples = [];
    try {
      const session = new SessionManager({ gateway: createHttpAuthGateway(url), store: { save: async () => {}, clear: async () => {} } });
      await session.login('technician-1');
      const started = await (await originalFetch(url + '/v1/incidents/campus-inc-001/actions', { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'week09-prepare-start' }, body: JSON.stringify({ action: 'start', baseVersion: 1 }) })).json();
      assert.equal(started.incident.status, 'in_progress');
      // Preserve an evidence reference before resolution to check it is not duplicated by replay.
      await originalFetch(url + '/v1/incidents/campus-inc-001/actions', { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'week09-prepare-evidence' }, body: JSON.stringify({ action: 'add_evidence', baseVersion: 2, evidenceId: 'synthetic-week09-resource' }) });
      const gateway = createOfflineSyncGateway('technician-1', session, url, { timeoutMs: 200, onAttempt: m => samples.push(m) });
      const base = await gateway.read('campus-inc-001'); assert(base);
      let store = createSqliteOfflineStore(async () => sqlAdapter(db));
      const deps = () => ({ store, gateway, session: () => ({ actor: { actorId: 'technician-1', role: 'technician' }, revision: session.getSessionRevision() }), newId: () => 'week09-resolution-stable-key' });
      const op = await createOfflineSync(deps()).enqueue(base, { action: 'resolve', diagnosis: 'Diagnóstico sintético de laboratorio' });
      db.close(); db = new DatabaseSync(path.join(dir, 'queue.db'));
      store = createSqliteOfflineStore(async () => sqlAdapter(db));
      assert.deepEqual((await store.listPending('technician-1'))[0], op);
      global.fetch = (input, init) => {
        if (String(input).endsWith('/actions') && init?.method === 'POST') {
          const h = new Headers(init.headers); sends.push({ key: h.get('idempotency-key'), body: init.body });
          h.set('X-Course-Scenario', 'timeout_after_commit');
          return originalFetch(input, { ...init, headers: h });
        }
        return originalFetch(input, init);
      };
      await createOfflineSync(deps()).synchronize();
      assert.equal(sends.length, 2); assert.deepEqual(sends[0], sends[1]);
      assert.equal(sends[0].key, op.operationId);
      assert.equal((await store.listPending('technician-1')).length, 0);
      const read = async () => (await originalFetch(url + '/v1/incidents/campus-inc-001', { headers })).json();
      const remote = await read();
      assert.equal(remote.status, 'resolved'); assert.equal(remote.version, 4);
      assert.equal(remote.payload.history.filter(h => h.operationId === op.operationId).length, 1);
      assert.equal(remote.payload.history.filter(h => h.action === 'resolve').length, 1);
      assert.equal(remote.payload.evidence.length, 1);
      await createOfflineSync(deps()).synchronize(); assert.deepEqual(await read(), remote);
      assert.equal(samples[0].status, 'timeout'); assert.equal(samples[1].status, 200);
      metrics.push({ scenario: 'timeout-after-commit-resolution', attempts: samples, sends: sends.length, sameKeyAndBody: true, resolutionEvents: 1, evidenceReferences: 1, finalVersion: remote.version });
      record('lost-resolution-response', 'failure', 'Unmodified backend saved resolve before actual HTTP abort at 200 ms. Exact key/body replay returned success; SQLite queue cleared; version 4, one resolve event and one existing evidence reference. Empty queue sync made no change. No notification subsystem exists: no notification delivery is claimed.');
      await session.logout();
    } finally { global.fetch = originalFetch; db.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
test('real HTTP: 429 Retry-After, disconnected endpoint, malformed body and rejected write', async () => {
  await backend(async url => {
    const samples = [];
    const limited = await fetchJson('/v1/geocoding?q=Ficticio', 'technician-1', url, undefined, { headers: { 'X-Course-Scenario': 'rate_limited' } }, {
      limits: { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 2000 }, onAttempt: m => samples.push(m),
    });
    assert.equal(limited.ok, false); assert.equal(samples.length, 2); assert.equal(samples[0].delayMs, 1000);
    assert(samples[1].startedAtMs - samples[0].startedAtMs >= 998);
    metrics.push({ scenario: 'rate-limited', attempts: samples });
    const bad = await fetchJson('/v1/geocoding?q=Ficticio', 'technician-1', url, undefined, { headers: { 'X-Course-Scenario': 'malformed' } }, { onAttempt: m => samples.push(m) });
    assert.equal(bad.error.kind, 'invalid_payload'); assert.equal(samples.length, 3);
    const disconnected = [];
    const lost = await fetchJson('/health', 'technician-1', 'http://127.0.0.1:1', undefined, undefined, { limits: { ...limits, maxAttempts: 2 }, onAttempt: m => disconnected.push(m) });
    assert.equal(lost.error.kind, 'network_error'); assert.equal(disconnected.length, 2);
    const reject = [];
    await fetchJson('/v1/incidents/campus-inc-001/actions', 'technician-1', url, undefined, { method: 'POST', headers: { 'Idempotency-Key': 'week09-bad-write' }, body: JSON.stringify({ action: 'close', baseVersion: 1 }) }, { onAttempt: m => reject.push(m) });
    assert.equal(reject.length, 1); assert.equal(reject[0].status, 403);
    metrics.push({ scenario: 'disconnected', attempts: disconnected });
    record('http-faults', 'failure', 'Real controlled 429 waited at least 1000 ms before attempt 2 and stopped at configured limit; malformed JSON was not retried; disconnected endpoint stopped after 2 attempts; unauthorized role 403 sent once.');
  });
});
after(() => {
  if (!process.env.WEEK09_REPORT_SHA) return;
  assert.equal(observations.length, 6, 'Refuse to generate partial passing evidence when a scenario failed');
  const commitSha = process.env.WEEK09_REPORT_SHA;
  assert.match(commitSha, /^[a-f0-9]{40}$/);
  const dir = path.resolve(__dirname, '../reports/week-09'); mkdirSync(dir, { recursive: true });
  const base = { schemaVersion: 1, week: 9, commitSha, generatedAt: new Date().toISOString(), checks: observations };
  // Hector-only evidence. Team final reports must also index Fatima and Janeth's real results.
  writeFileSync(path.join(dir, 'hector-fault-injection.json'), JSON.stringify(base, null, 2) + '\n');
  writeFileSync(path.join(dir, 'hector-retry-metrics.json'), JSON.stringify({ ...base, metrics, environment: 'Node host, real SQLite and HTTP; not an Android run' }, null, 2) + '\n');
});
