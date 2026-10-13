import fs from 'fs';
import http from 'http';
import { execSync, spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { coordinateRefresh } from '../../src/course-evaluation';
import { SessionError, SessionManager } from '../../src/application/session/sessionManager';
import type {
  AuthGateway,
  SessionLogEntry,
  SessionTokens,
  TokenStore,
} from '../../src/application/session/sessionManager';
import { createHttpAuthGateway } from '../../src/infrastructure/session/httpAuthGateway';

jest.setTimeout(30000);

const CMD = 'npx jest course-tests/team/week-06-session.test.ts';
type ScenarioType = 'nominal' | 'boundary' | 'failure';
type Check = {
  id: string;
  status: 'pass' | 'fail';
  scenarioType: ScenarioType;
  command: string;
  evidence: string;
};
const authChecks: Check[] = [];
const concurrencyChecks: Check[] = [];
const allLogs: SessionLogEntry[] = [];
const consoleSeen: string[] = [];

function record(target: Check[], id: string, scenarioType: ScenarioType, ok: boolean, evidence: string) {
  target.push({ id, status: ok ? 'pass' : 'fail', scenarioType, command: CMD, evidence });
}
const codeOf = (e: unknown): string => (e instanceof SessionError ? e.code : 'other');

// ---------- Backend real (node course-backend/server.mjs en un puerto libre) ----------
let backend: ChildProcess | null = null;
let baseUrl = '';
let scenarioHeader: string | undefined;

function startBackend(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['course-backend/server.mjs'], {
      env: { ...process.env, COURSE_BACKEND_HOST: '127.0.0.1', COURSE_BACKEND_PORT: '0' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    backend = child;
    const timer = setTimeout(() => reject(new Error('el backend no arrancó')), 15000);
    child.stdout?.on('data', (chunk: Buffer) => {
      const match = /listening at (http:\/\/\S+)/.exec(chunk.toString());
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`el backend terminó con código ${code}`));
    });
  });
}

type RawResult = { status: number; body: unknown };

function rawRequest(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<RawResult> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const allHeaders: Record<string, string> = { ...headers };
    if (payload !== undefined) {
      allHeaders['content-type'] = 'application/json';
      allHeaders['content-length'] = String(Buffer.byteLength(payload));
    }
    if (scenarioHeader) allHeaders['x-course-scenario'] = scenarioHeader;
    const req = http.request(new URL(path, baseUrl), { method, headers: allHeaders }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed: unknown = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = text;
        }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

// fetch real sobre http de Node: el gateway de producción habla con el backend verdadero.
async function nodeFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
  const result = await rawRequest(init?.method ?? 'GET', url.pathname + url.search, headers, body);
  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    json: async () => result.body,
  } as unknown as Response;
}

// ---------- Utilidades de sesión ----------
class MemoryStore implements TokenStore {
  persisted: SessionTokens | null = null;
  saves = 0;
  clears = 0;
  async save(tokens: SessionTokens): Promise<void> {
    this.persisted = tokens;
    this.saves += 1;
  }
  async clear(): Promise<void> {
    this.persisted = null;
    this.clears += 1;
  }
}

type Hooks = { gate: Promise<void> | null; onRefresh: (() => void) | null };

function build() {
  const clock = { now: 1_800_000_000_000 }; // reloj controlable
  const real = createHttpAuthGateway(baseUrl);
  const calls = { login: 0, refresh: 0 };
  const hooks: Hooks = { gate: null, onRefresh: null };
  const gateway: AuthGateway = {
    login: (actorId) => {
      calls.login += 1;
      return real.login(actorId);
    },
    refresh: async (refreshToken) => {
      calls.refresh += 1;
      hooks.onRefresh?.();
      if (hooks.gate) await hooks.gate;
      return real.refresh(refreshToken);
    },
  };
  const store = new MemoryStore();
  const logs: SessionLogEntry[] = [];
  const manager = new SessionManager({
    gateway,
    store,
    now: () => clock.now,
    log: (entry) => {
      logs.push(entry);
      allLogs.push(entry);
    },
  });
  return { manager, store, clock, calls, hooks, logs };
}

