import type { ActorContext } from '../incidentActions';
import { canPerformAction } from '../authorization';
import type { IncidentSnapshot } from '../../domain/incidentActions';
import type { OfflineRequest, OfflineStore, PendingOperation } from '../../domain/offline';
import { resolveSync, deduplicateOperations } from '../../domain/sync/resolveSync';
import type { SyncRecord } from '../../course-evaluation/contracts';
export type SendResult = { kind: 'confirmed'; incident: IncidentSnapshot } | { kind: 'conflict' | 'forbidden' | 'unauthorized' | 'unavailable' | 'rejected' };
export interface SyncGateway {
  send(operation: PendingOperation): Promise<SendResult>;
  read(id: string): Promise<IncidentSnapshot | null>;
}
export type SyncSession = Readonly<{ actor: ActorContext; revision: number }>;
export function asSyncRecord(incident: IncidentSnapshot): SyncRecord {
  const { id, version, assignedTechnicianId, status, ...other } = incident;
  return { id, version, fields: { ...other, work: { assignedTechnicianId, status } } };
}
export function createOfflineSync(deps: {
  store: OfflineStore; gateway: SyncGateway; session: () => SyncSession | null; newId: () => string; now?: () => string;
}) {
  let running: Promise<void> | null = null;
  const current = (session: SyncSession) => {
    const value = deps.session();
    return value !== null && value.revision === session.revision && value.actor.actorId === session.actor.actorId;
  };
  return {
    async enqueue(base: IncidentSnapshot, request: OfflineRequest, note = ''): Promise<PendingOperation> {
      const session = deps.session();
      if (!session || !canPerformAction(request.action, { ...session.actor, incident: base })) throw new Error('forbidden');
      if ((await deps.store.listPending(session.actor.actorId)).some(op => op.incidentId === base.id)) throw new Error('incident_has_pending_operation');
      if (!current(session)) throw new Error('session_ended');
      if ((request.action === 'start' && base.status !== 'assigned') || (request.action === 'resolve' && base.status !== 'in_progress')) throw new Error('invalid_transition');
      if ((request.action === 'comment' && !request.text.trim()) || (request.action === 'add_evidence' && !request.evidenceId.trim())) throw new Error('invalid_content');
      const statuses = { start: 'in_progress', resolve: 'resolved', close: 'closed', reopen: 'assigned' } as const;
      const status = request.action in statuses ? statuses[request.action as keyof typeof statuses] : base.status;
      const op: PendingOperation = JSON.parse(JSON.stringify({
        operationId: deps.newId(), actorId: session.actor.actorId, incidentId: base.id, baseVersion: base.version,
        base, local: { ...base, status }, request, note, createdAt: deps.now?.() ?? new Date().toISOString(),
        status: 'pending', conflictFields: [], lastErrorCode: null,
      }));
      await deps.store.enqueue(op);
      return op;
    },
    synchronize(): Promise<void> {
      if (running) return running;
      const session = deps.session();
      if (!session) return Promise.reject(new Error('unauthenticated'));
      running = (async () => {
        const operations = deduplicateOperations(await deps.store.listPending(session.actor.actorId));
        for (const operation of operations) {
          if (!current(session)) return;
          if (operation.actorId !== session.actor.actorId || operation.status !== 'pending') continue;
          // Replay exact identity/body BEFORE fetching a newer base: a previous write may have committed.
          const result = await deps.gateway.send(operation);
          if (!current(session)) return;
          if (result.kind === 'confirmed') await deps.store.confirm(operation.actorId, operation.operationId, result.incident);
          else if (result.kind === 'conflict') {
            const remote = await deps.gateway.read(operation.incidentId);
            if (!current(session)) return;
            const resolution = remote ? resolveSync(asSyncRecord(operation.base), asSyncRecord(operation.local), asSyncRecord(remote)) : null;
            await deps.store.mark(operation.actorId, operation.operationId, 'conflict',
              resolution?.kind === 'conflict' ? resolution.fields : [], resolution?.kind === 'merged' ? 'rebase_requires_new_operation' : 'remote_conflict');
            if (remote) await deps.store.saveRemote(operation.actorId, remote);
          } else if (result.kind === 'forbidden' || result.kind === 'rejected') {
            await deps.store.mark(operation.actorId, operation.operationId, 'blocked', [], result.kind);
          } else {
            await deps.store.mark(operation.actorId, operation.operationId, 'pending', [], result.kind);
            return; // No loop on network failure or invalid session.
          }
        }
      })().finally(() => { running = null; });
      return running;
    },
  };
}

