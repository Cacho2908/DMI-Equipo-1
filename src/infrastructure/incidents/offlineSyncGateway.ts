import type { SyncGateway, SendResult } from '../../application/sync/offlineSync';
import type { PendingOperation } from '../../domain/offline';
import type { SessionManager } from '../../application/session/sessionManager';
import { fetchJson } from './cloudIncidentClient';
import { toSnapshot } from './cloudIncidentActions';
import { parseRemoteResource } from '../../course-evaluation';
const DEFAULT_URL = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? 'http://127.0.0.1:4310';
export function createOfflineSyncGateway(actorId: string, session: SessionManager, baseUrl = DEFAULT_URL): SyncGateway {
  return {
    async send(operation: PendingOperation): Promise<SendResult> {
      const active = session.getState();
      if ((active.status !== 'authenticated' && active.status !== 'refreshing') || active.actorId !== actorId || operation.actorId !== actorId) return { kind: 'forbidden' };
      const result = await fetchJson(`/v1/incidents/${encodeURIComponent(operation.incidentId)}/actions`, actorId, baseUrl, session, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': operation.operationId },
        body: JSON.stringify({ ...operation.request, baseVersion: operation.baseVersion }),
      });
      if (!result.ok) {
        if (result.error.kind === 'unauthorized') return { kind: 'unauthorized' };
        if (result.error.kind === 'server_error') {
          if (result.error.status === 403) return { kind: 'forbidden' };
          if (result.error.status === 409) return { kind: 'conflict' };
          if ([400, 404, 422].includes(result.error.status)) return { kind: 'rejected' };
        }
        return { kind: 'unavailable' };
      }
      const body = result.value;
      if (!body || typeof body !== 'object' || !('operationId' in body) || body.operationId !== operation.operationId || !('incident' in body)) return { kind: 'unavailable' };
      const parsed = parseRemoteResource(body.incident);
      if (!parsed.ok || parsed.value.id !== operation.incidentId || parsed.value.version <= operation.baseVersion || parsed.value.payload === null) return { kind: 'unavailable' };
      const incident = toSnapshot({ ...parsed.value, payload: parsed.value.payload });
      return incident ? { kind: 'confirmed', incident } : { kind: 'unavailable' };
    },
    async read(id) {
      const active = session.getState();
      if ((active.status !== 'authenticated' && active.status !== 'refreshing') || active.actorId !== actorId) return null;
      const result = await fetchJson(`/v1/incidents/${encodeURIComponent(id)}`, actorId, baseUrl, session);
      if (!result.ok) return null;
      const parsed = parseRemoteResource(result.value);
      return parsed.ok && parsed.value.payload !== null ? toSnapshot({ ...parsed.value, payload: parsed.value.payload }) : null;
    },
  };
}