type Counter = { sends: number };
type Mode = 'valid' | 'stale-first' | 'always-bad';

// 'stale-first' envía un token inválido en el primer intento: el backend real responde 401 de verdad.
function sender(actor: string, mode: Mode, counter: Counter) {
  let attempt = 0;
  return async (accessToken: string): Promise<{ status: number }> => {
    attempt += 1;
    counter.sends += 1;
    const useBad = mode === 'always-bad' || (mode === 'stale-first' && attempt === 1);
    const token = useBad ? 'course-expired-sim' : accessToken;
    const result = await rawRequest('GET', '/v1/incidents', {
      authorization: `Bearer ${token}`,
      'x-course-actor': actor,
    });
    return { status: result.status };
  };
}

async function tokenFor(actor: string): Promise<string> {
  const s = build();
  await s.manager.login(actor);
  return s.store.persisted?.accessToken ?? '';
}

function incidentAction(actor: string, token: string, key: string, body: Record<string, unknown>) {
  return rawRequest(
    'POST',
    '/v1/incidents/campus-inc-001/actions',
    { authorization: `Bearer ${token}`, 'x-course-actor': actor, 'idempotency-key': key },
    body,
  );
}

const SECRETS = ['course-valid-token', 'course-refresh-0', 'course-refresh-1'];
const leaks = (value: unknown): string[] =>
  SECRETS.filter((secret) => JSON.stringify(value).includes(secret));

const originalFetch = globalThis.fetch;
const spies = (['log', 'info', 'warn', 'error'] as const).map((method) =>
  jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
    consoleSeen.push(args.map((arg) => String(arg)).join(' '));
  }),
);

beforeAll(async () => {
  baseUrl = await startBackend();
  globalThis.fetch = nodeFetch as unknown as typeof fetch;
});

// ======================= AUTENTICACIÓN Y AUTORIZACIÓN =======================
const ROLES: [string, string][] = [
  ['reporter-1', 'reporter'],
  ['technician-1', 'technician'],
  ['coordinator-1', 'coordinator'],
];

test.each(ROLES)('AUTH-01 inicio de sesión de %s', async (actor, role) => {
  const s = build();
  const state = await s.manager.login(actor);
  const ok =
    state.status === 'authenticated' && state.role === role &&
    s.store.persisted !== null && s.manager.getRefreshCount() === 0;
  record(authChecks, `auth-01-login-${role}`, 'nominal', ok,
    `Login real de ${actor} contra el backend. Esperado: authenticated con rol ${role}, tokens guardados, 0 renovaciones. Observado: estado=${state.status}, rol=${state.status === 'authenticated' ? state.role : 'n/a'}, tokens guardados=${s.store.persisted !== null}`);
  expect(ok).toBe(true);
});

test('AUTH-02 actor desconocido no inicia sesión', async () => {
  const s = build();
  let code = 'none';
  await s.manager.login('actor-inexistente').catch((e: unknown) => { code = codeOf(e); });
  const ok = code === 'login_failed' && s.manager.getState().status === 'anonymous' && s.store.persisted === null;
  record(authChecks, 'auth-02-login-actor-desconocido', 'failure', ok,
    `Login con actor inexistente (el backend real responde 401). Esperado: login_failed, estado anonymous, sin tokens. Observado: código=${code}, estado=${s.manager.getState().status}, tokens guardados=${s.store.persisted !== null}`);
  expect(ok).toBe(true);
});

test('AUTH-03 sin sesión no se envía ninguna solicitud', async () => {
  const s = build();
  const counter = { sends: 0 };
  let code = 'none';
  await s.manager.execute(sender('reporter-1', 'valid', counter)).catch((e: unknown) => { code = codeOf(e); });
  const ok = code === 'unauthenticated' && counter.sends === 0 && s.calls.refresh === 0;
  record(authChecks, 'auth-03-sin-sesion', 'failure', ok,
    `execute sin login. Esperado: unauthenticated, 0 solicitudes, 0 renovaciones. Observado: código=${code}, solicitudes=${counter.sends}, renovaciones=${s.calls.refresh}`);
  expect(ok).toBe(true);
});

