import fs from 'fs';
import os from 'os';
import path from 'path';
import { deduplicateOperations, resolveSync } from '../../src/course-evaluation';

type Fields = Readonly<Record<string, unknown>>;
type ScenarioType = 'nominal' | 'boundary' | 'failure';
type Check = {
  id: string;
  status: 'pass' | 'fail';
  scenarioType: ScenarioType;
  command: string;
  evidence: string;
};

const CMD = 'npx jest course-tests/team/week-08-sync.test.ts';
const checks: Check[] = [];

const rec = (version: number, fields: Fields, id = 'campus-inc-001') => ({ id, version, fields });

function verify(id: string, type: ScenarioType, what: string, actual: unknown, expected: unknown) {
  const detail = `${what}. Esperado: ${JSON.stringify(expected)}. Observado: ${JSON.stringify(actual)}`;
  try {
    expect(actual).toEqual(expected);
  } catch (error) {
    checks.push({ id, status: 'fail', scenarioType: type, command: CMD, evidence: detail });
    throw error;
  }
  checks.push({ id, status: 'pass', scenarioType: type, command: CMD, evidence: detail });
}

test('SY-01 solo cambia el lado local', () => {
  const result = resolveSync(
    rec(1, { title: 'A', priority: 1 }),
    rec(1, { title: 'Local', priority: 1 }),
    rec(2, { title: 'A', priority: 1 }),
  );
  verify('sy-01-solo-local', 'nominal', 'Solo cambió local: se conserva el cambio local',
    result, { kind: 'merged', fields: { priority: 1, title: 'Local' } });
});

test('SY-02 solo cambia el lado remoto', () => {
  const result = resolveSync(
    rec(1, { title: 'A', priority: 1 }),
    rec(1, { title: 'A', priority: 1 }),
    rec(2, { title: 'Remote', priority: 1 }),
  );
  verify('sy-02-solo-remoto', 'nominal', 'Solo cambió remoto: se conserva el cambio remoto',
    result, { kind: 'merged', fields: { priority: 1, title: 'Remote' } });
});

test('SY-03 cambios independientes se combinan', () => {
  const result = resolveSync(
    rec(1, { title: 'A', priority: 1 }),
    rec(1, { title: 'Local', priority: 1 }),
    rec(2, { title: 'A', priority: 2 }),
  );
  verify('sy-03-independientes', 'nominal', 'Campos distintos: se combinan ambos cambios',
    result, { kind: 'merged', fields: { priority: 2, title: 'Local' } });
});

test('SY-04 ambos lados llegan al mismo contenido', () => {
  const result = resolveSync(
    rec(1, { title: 'A' }),
    rec(1, { title: 'Igual' }),
    rec(2, { title: 'Igual' }),
  );
  verify('sy-04-mismo-contenido', 'boundary', 'Mismo campo con el mismo contenido en ambos lados: no hay conflicto',
    result, { kind: 'merged', fields: { title: 'Igual' } });
});

test('SY-05 mismo campo con valores distintos es conflicto', () => {
  const result = resolveSync(
    rec(1, { title: 'A' }),
    rec(1, { title: 'Local' }),
    rec(2, { title: 'Remote' }),
  );
  verify('sy-05-mismo-campo', 'failure', 'Mismo campo con contenido distinto: se declara conflicto',
    result, { kind: 'conflict', fields: ['title'] });
});

test('SY-06 varios conflictos salen en orden de nombre', () => {
  const result = resolveSync(
    rec(1, { zeta: 1, alpha: 1, mid: 1 }),
    rec(1, { zeta: 2, alpha: 2, mid: 1 }),
    rec(2, { zeta: 3, alpha: 3, mid: 1 }),
  );
  verify('sy-06-conflictos-ordenados', 'failure', 'Dos campos en conflicto se reportan ordenados por nombre',
    result, { kind: 'conflict', fields: ['alpha', 'zeta'] });
});

