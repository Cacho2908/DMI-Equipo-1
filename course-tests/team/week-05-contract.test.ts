import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { parseRemoteResource } from '../../src/course-evaluation';
import { createCloudIncidentClient } from '../../src/infrastructure/incidents/cloudIncidentClient';
import type { CloudResult } from '../../src/infrastructure/incidents/cloudIncidentClient';

const CMD = 'npx jest course-tests/team/week-05-contract.test.ts';
const BASE = 'http://127.0.0.1:4310';

type ScenarioType = 'nominal' | 'boundary' | 'failure';
type Check = {
  id: string;
  status: 'pass' | 'fail';
  scenarioType: ScenarioType;
  command: string;
  evidence: string;
};
const contractChecks: Check[] = [];
const failureChecks: Check[] = [];

function record(target: Check[], id: string, scenarioType: ScenarioType, ok: boolean, evidence: string) {
  target.push({ id, status: ok ? 'pass' : 'fail', scenarioType, command: CMD, evidence });
}

// Cuerpos capturados del backend local (npm run backend) el 2026-10-04.
const LIST_BODY =
  '{"items":[{"id":"campus-inc-001","version":1,"status":"assigned","payload":{"category":"connectivity","description":"Sin conexión en laboratorio ficticio","location":"Edificio de prueba A","reporterId":"reporter-1","assignedTechnicianId":"technician-1","priority":"medium","notes":[],"evidence":[],"history":[]}}]}';
const MALFORMED_BODY = '{"items": [}';
const SERVER_ERROR_BODY = '{"code":"controlled_failure"}';
const NULLABLE_BODY = '{"id":"campus-inc-001","version":1,"status":"assigned","payload":null}';
const CREATE_BODY =
  '{"incident":{"id":"campus-inc-101","version":1,"status":"open","payload":{"category":"connectivity","description":"Prueba ficticia","location":"Edificio de prueba A","reporterId":"reporter-1","assignedTechnicianId":null,"priority":"medium","notes":[],"evidence":[],"history":[]}},"operationId":"janeth-prueba-001","duplicate":false}';

function fakeResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
function mockFetch(impl: FetchImpl) {
  globalThis.fetch = jest.fn(impl) as unknown as typeof fetch;
}
function reply(status: number, body: string): FetchImpl {
  return async () => fakeResponse(status, body);
}

const client = () => createCloudIncidentClient('reporter-1', BASE);
const observed = (result: CloudResult<unknown>) =>
  result.ok ? 'ok=true' : `ok=false, error=${JSON.stringify(result.error)}`;

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
});

// ---------- Contrato: frontera del DTO (mismos 5 casos del test público) ----------
const BOUNDARY_CASES: [string, ScenarioType, unknown, boolean, string][] = [
  ['ct-01-sobre-valido', 'nominal',
    { id: 'campus-inc-001', version: 2, status: 'assigned', payload: { category: 'connectivity', description: 'Falla ficticia' } },
    true, 'sobre válido con payload objeto'],
  ['ct-02-payload-null-valido', 'boundary',
    { id: 'r-2', version: 3, status: 'closed', payload: null, ignored: 'forward-compatible' },
    true, 'payload null válido y campo futuro ignorado'],
  ['ct-03-id-vacio', 'boundary',
    { id: '', version: 1, status: 'open', payload: null },
    false, 'id vacío'],
  ['ct-04-version-string', 'boundary',
    { id: 'r-3', version: '3', status: 'open', payload: null },
    false, 'version como texto'],
  ['ct-05-entrada-null', 'boundary', null, false, 'entrada null'],
];

test.each(BOUNDARY_CASES)('%s', (id, type, input, expected, what) => {
  const result = parseRemoteResource(input);
  const ok = result.ok === expected;
  record(contractChecks, id, type, ok,
    `parseRemoteResource con ${what}. Esperado ok=${expected}. Observado: ${JSON.stringify(result)}`);
  expect(ok).toBe(true);
});

test('CT-06 detalle con payload null (cuerpo real del escenario nullable)', async () => {
  mockFetch(reply(200, NULLABLE_BODY));
  const result = await client().getIncidentById('campus-inc-001');
  const ok = result.ok && result.value === null;
  record(contractChecks, 'ct-06-detalle-payload-null', 'boundary', ok,
    `getIncidentById con el cuerpo real del escenario nullable (HTTP 200, payload null). Esperado ok=true con valor null: no es error y no se inventan datos. Observado: ${observed(result)}`);
  expect(ok).toBe(true);
});

