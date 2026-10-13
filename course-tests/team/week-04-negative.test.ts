import fs from 'fs';
import { execSync } from 'child_process';
import { redactForTelemetry } from '../../src/course-evaluation';
import {
  saveSessionToken,
  clearSessionToken,
  getSessionToken,
} from '../../src/infrastructure/session/secureSessionStore';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SecureStore = require('expo-secure-store');

const CMD = 'npx jest course-tests/team/week-04-negative.test.ts';
const TOKEN = 'FAKE-TOKEN-abc123';
type Check = { id: string; status: 'pass' | 'fail'; scenarioType: string; command: string; evidence: string };
const checks: Check[] = [];

function record(id: string, scenarioType: string, threat: string, what: string, ok: boolean, observed: string) {
  checks.push({
    id,
    status: ok ? 'pass' : 'fail',
    scenarioType,
    command: CMD,
    evidence: `${threat}. ${what}. Observado: ${observed}`,
  });
}

async function errorMessageOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return '';
  } catch (e) {
    return String((e as Error).message);
  }
}

test('NT-01 objeto anidado', () => {
  const out = JSON.stringify(redactForTelemetry({
    incidentId: 'INC-1',
    reporter: { email: 'ana@example.test', name: 'Ana Ficticia' },
    auth: { accessToken: TOKEN },
  }));
  const ok = !/ana@example|Ana Ficticia/.test(out) && !out.includes(TOKEN) && out.includes('INC-1');
  record('nt-01-anidado', 'boundary', 'Amenaza 4 (filtrar datos en registros)',
    'email, name y accessToken anidados se ocultan y incidentId se conserva', ok, out);
  expect(ok).toBe(true);
});

test('NT-02 listas y formatos de clave', () => {
  const out = JSON.stringify(redactForTelemetry({
    items: [{ 'Access-Token': TOKEN, refresh_token: TOKEN, photos: ['p1.jpg'], status: 'open' }],
    assignmentHistory: [{ technicianId: 'tech-9' }],
    internalComments: ['nota interna'],
    location: { latitude: 1, longitude: 2 },
  }));
  const ok = !out.includes(TOKEN) && !out.includes('p1.jpg') && !out.includes('tech-9') &&
    !out.includes('nota interna') && out.includes('open');
  record('nt-02-listas-y-claves', 'boundary', 'Amenaza 4 (filtrar datos en registros)',
    'listas y claves Access-Token/refresh_token/photos/assignmentHistory/internalComments/location', ok, out);
  expect(ok).toBe(true);
});

test('NT-03 no muta la entrada', () => {
  const input = { password: 'x', nested: { email: 'a@example.test' }, list: [{ token: TOKEN }] };
  const before = JSON.stringify(input);
  redactForTelemetry(input);
  const ok = JSON.stringify(input) === before;
  record('nt-03-sin-mutacion', 'nominal', 'Amenaza 4 (filtrar datos en registros)',
    'la entrada original no cambia tras redactar', ok, ok ? 'entrada idéntica' : 'entrada modificada');
  expect(ok).toBe(true);
});

test('NT-04 error al guardar no expone el token', async () => {
  SecureStore.setItemAsync.mockRejectedValueOnce(new Error(`fallo interno con ${TOKEN}`));
  const msg = await errorMessageOf(() => saveSessionToken(TOKEN));
  const ok = !msg.includes(TOKEN);
  record('nt-04-error-guardar', 'failure', 'Amenaza 1 (exponer credenciales)',
    'el error propagado por saveSessionToken no contiene el token', ok, msg || 'sin error');
  expect(ok).toBe(true);
});

test('NT-05 error al borrar no expone el token', async () => {
  SecureStore.deleteItemAsync.mockRejectedValueOnce(new Error(`fallo interno con ${TOKEN}`));
  const msg = await errorMessageOf(() => clearSessionToken());
  const ok = !msg.includes(TOKEN);
  record('nt-05-error-borrar', 'failure', 'Amenaza 1 (exponer credenciales)',
    'el error propagado por clearSessionToken no contiene el token', ok, msg || 'sin error');
  expect(ok).toBe(true);
});

test('NT-06 lectura fallida devuelve null', async () => {
  SecureStore.getItemAsync.mockRejectedValueOnce(new Error(`fallo con ${TOKEN}`));
  const value = await getSessionToken();
  const ok = value === null;
  record('nt-06-error-leer', 'failure', 'Amenaza 1 (exponer credenciales)',
    'getSessionToken devuelve null sin detalles ante un fallo', ok, String(value));
  expect(ok).toBe(true);
});

afterAll(() => {
  const commitSha = execSync('git rev-parse HEAD').toString().trim();
  fs.mkdirSync('reports/week-04', { recursive: true });
  fs.writeFileSync('reports/week-04/negative-tests.json', JSON.stringify({
    schemaVersion: 1,
    week: 4,
    commitSha,
    generatedAt: new Date().toISOString(),
    checks,
  }, null, 2));
});