test('SY-07 el orden de claves de un objeto no crea conflicto falso', () => {
  const result = resolveSync(
    rec(1, { priority: 1, work: { assignedTechnicianId: 'technician-1', status: 'assigned' } }),
    rec(1, { priority: 1, work: { status: 'assigned', assignedTechnicianId: 'technician-1' } }),
    rec(2, { priority: 2, work: { assignedTechnicianId: 'technician-1', status: 'assigned' } }),
  );
  verify('sy-07-orden-de-claves', 'boundary', 'Mismo contenido con claves en otro orden: no hay conflicto y se combina',
    result,
    { kind: 'merged', fields: { priority: 2, work: { assignedTechnicianId: 'technician-1', status: 'assigned' } } });
});

test('SY-08 inicio local contra reasignación remota es conflicto en work', () => {
  const result = resolveSync(
    rec(1, { work: { assignedTechnicianId: 'technician-1', status: 'assigned' } }),
    rec(1, { work: { assignedTechnicianId: 'technician-1', status: 'in_progress' } }),
    rec(2, { work: { assignedTechnicianId: 'technician-2', status: 'assigned' } }),
  );
  verify('sy-08-inicio-vs-reasignacion', 'failure', 'El técnico inicia sin conexión y coordinación reasigna: conflicto en work',
    result, { kind: 'conflict', fields: ['work'] });
});

test('SY-09 solo el inicio local, sin reasignación remota', () => {
  const result = resolveSync(
    rec(1, { work: { assignedTechnicianId: 'technician-1', status: 'assigned' } }),
    rec(1, { work: { assignedTechnicianId: 'technician-1', status: 'in_progress' } }),
    rec(2, { work: { assignedTechnicianId: 'technician-1', status: 'assigned' } }),
  );
  verify('sy-09-solo-inicio-local', 'nominal', 'Sin cambio remoto en work: se conserva el inicio local',
    result, { kind: 'merged', fields: { work: { assignedTechnicianId: 'technician-1', status: 'in_progress' } } });
});

test('SY-10 solo la reasignación remota, sin cambio local', () => {
  const result = resolveSync(
    rec(1, { work: { assignedTechnicianId: 'technician-1', status: 'assigned' } }),
    rec(1, { work: { assignedTechnicianId: 'technician-1', status: 'assigned' } }),
    rec(2, { work: { assignedTechnicianId: 'technician-2', status: 'assigned' } }),
  );
  verify('sy-10-solo-reasignacion-remota', 'nominal', 'Sin cambio local en work: se respeta la reasignación remota',
    result, { kind: 'merged', fields: { work: { assignedTechnicianId: 'technician-2', status: 'assigned' } } });
});

test('SY-11 propiedad ausente no es lo mismo que null', () => {
  const addedNull = resolveSync(
    rec(1, { title: 'A' }),
    rec(1, { title: 'A', note: null }),
    rec(2, { title: 'A' }),
  );
  verify('sy-11a-null-agregado', 'boundary', 'Local agrega note con valor null y remoto no cambia: se conserva null',
    addedNull, { kind: 'merged', fields: { note: null, title: 'A' } });

  const removed = resolveSync(
    rec(1, { title: 'A', note: null }),
    rec(1, { title: 'A' }),
    rec(2, { title: 'A', note: null }),
  );
  const removedHasKey = removed.kind === 'merged' && 'note' in removed.fields;
  verify('sy-11b-propiedad-retirada', 'boundary', 'Local retira note y remoto no cambia: note queda ausente, no null',
    { removed, removedHasKey }, { removed: { kind: 'merged', fields: { title: 'A' } }, removedHasKey: false });

  const conflict = resolveSync(
    rec(1, { title: 'A' }),
    rec(1, { title: 'A', note: null }),
    rec(2, { title: 'A', note: 'x' }),
  );
  verify('sy-11c-null-vs-texto', 'failure', 'Local agrega null y remoto agrega texto en note: conflicto',
    conflict, { kind: 'conflict', fields: ['note'] });
});