test('AUTH-04 el backend real responde 401 sin token o con token inválido', async () => {
  const noToken = await rawRequest('GET', '/v1/incidents', { 'x-course-actor': 'reporter-1' });
  const badToken = await rawRequest('GET', '/v1/incidents', {
    authorization: 'Bearer course-expired-sim',
    'x-course-actor': 'reporter-1',
  });
  const ok = noToken.status === 401 && badToken.status === 401;
  record(authChecks, 'auth-04-401-real', 'boundary', ok,
    `GET /v1/incidents sin Authorization y con token inválido. Esperado: 401 en ambos. Observado: ${noToken.status} y ${badToken.status}`);
  expect(ok).toBe(true);
});

test('AUTH-05 reportante no puede asignar (403 real)', async () => {
  const token = await tokenFor('reporter-1');
  const r = await incidentAction('reporter-1', token, 'janeth-403-assign-1',
    { action: 'assign', technicianId: 'technician-1', baseVersion: 1 });
  const ok = r.status === 403;
  record(authChecks, 'auth-05-403-reportante-asigna', 'failure', ok,
    `Reportante intenta la acción assign. Esperado 403. Observado: ${r.status} ${JSON.stringify(r.body)}`);
  expect(ok).toBe(true);
});

test('AUTH-06 técnico ajeno no puede iniciar la incidencia (403 real)', async () => {
  const token = await tokenFor('technician-2');
  const r = await incidentAction('technician-2', token, 'janeth-403-start-2',
    { action: 'start', baseVersion: 1 });
  const ok = r.status === 403;
  record(authChecks, 'auth-06-403-tecnico-ajeno', 'failure', ok,
    `technician-2 intenta start sobre la incidencia de technician-1. Esperado 403. Observado: ${r.status} ${JSON.stringify(r.body)}`);
  expect(ok).toBe(true);
});

test('AUTH-07 técnico asignado inicia la suya, pero no puede cerrar', async () => {
  const token = await tokenFor('technician-1');
  const start = await incidentAction('technician-1', token, 'janeth-start-ok-3',
    { action: 'start', baseVersion: 1 });
  const close = await incidentAction('technician-1', token, 'janeth-close-403-4',
    { action: 'close', baseVersion: 2 });
  const ok = start.status === 201 && close.status === 403;
  record(authChecks, 'auth-07-tecnico-start-si-close-no', 'nominal', ok,
    `technician-1: start sobre su incidencia y close (acción de coordinación). Esperado 201 y 403. Observado: ${start.status} y ${close.status}`);
  expect(ok).toBe(true);
});

test('AUTH-08 un instante antes del margen de expiración no se renueva', async () => {
  const s = build();
  await s.manager.login('reporter-1');
  s.clock.now += 54_999;
  const counter = { sends: 0 };
  const res = await s.manager.execute(sender('reporter-1', 'valid', counter));
  const ok = res.status === 200 && s.calls.refresh === 0;
  record(authChecks, 'auth-08-antes-del-limite', 'boundary', ok,
    `Reloj controlado +54999 ms (expira a 60000 ms, margen 5000 ms). Esperado: 200 y 0 renovaciones. Observado: ${res.status} y ${s.calls.refresh} renovaciones`);
  expect(ok).toBe(true);
});

test('AUTH-09 en el límite de expiración se renueva antes de enviar', async () => {
  const s = build();
  await s.manager.login('reporter-1');
  const before = s.store.persisted?.refreshToken;
  s.clock.now += 55_000;
  const counter = { sends: 0 };
  const res = await s.manager.execute(sender('reporter-1', 'valid', counter));
  const rotated = s.store.persisted?.refreshToken !== before;
  const ok = res.status === 200 && s.calls.refresh === 1 && rotated &&
    s.manager.getState().status === 'authenticated' && counter.sends === 1;
  record(authChecks, 'auth-09-en-el-limite', 'boundary', ok,
    `Reloj controlado +55000 ms. Esperado: 1 renovación previa, token de renovación rotado, 1 solicitud, 200. Observado: renovaciones=${s.calls.refresh}, rotado=${rotated}, solicitudes=${counter.sends}, estado=${res.status}`);
  expect(ok).toBe(true);
});

