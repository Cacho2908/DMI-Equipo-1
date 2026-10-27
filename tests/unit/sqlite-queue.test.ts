import { spawnSync } from 'node:child_process';
import path from 'node:path';

/** Estas pruebas invocan el adaptador real con SQLite en disco, no comparaciones de fixtures. */
function check(pattern: string) {
  const result = spawnSync(process.execPath, ['--test', '--test-name-pattern', pattern, 'tools/week08-hector-check.cjs'], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  expect(result.stdout).toContain('# fail 0');
}
test('SQLite recupera identidad y contenido al cerrar/reabrir y aísla usuarios', () => {
  check('SQLite: pending identity');
}, 20000);
test('SQLite revierte migración fallida y permite recuperar v1 a v2', () => {
  check('SQLite: v1 migration');
}, 20000);
test('SQLite conserva el primer duplicado y rechaza reutilización de identidad', () => {
  check('pending identity cannot');
}, 20000);
test('SQLite revierte caché, archivo y retiro de cola si falla confirmación', () => {
  check('failed confirmation transaction');
}, 20000);