test('SY-12 el orden de un arreglo sí importa', () => {
  const localReorder = resolveSync(
    rec(1, { tags: ['a', 'b'] }),
    rec(1, { tags: ['b', 'a'] }),
    rec(2, { tags: ['a', 'b'] }),
  );
  verify('sy-12a-arreglo-reordenado', 'boundary', 'Local reordena un arreglo y remoto no cambia: se conserva el nuevo orden',
    localReorder, { kind: 'merged', fields: { tags: ['b', 'a'] } });

  const conflict = resolveSync(
    rec(1, { tags: ['a', 'b'] }),
    rec(1, { tags: ['b', 'a'] }),
    rec(2, { tags: ['a', 'b', 'c'] }),
  );
  verify('sy-12b-arreglo-en-conflicto', 'failure', 'Local reordena y remoto agrega elemento: conflicto en tags',
    conflict, { kind: 'conflict', fields: ['tags'] });
});

test('SY-13 no muta las entradas ni comparte objetos con el resultado', () => {
  const base = rec(1, { work: { assignedTechnicianId: 'technician-1', status: 'assigned' }, tags: ['a'] });
  const local = rec(1, { work: { assignedTechnicianId: 'technician-1', status: 'in_progress' }, tags: ['a'] });
  const remote = rec(2, { work: { assignedTechnicianId: 'technician-1', status: 'assigned' }, tags: ['a', 'b'] });
  const before = JSON.stringify([base, local, remote]);

  const result = resolveSync(base, local, remote);
  const unchangedAfterResolve = JSON.stringify([base, local, remote]) === before;

  if (result.kind !== 'merged') throw new Error('se esperaba una combinación');
  (result.fields.work as { status: string }).status = 'alterado-en-el-resultado';
  const isolatedFromInputs = JSON.stringify([base, local, remote]) === before;

  verify('sy-13-sin-mutacion', 'boundary', 'Las entradas no cambian al resolver ni al modificar el resultado',
    { unchangedAfterResolve, isolatedFromInputs }, { unchangedAfterResolve: true, isolatedFromInputs: true });
});

test('SY-14 registros de incidencias distintas se rechazan', () => {
  let message = '';
  try {
    resolveSync(
      rec(1, { title: 'A' }),
      rec(1, { title: 'B' }, 'otra-incidencia'),
      rec(2, { title: 'A' }),
    );
  } catch (error) {
    message = (error as Error).message;
  }
  verify('sy-14-identidad-distinta', 'failure', 'Un registro de otra incidencia lanza un error controlado',
    message, 'sync_identity_mismatch');
});

test('SY-15 deduplica conservando la primera operación', () => {
  const operations = [
    { operationId: 'op-1', value: 1 },
    { operationId: 'op-1', value: 99 },
    { operationId: 'op-2', value: 2 },
    { operationId: 'op-1', value: 3 },
    { operationId: 'op-3', value: 4 },
    { operationId: 'op-2', value: 5 },
  ];
  const before = JSON.stringify(operations);
  const result = deduplicateOperations(operations);
  verify('sy-15-deduplicacion', 'boundary', 'Repetidos consecutivos y separados: se conserva la primera operación en orden',
    {
      result,
      inputUnchanged: JSON.stringify(operations) === before,
      newArray: result !== operations,
    },
    {
      result: [
        { operationId: 'op-1', value: 1 },
        { operationId: 'op-2', value: 2 },
        { operationId: 'op-3', value: 4 },
      ],
      inputUnchanged: true,
      newArray: true,
    });
});

afterAll(() => {
  const file = path.join(os.tmpdir(), 'janeth-week08-checks.json');
  fs.writeFileSync(file, JSON.stringify(checks, null, 2), 'utf8');
  process.stdout.write(`\nChecks guardados en: ${file}\n`);
});