test('AUTH-10 renovación obsoleta: sesión anónima y sin bucle', async () => {
  const s = build();
  await s.manager.login('reporter-1');
  const counter = { sends: 0 };
  s.clock.now += 55_000;
  await s.manager.execute(sender('reporter-1', 'valid', counter)); // 1ª renovación válida
  s.clock.now += 60_000; // vuelve a expirar; el refresh token anterior ya no sirve en el backend
  let code = 'none';
  await s.manager.execute(sender('reporter-1', 'valid', counter)).catch((e: unknown) => { code = codeOf(e); });
  const refreshesAfterFail = s.calls.refresh;
  let again = 'none';
  await s.manager.execute(sender('reporter-1', 'valid', counter)).catch((e: unknown) => { again = codeOf(e); });
  const ok = code === 'refresh_failed' && refreshesAfterFail === 2 && again === 'unauthenticated' &&
    s.calls.refresh === 2 && s.store.persisted === null && s.manager.getState().status === 'anonymous';
  record(authChecks, 'auth-10-refresh-obsoleto', 'failure', ok,
    `Segunda renovación con el refresh token ya usado (el backend real devuelve 401). Esperado: refresh_failed, anonymous, sin tokens y sin nuevos intentos. Observado: código=${code}, renovaciones=${s.calls.refresh}, siguiente solicitud=${again}, tokens guardados=${s.store.persisted !== null}`);
  expect(ok).toBe(true);
});

test('AUTH-11 renovación fallida (invalid_grant del backend)', async () => {
  const s = build();
  await s.manager.login('reporter-1');
  const counter = { sends: 0 };
  let code = 'none';
  scenarioHeader = 'invalid_refresh';
  try {
    await s.manager.execute(sender('reporter-1', 'stale-first', counter)).catch((e: unknown) => { code = codeOf(e); });
  } finally {
    scenarioHeader = undefined;
  }
  const ok = code === 'refresh_failed' && s.calls.refresh === 1 && counter.sends === 1 &&
    s.store.persisted === null && s.manager.getState().status === 'anonymous';
  record(authChecks, 'auth-11-refresh-fallido', 'failure', ok,
    `401 real y renovación rechazada (escenario invalid_refresh). Esperado: refresh_failed, 1 renovación, sin reintento, anonymous, sin tokens. Observado: código=${code}, renovaciones=${s.calls.refresh}, solicitudes=${counter.sends}, tokens guardados=${s.store.persisted !== null}`);
  expect(ok).toBe(true);
});

test('AUTH-12 logout borra la sesión y bloquea solicitudes', async () => {
  const s = build();
  await s.manager.login('coordinator-1');
  const counter = { sends: 0 };
  const first = await s.manager.execute(sender('coordinator-1', 'valid', counter));
  await s.manager.logout();
  let code = 'none';
  await s.manager.execute(sender('coordinator-1', 'valid', counter)).catch((e: unknown) => { code = codeOf(e); });
  const summary = coordinateRefresh(s.manager.getEvents());
  const ok = first.status === 200 && s.store.persisted === null && s.store.clears >= 1 &&
    s.manager.getState().status === 'anonymous' && code === 'unauthenticated' &&
    counter.sends === 1 && summary.status === 'anonymous' && summary.persistedToken === null;
  record(authChecks, 'auth-12-logout', 'nominal', ok,
    `Solicitud válida, logout y nueva solicitud. Esperado: sin tokens persistidos, anonymous, unauthenticated, ninguna solicitud tras el logout. Observado: tokens guardados=${s.store.persisted !== null}, limpiezas=${s.store.clears}, código=${code}, solicitudes totales=${counter.sends}, resumen=${summary.status}`);
  expect(ok).toBe(true);
});

