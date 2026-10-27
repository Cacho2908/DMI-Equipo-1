import type { IncidentActionRequest, IncidentSnapshot } from './incidentActions';
export type OfflineRequest = IncidentActionRequest | Readonly<{ action: 'comment'; text: string }> | Readonly<{ action: 'add_evidence'; evidenceId: string }>;
export type PendingOperation = Readonly<{
  operationId: string; actorId: string; incidentId: string; baseVersion: number;
  base: IncidentSnapshot; local: IncidentSnapshot; request: OfflineRequest; note: string;
  createdAt: string; status: 'pending' | 'conflict' | 'blocked';
  conflictFields: readonly string[]; lastErrorCode: string | null;
}>;
export interface OfflineStore {
  initialize(): Promise<void>;
  saveRemote(actorId: string, incident: IncidentSnapshot): Promise<void>;
  listCached(actorId: string): Promise<readonly IncidentSnapshot[]>;
  enqueue(operation: PendingOperation): Promise<void>;
  listPending(actorId: string): Promise<readonly PendingOperation[]>;
  mark(actorId: string, id: string, status: PendingOperation['status'], fields: readonly string[], code: string): Promise<void>;
  confirm(actorId: string, id: string, incident: IncidentSnapshot): Promise<void>;
  archiveResolution(actorId: string, id: string, reason: string): Promise<void>;
}

