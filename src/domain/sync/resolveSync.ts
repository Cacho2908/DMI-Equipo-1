import type { SyncRecord, JsonObject } from '../../course-evaluation/contracts';
export function equalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((v, i) => equalJson(v, right[i]));
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equalJson(a[k], b[k]));
}
export function resolveSync(base: SyncRecord, local: SyncRecord, remote: SyncRecord):
  Readonly<{ kind: 'merged'; fields: JsonObject } | { kind: 'conflict'; fields: readonly string[] }> {
  if (base.id !== local.id || base.id !== remote.id) throw new Error('sync_identity_mismatch');
  const fields: Record<string, unknown> = {}, conflicts: string[] = [];
  const same = (a: JsonObject, b: JsonObject, key: string) => Object.hasOwn(a, key) === Object.hasOwn(b, key) && equalJson(a[key], b[key]);
  for (const key of [...new Set([...Object.keys(base.fields), ...Object.keys(local.fields), ...Object.keys(remote.fields)])].sort()) {
    const lc = !same(base.fields, local.fields, key), rc = !same(base.fields, remote.fields, key);
    if (lc && rc && !same(local.fields, remote.fields, key)) conflicts.push(key);
    else {
      const source = lc ? local.fields : remote.fields;
      if (Object.hasOwn(source, key)) fields[key] = JSON.parse(JSON.stringify(source[key]));
    }
  }
  return conflicts.length ? { kind: 'conflict', fields: conflicts } : { kind: 'merged', fields };
}
export function deduplicateOperations<T extends Readonly<{ operationId: string }>>(operations: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  return operations.filter(op => { if (seen.has(op.operationId)) return false; seen.add(op.operationId); return true; });
}