test('AUTH-13 logout durante una renovación en curso no deja tokens', async () => {
  const s = build();
  await s.manager.login('technician-1');
  let release: () => void = () => undefined;
  s.hooks.gate = new Promise<void>((resolve) => { release = () => resolve(); });
  const started = new Promise<void>((resolve) => { s.hooks.onRefresh = () => resolve(); });
  const counter = { sends: 0 };
  const pending = s.manager
    .execute(sender('technician-1', 'stale-first', counter))
    .then(() => 'ok', (e: unknown) => codeOf(e));
  await started;
  await s.manager.logout();
  release();
  const outcome = await pending;
  const ok = outcome === 'session_ended' && s.store.persisted === null &&
    s.manager.getState().status === 'anonymous' && s.calls.refresh === 1;
  record(authChecks, 'auth-13-logout-durante-refresh', 'failure', ok,
    `Logout mientras la renovación sigue pendiente. Esperado: la solicitud falla con session_ended y no queda ningún token. Observado: resultado=${outcome}, tokens guardados=${s.store.persisted !== null}, estado=${s.manager.getState().status}`);
  expect(ok).toBe(true);
});

// ======================= CONCURRENCIA =======================
test.each([[5], [20]])('CONC-01 %i solicitudes con 401 comparten una sola renovación', async (n) => {
  const s = build();
  await s.manager.login('reporter-1');
  const counter = { sends: 0 };
  const ids = Array.from({ length: n }, (_, i) => `req-${i + 1}`);
  const statuses = await Promise.all(
    ids.map((id) => s.manager.execute(sender('reporter-1', 'stale-first', counter), id).then((r) => r.status)),
  );
  const summary = coordinateRefresh(s.manager.getEvents());
  const ok = statuses.every((status) => status === 200) && s.calls.refresh === 1 &&
    s.manager.getRefreshCount() === 1 && counter.sends === n * 2 &&
    summary.status === 'authenticated' && summary.refreshCalls === 1 &&
    summary.retriedRequestIds.length === n;
  record(concurrencyChecks, `conc-01-compartida-${n}`, n === 5 ? 'nominal' : 'boundary', ok,
    `${n} solicitudes simultáneas reciben 401 real. Esperado: 1 renovación compartida, ${n} reintentos (1 por solicitud), todas 200. Observado: renovaciones=${s.calls.refresh}, envíos=${counter.sends}, 200=${statuses.filter((x) => x === 200).length}, reintentadas según el reductor=${summary.retriedRequestIds.length}, refreshCalls del reductor=${summary.refreshCalls}`);
  expect(ok).toBe(true);
});

test('CONC-02 reintento limitado: un token siempre inválido no genera bucle', async () => {
  const s = build();
  await s.manager.login('reporter-1');
  const counter = { sends: 0 };
  let code = 'none';
  await s.manager.execute(sender('reporter-1', 'always-bad', counter)).catch((e: unknown) => { code = codeOf(e); });
  const ok = code === 'unauthorized' && counter.sends === 2 && s.calls.refresh === 1 &&
    s.store.persisted === null && s.manager.getState().status === 'anonymous';
  record(concurrencyChecks, 'conc-02-reintento-limitado', 'failure', ok,
    `El backend responde 401 también tras renovar. Esperado: 1 renovación, exactamente 2 envíos (original + 1 reintento), unauthorized, sesión cerrada. Observado: renovaciones=${s.calls.refresh}, envíos=${counter.sends}, código=${code}, tokens guardados=${s.store.persisted !== null}`);
  expect(ok).toBe(true);
});

test('CONC-03 varias solicitudes con token siempre inválido: renovación única y máximo 2 envíos por solicitud', async () => {
  const s = build();
  await s.manager.login('reporter-1');
  const counter = { sends: 0 };
  const n = 3;
  const outcomes = await Promise.all(
    Array.from({ length: n }, (_, i) =>
      s.manager.execute(sender('reporter-1', 'always-bad', counter), `bad-${i + 1}`).then(() => 'ok', (e: unknown) => codeOf(e))),
  );
  const ok = outcomes.every((o) => o !== 'ok') && s.calls.refresh === 1 && counter.sends <= n * 2 &&
    s.store.persisted === null && s.manager.getState().status === 'anonymous';
  record(concurrencyChecks, 'conc-03-varias-siempre-invalidas', 'failure', ok,
    `${n} solicitudes simultáneas con token inválido incluso tras renovar. Esperado: todas fallan, 1 renovación, no más de ${n * 2} envíos. Observado: resultados=${outcomes.join(',')}, renovaciones=${s.calls.refresh}, envíos=${counter.sends}`);
  expect(ok).toBe(true);
});

