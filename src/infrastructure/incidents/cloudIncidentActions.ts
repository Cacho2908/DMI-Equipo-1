import type { SessionManager } from '../../application/session/sessionManager';
import { parseRemoteResource } from '../../course-evaluation';
import type {
  ActionFailureReason,
  ActionOutcome,
  IncidentActionGateway,
  IncidentActionRequest,
  IncidentSnapshot,
} from '../../domain/incidentActions';
import {
  fetchJson,
  mapIncidentDtoToDomain,
  type CloudClientError,
  type CloudResult,
} from './cloudIncidentClient';

const DEFAULT_URL = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? 'http://127.0.0.1:4310';

function toSnapshot(
  value: Readonly<{ id: string; version: number; status: string; payload: Record<string, unknown> }>,
): IncidentSnapshot | null {
  const incident = mapIncidentDtoToDomain(value.id, value.status, value.payload);
  if (incident === null) return null;
  const assigned = value.payload.assignedTechnicianId;
  return {
    ...incident,
    version: value.version,
    assignedTechnicianId: typeof assigned === 'string' ? assigned : null,
  };
}

function toReason(error: CloudClientError): ActionFailureReason {
  if (error.kind === 'unauthorized') return 'unauthorized';
  if (error.kind === 'server_error') {
    if (error.status === 403) return 'forbidden';
    if (error.status === 409) return 'conflict';
    if (error.status === 400 || error.status === 422) return 'rejected';
  }
  return 'unavailable';
}

export function createCloudIncidentActions(
  actorId: string,
  session: SessionManager,
  baseUrl: string = DEFAULT_URL,
): IncidentActionGateway & {
  getIncidentSnapshot(id: string): Promise<CloudResult<IncidentSnapshot | null>>;
} {
  return {
    async getIncidentSnapshot(id: string): Promise<CloudResult<IncidentSnapshot | null>> {
      const result = await fetchJson(`/v1/incidents/${id}`, actorId, baseUrl, session);
      if (!result.ok) return result;

      const parsed = parseRemoteResource(result.value);
      if (!parsed.ok) return { ok: false, error: { kind: 'invalid_payload' } };
      if (parsed.value.payload === null) return { ok: true, value: null };

      const snapshot = toSnapshot({ ...parsed.value, payload: parsed.value.payload });
      if (snapshot === null) return { ok: false, error: { kind: 'invalid_payload' } };
      return { ok: true, value: snapshot };
    },

    async applyAction(snapshot: IncidentSnapshot, request: IncidentActionRequest): Promise<ActionOutcome> {
      // La llave es determinista por intencion (actor + accion + incidencia + version): si la
      // respuesta se pierde o la solicitud se reintenta tras renovar la sesion, el servidor
      // devuelve el resultado ya registrado en vez de aplicar la accion dos veces.
      const idempotencyKey = `${actorId}-${request.action}-${snapshot.id}-v${snapshot.version}`;
      const result = await fetchJson(`/v1/incidents/${snapshot.id}/actions`, actorId, baseUrl, session, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ ...request, baseVersion: snapshot.version }),
      });
      if (!result.ok) return { ok: false, reason: toReason(result.error) };

      const envelope = result.value;
      const raw = typeof envelope === 'object' && envelope !== null && 'incident' in envelope ? envelope.incident : undefined;
      const parsed = parseRemoteResource(raw);
      if (!parsed.ok || parsed.value.payload === null) return { ok: false, reason: 'unavailable' };

      const updated = toSnapshot({ ...parsed.value, payload: parsed.value.payload });
      if (updated === null) return { ok: false, reason: 'unavailable' };
      return { ok: true, incident: updated };
    },
  };
}