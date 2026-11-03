import fs from 'fs';
import os from 'os';
import path from 'path';
import { selectIncidentLocation } from '../../src/course-evaluation';

type ScenarioType = 'nominal' | 'boundary' | 'failure';
type Check = {
  id: string;
  status: 'pass' | 'fail';
  scenarioType: ScenarioType;
  command: string;
  evidence: string;
};

const CMD = 'npx jest course-tests/team/week-09-selector.test.ts';
const MANUAL = 'Edificio manual';
const manual = { source: 'manual', label: MANUAL };
const checks: Check[] = [];

function verify(id: string, type: ScenarioType, what: string, actual: unknown, expected: unknown) {
  const evidence = `${what}. Esperado: ${JSON.stringify(expected)}. Observado: ${JSON.stringify(actual)}`;
  try {
    expect(actual).toStrictEqual(expected);
  } catch (error) {
    checks.push({ id, status: 'fail', scenarioType: type, command: CMD, evidence });
    throw error;
  }
  checks.push({ id, status: 'pass', scenarioType: type, command: CMD, evidence });
}

const pick = (input: unknown) => selectIncidentLocation(input, MANUAL);

test('SL-01 resultado válido del proveedor', () => {
  verify('sl-01-proveedor-valido', 'nominal',
    'Objeto con label y coordenadas válidas se acepta como proveedor y no copia campos extra',
    pick({ label: 'Zona de prueba', latitude: 20.5, longitude: -100.4, extra: 'ignorado' }),
    { source: 'provider', label: 'Zona de prueba', latitude: 20.5, longitude: -100.4 });
});

test('SL-02 coordenadas cero y extremos son válidas', () => {
  const inputs = [
    { label: 'Cero', latitude: 0, longitude: 0 },
    { label: 'Polo norte', latitude: 90, longitude: 180 },
    { label: 'Polo sur', latitude: -90, longitude: -180 },
  ];
  verify('sl-02-cero-y-extremos', 'boundary', '0 y los límites exactos de latitud y longitud se aceptan',
    inputs.map(pick), inputs.map((i) => ({ source: 'provider', ...i })));
});

test('SL-03 coordenadas fuera de rango se rechazan', () => {
  const inputs = [
    { label: 'X', latitude: 90.0001, longitude: 0 },
    { label: 'X', latitude: -91, longitude: 0 },
    { label: 'X', latitude: 0, longitude: 180.0001 },
    { label: 'X', latitude: 0, longitude: -181 },
  ];
  verify('sl-03-fuera-de-rango', 'failure',
    'Latitud o longitud fuera de rango se descartan y se usa la etiqueta manual',
    inputs.map(pick), inputs.map(() => manual));
});

test('SL-04 tipos incorrectos o no finitos se rechazan', () => {
  const inputs = [
    { label: 'X', latitude: '10', longitude: 10 },
    { label: 'X', latitude: 10, longitude: null },
    { label: 'X', latitude: Number.NaN, longitude: 10 },
    { label: 'X', latitude: 10, longitude: Number.POSITIVE_INFINITY },
    { label: 'X', latitude: true, longitude: 10 },
  ];
  verify('sl-04-tipos-incorrectos', 'failure',
    'Texto, null, NaN, Infinity y booleanos como coordenadas se rechazan',
    inputs.map(pick), inputs.map(() => manual));
});

test('SL-05 datos incompletos se rechazan', () => {
  const inputs = [
    { label: 'Incompleta' },
    { label: 'X', latitude: 10 },
    { label: 'X', longitude: 10 },
    { latitude: 10, longitude: 10 },
  ];
  verify('sl-05-incompleto', 'failure', 'Falta la latitud, la longitud o la etiqueta',
    inputs.map(pick), inputs.map(() => manual));
});

test('SL-06 etiqueta del proveedor inválida', () => {
  const inputs = [
    { label: '', latitude: 1, longitude: 1 },
    { label: '   ', latitude: 1, longitude: 1 },
    { label: 42, latitude: 1, longitude: 1 },
    { label: null, latitude: 1, longitude: 1 },
  ];
  verify('sl-06-etiqueta-invalida', 'failure', 'Etiqueta vacía, en blanco o que no es texto',
    inputs.map(pick), inputs.map(() => manual));
});

test('SL-07 entrada que no es un objeto', () => {
  const inputs: unknown[] = [null, undefined, 42, 'texto', true, [], [{ label: 'X', latitude: 1, longitude: 1 }]];
  verify('sl-07-no-objeto', 'failure', 'null, undefined, números, texto, booleanos y arreglos se rechazan',
    inputs.map(pick), inputs.map(() => manual));
});

test('SL-08 error representado como dato', () => {
  const inputs = [{ status: 429 }, { error: 'timeout' }, { code: 'rate_limited', retryAfterMs: 800 }];
  verify('sl-08-error-como-dato', 'failure', 'Un 429 o un timeout entregados como objeto usan la alternativa manual',
    inputs.map(pick), inputs.map(() => manual));
});

test('SL-09 la alternativa manual no inventa coordenadas', () => {
  const result = pick(null);
  verify('sl-09-manual-sin-coordenadas', 'failure',
    'El resultado manual conserva la etiqueta y no trae propiedades de coordenadas',
    { result, keys: Object.keys(result).sort() },
    { result: manual, keys: ['label', 'source'] });
});

test('SL-10 no muta la entrada', () => {
  const input = Object.freeze({ label: 'Zona', latitude: 1, longitude: 2 });
  const before = JSON.stringify(input);
  pick(input);
  verify('sl-10-sin-mutacion', 'boundary', 'La entrada congelada no se modifica',
    JSON.stringify(input), before);
});

afterAll(() => {
  const file = path.join(os.tmpdir(), 'janeth-week09-selector-checks.json');
  fs.writeFileSync(file, JSON.stringify(checks, null, 2), 'utf8');
  process.stdout.write(`\nChecks guardados en: ${file}\n`);
});