test('CONC-04 renovación fallida con solicitudes simultáneas: una sola renovación y sin reintentos', async () => {
  const s = build();
  await s.manager.login('reporter-1');
  const counter = { sends: 0 };
  const n = 4;
  scenarioHeader = 'invalid_refresh';
  let outcomes: string[] = [];
  try {
    outcomes = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        s.manager.execute(sender('reporter-1', 'stale-first', counter), `fail-${i + 1}`).then(() => 'ok', (e: unknown) => codeOf(e))),
    );
  } finally {
    scenarioHeader = undefined;
  }
  const ok = outcomes.every((o) => o !== 'ok') && s.calls.refresh === 1 && counter.sends === n &&
    s.store.persisted === null && s.manager.getState().status === 'anonymous';
  record(concurrencyChecks, 'conc-04-refresh-fallido-concurrente', 'failure', ok,
    `${n} solicitudes con 401 y renovación rechazada. Esperado: 1 renovación, ${n} envíos (ningún reintento), todas fallan, anonymous. Observado: resultados=${[...new Set(outcomes)].join(',')}, renovaciones=${s.calls.refresh}, envíos=${counter.sends}, tokens guardados=${s.store.persisted !== null}`);
  expect(ok).toBe(true);
});

test('CONC-05 logout con solicitudes en vuelo y renovación pendiente', async () => {
  const s = build();
  await s.manager.login('reporter-1');
  let release: () => void = () => undefined;
  s.hooks.gate = new Promise<void>((resolve) => { release = () => resolve(); });
  const started = new Promise<void>((resolve) => { s.hooks.onRefresh = () => resolve(); });
  const counter = { sends: 0 };
  const n = 3;
  const pending = Promise.all(
    Array.from({ length: n }, (_, i) =>
      s.manager.execute(sender('reporter-1', 'stale-first', counter), `lo-${i + 1}`).then(() => 'ok', (e: unknown) => codeOf(e))),
  );
  await started;
  await s.manager.logout();
  release();
  const outcomes = await pending;
  const ok = outcomes.every((o) => o === 'session_ended') && s.calls.refresh === 1 &&
    s.store.persisted === null && s.manager.getState().status === 'anonymous';
  record(concurrencyChecks, 'conc-05-logout-con-solicitudes-en-vuelo', 'failure', ok,
    `${n} solicitudes esperan una renovación y se hace logout. Esperado: todas terminan en session_ended, 1 renovación, sin tokens. Observado: resultados=${outcomes.join(',')}, renovaciones=${s.calls.refresh}, tokens guardados=${s.store.persisted !== null}`);
  expect(ok).toBe(true);
});

// ======================= TOKENS FUERA DE LOGS (corre al final) =======================
test('AUTH-14 los tokens no aparecen en logs, eventos ni consola', () => {
  const found = [...leaks(allLogs), ...leaks(consoleSeen)];
  const ok = found.length === 0 && allLogs.length > 0;
  record(authChecks, 'auth-14-tokens-fuera-de-logs', 'nominal', ok,
    `Se revisaron ${allLogs.length} entradas de log de sesión y ${consoleSeen.length} mensajes de consola de todas las pruebas buscando los tokens del backend. Esperado: 0 coincidencias. Observado: ${found.length}`);
  expect(ok).toBe(true);
});

afterAll(() => {
  spies.forEach((spy) => spy.mockRestore());
  globalThis.fetch = originalFetch;
  backend?.kill();
  const commitSha = execSync('git rev-parse HEAD').toString().trim();
  fs.mkdirSync('reports/week-06', { recursive: true });
  const base = { schemaVersion: 1, week: 6, commitSha, generatedAt: new Date().toISOString() };
  fs.writeFileSync('reports/week-06/auth-tests.json', JSON.stringify({ ...base, checks: authChecks }, null, 2));
  fs.writeFileSync('reports/week-06/concurrency.json', JSON.stringify({ ...base, checks: concurrencyChecks }, null, 2));
  fs.writeFileSync('reports/week-06/session-logs.json', JSON.stringify({ ...base, entries: allLogs }, null, 2));
});