test('CT-07 el dominio no expone el DTO del backend', async () => {
  mockFetch(reply(200, LIST_BODY));
  const result = await client().listIncidents();
  const first = result.ok ? result.value[0] : undefined;
  const ok =
    !!first &&
    first.id === 'campus-inc-001' &&
    first.title === 'Sin conexión en laboratorio ficticio' &&
    first.category === 'connectivity' &&
    first.status === 'assigned' &&
    !('description' in first) &&
    !('location' in first);
  record(contractChecks, 'ct-07-mapeo-dto-a-dominio', 'nominal', ok,
    `listIncidents sobre el cuerpo real de la lista. Esperado: description pasa a title y el dominio no trae description ni location. Observado: ${first ? JSON.stringify(first) : observed(result)}`);
  expect(ok).toBe(true);
});

test('CT-08 crear incidencia: solicitud y respuesta', async () => {
  mockFetch(reply(201, CREATE_BODY));
  const result = await client().createIncident({
    category: 'connectivity',
    description: 'Prueba ficticia',
    location: 'Edificio de prueba A',
  });
  const [url, init] = (globalThis.fetch as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
  const headers = (init.headers ?? {}) as Record<string, string>;
  const ok =
    result.ok &&
    result.value.id === 'campus-inc-101' &&
    result.value.title === 'Prueba ficticia' &&
    result.value.status === 'open' &&
    init.method === 'POST' &&
    url.endsWith('/v1/incidents') &&
    typeof headers['Idempotency-Key'] === 'string' &&
    headers['Idempotency-Key'].length > 0;
  record(contractChecks, 'ct-08-crear-incidencia', 'nominal', ok,
    `createIncident contra el cuerpo real de HTTP 201. Esperado: POST /v1/incidents con Idempotency-Key y dominio campus-inc-101 / Prueba ficticia / open. Observado: ${observed(result)}, método ${init.method}, Idempotency-Key ${headers['Idempotency-Key'] ? 'presente' : 'ausente'}`);
  expect(ok).toBe(true);
});

test('CT-09 crear con payload null no inventa datos', async () => {
  mockFetch(reply(201, JSON.stringify({ incident: { id: 'campus-inc-102', version: 1, status: 'open', payload: null } })));
  const result = await client().createIncident({
    category: 'connectivity',
    description: 'Prueba ficticia',
    location: 'Edificio de prueba A',
  });
  const ok = !result.ok && result.error.kind === 'invalid_payload';
  record(contractChecks, 'ct-09-crear-payload-null', 'boundary', ok,
    `Creación con payload null. Una incidencia creada necesita datos, así que se rechaza sin inventarlos. Esperado kind=invalid_payload. Observado: ${observed(result)}`);
  expect(ok).toBe(true);
});

function listTsx(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTsx(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

test('CT-10 la interfaz no hace HTTP directo', () => {
  const files = [...listTsx('src'), ...(fs.existsSync('App.tsx') ? ['App.tsx'] : [])];
  const offenders = files.filter((file) =>
    /\bfetch\s*\(|XMLHttpRequest|axios/.test(fs.readFileSync(file, 'utf8')),
  );
  const ok = offenders.length === 0;
  record(contractChecks, 'ct-10-ui-sin-http-directo', 'nominal', ok,
    `Búsqueda de fetch, XMLHttpRequest y axios en ${files.length} archivos .tsx. Esperado 0 coincidencias. Observado: ${offenders.length}${ok ? '' : ` (${offenders.join(', ')})`}`);
  expect(ok).toBe(true);
});

// ---------- Matriz de fallas: tipo de error que devuelve el cliente ----------
test('FM-01 malformed: JSON roto', async () => {
  mockFetch(reply(200, MALFORMED_BODY));
  const result = await client().listIncidents();
  const ok = !result.ok && result.error.kind === 'invalid_payload';
  record(failureChecks, 'fm-01-malformed', 'failure', ok,
    `Escenario malformed (el backend real respondió HTTP 200 con el cuerpo ${MALFORMED_BODY}). Esperado kind=invalid_payload. Observado: ${observed(result)}`);
  expect(ok).toBe(true);
});

test('FM-02 server_error: HTTP 500', async () => {
  mockFetch(reply(500, SERVER_ERROR_BODY));
  const result = await client().listIncidents();
  const ok =
    !result.ok &&
    result.error.kind === 'server_error' &&
    !JSON.stringify(result.error).includes('controlled_failure');
  record(failureChecks, 'fm-02-server-error', 'failure', ok,
    `Escenario server_error (el backend real respondió HTTP 500 con ${SERVER_ERROR_BODY}). Esperado kind=server_error con status 500, sin copiar el cuerpo del servidor. Observado: ${observed(result)}`);
  expect(ok).toBe(true);
});

test('FM-03 slow: respuesta lenta dentro del límite', async () => {
  jest.useFakeTimers();
  mockFetch(() => new Promise<Response>((resolve) => {
    setTimeout(() => resolve(fakeResponse(200, LIST_BODY)), 1300);
  }));
  const pending = client().listIncidents();
  await jest.advanceTimersByTimeAsync(1300);
  const result = await pending;
  const ok = result.ok;
  record(failureChecks, 'fm-03-slow-dentro-del-limite', 'boundary', ok,
    `Respuesta simulada con 1300 ms de retraso (el backend real en el escenario slow tardó 1302 ms medidos con Measure-Command). El límite del cliente es 4000 ms. Esperado ok=true: slow por sí solo no produce timeout. Observado: ${observed(result)}`);
  expect(ok).toBe(true);
});

test('FM-04 timeout: el servidor no responde', async () => {
  jest.useFakeTimers();
  mockFetch((_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const abort = new Error('aborted');
      abort.name = 'AbortError';
      reject(abort);
    });
  }));
  const pending = client().listIncidents();
  await jest.advanceTimersByTimeAsync(4000);
  const result = await pending;
  const ok = !result.ok && result.error.kind === 'timeout';
  record(failureChecks, 'fm-04-timeout', 'failure', ok,
    `Servidor simulado que nunca responde; se avanzan 4000 ms. Esperado kind=timeout. Observado: ${observed(result)}`);
  expect(ok).toBe(true);
});

test('FM-05 network_error: sin conexión', async () => {
  mockFetch(async () => {
    throw new TypeError('Network request failed');
  });
  const result = await client().listIncidents();
  const ok = !result.ok && result.error.kind === 'network_error';
  record(failureChecks, 'fm-05-network-error', 'failure', ok,
    `fetch rechaza con TypeError. Esperado kind=network_error. Observado: ${observed(result)}`);
  expect(ok).toBe(true);
});

test('FM-06 payload que no es objeto', async () => {
  mockFetch(reply(200, JSON.stringify({ id: 'r-9', version: 1, status: 'open', payload: 'texto' })));
  const result = await client().getIncidentById('r-9');
  const ok = !result.ok && result.error.kind === 'invalid_payload';
  record(failureChecks, 'fm-06-payload-no-objeto', 'failure', ok,
    `Detalle con payload de tipo texto. Esperado kind=invalid_payload. Observado: ${observed(result)}`);
  expect(ok).toBe(true);
});

test('FM-07 version como texto en el sobre', async () => {
  mockFetch(reply(200, JSON.stringify({ id: 'r-9', version: '1', status: 'open', payload: null })));
  const result = await client().getIncidentById('r-9');
  const ok = !result.ok && result.error.kind === 'invalid_payload';
  record(failureChecks, 'fm-07-version-texto', 'failure', ok,
    `Detalle con version "1" (texto). Esperado kind=invalid_payload. Observado: ${observed(result)}`);
  expect(ok).toBe(true);
});

test('FM-08 lista con un elemento corrupto', async () => {
  const body = JSON.stringify({
    items: [
      JSON.parse(LIST_BODY).items[0],
      { id: '', version: 1, status: 'open', payload: null },
    ],
  });
  mockFetch(reply(200, body));
  const result = await client().listIncidents();
  const ok = result.ok && result.value.length === 1 && result.value[0]?.id === 'campus-inc-001';
  record(failureChecks, 'fm-08-lista-con-elemento-corrupto', 'boundary', ok,
    `Lista con 1 elemento válido y 1 con id vacío. Comportamiento declarado: se omite el corrupto y la lista no se rompe. Observado: ${result.ok ? `ok=true, ${result.value.length} elemento(s)` : observed(result)}`);
  expect(ok).toBe(true);
});

test('FM-09 sobre válido con payload sin categoría', async () => {
  mockFetch(reply(200, JSON.stringify({ id: 'r-10', version: 1, status: 'open', payload: { description: 'sin categoría' } })));
  const result = await client().getIncidentById('r-10');
  const ok = !result.ok && result.error.kind === 'invalid_payload';
  record(failureChecks, 'fm-09-payload-sin-categoria', 'failure', ok,
    `Sobre válido pero payload sin category. Esperado kind=invalid_payload (validación de dominio). Observado: ${observed(result)}`);
  expect(ok).toBe(true);
});

test('FM-10 crear: HTTP 500', async () => {
  mockFetch(reply(500, SERVER_ERROR_BODY));
  const result = await client().createIncident({
    category: 'connectivity',
    description: 'Prueba ficticia',
    location: 'Edificio de prueba A',
  });
  const ok = !result.ok && result.error.kind === 'server_error';
  record(failureChecks, 'fm-10-crear-server-error', 'failure', ok,
    `Creación con respuesta HTTP 500. Esperado kind=server_error. Observado: ${observed(result)}`);
  expect(ok).toBe(true);
});

afterAll(() => {
  const commitSha = execSync('git rev-parse HEAD').toString().trim();
  fs.mkdirSync('reports/week-05', { recursive: true });
  const base = { schemaVersion: 1, week: 5, commitSha, generatedAt: new Date().toISOString() };
  fs.writeFileSync('reports/week-05/contract-tests.json',
    JSON.stringify({ ...base, checks: contractChecks }, null, 2));
  fs.writeFileSync('reports/week-05/failure-matrix.json',
    JSON.stringify({ ...base, checks: failureChecks }, null, 2));
});