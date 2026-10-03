import { parseRemoteResource } from '../../course-evaluation';
import type { Incident } from '../../domain/incident';

const DEFAULT_URL = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? 'http://127.0.0.1:4310';
const REQUEST_TIMEOUT_MS = 4000;
const AUTH_HEADER = 'Bearer course-valid-token';

export type CloudClientError =
  | { kind: 'invalid_payload' }
  | { kind: 'timeout' }
  | { kind: 'server_error'; status: number }
  | { kind: 'network_error' };

export type CloudResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: CloudClientError }>;

function mapIncidentDtoToDomain(id: string, status: string, payload: Record<string, unknown>): Incident {
  return {
    id,
    title: typeof payload.description === 'string' ? payload.description : '(sin descripción)',
    category: payload.category as Incident['category'],
    status: status as Incident['status'],
    reporterId: typeof payload.reporterId === 'string' ? payload.reporterId : '',
  };
}

async function fetchJson(
  path: string,
  actorId: string,
  baseUrl: string,
  init?: RequestInit,
): Promise<CloudResult<unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: AUTH_HEADER, 'X-Course-Actor': actorId, ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: { kind: 'timeout' } };
    }
    return { ok: false, error: { kind: 'network_error' } };
  }
  clearTimeout(timer);

  if (!response.ok) {
    return { ok: false, error: { kind: 'server_error', status: response.status } };
  }

  try {
    return { ok: true, value: await response.json() };
  } catch {
    return { ok: false, error: { kind: 'invalid_payload' } };
  }
}

export function createCloudIncidentClient(actorId: string, baseUrl = DEFAULT_URL) {
  return {
    async getIncidentById(id: string): Promise<CloudResult<Incident | null>> {
      const result = await fetchJson(`/v1/incidents/${id}`, actorId, baseUrl);
      if (!result.ok) return result;

      const parsed = parseRemoteResource(result.value);
      if (!parsed.ok) {
        return { ok: false, error: { kind: 'invalid_payload' } };
      }
      if (parsed.value.payload === null) {
        // Un payload null es válido por contrato (sin detalle disponible aún):
        // no inventamos datos, devolvemos null en vez de un error.
        return { ok: true, value: null };
      }
      return {
        ok: true,
        value: mapIncidentDtoToDomain(parsed.value.id, parsed.value.status, parsed.value.payload),
      };
    },

    async listIncidents(): Promise<CloudResult<readonly Incident[]>> {
      const result = await fetchJson('/v1/incidents', actorId, baseUrl);
      if (!result.ok) return result;

      const envelope = result.value as { items?: unknown[] };
      if (!Array.isArray(envelope.items)) {
        return { ok: false, error: { kind: 'invalid_payload' } };
      }

      const incidents: Incident[] = [];
      for (const raw of envelope.items) {
        const parsed = parseRemoteResource(raw);
        if (!parsed.ok || parsed.value.payload === null) continue;
        incidents.push(mapIncidentDtoToDomain(parsed.value.id, parsed.value.status, parsed.value.payload));
      }
      return { ok: true, value: incidents };
    },

    async createIncident(input: Readonly<{
      category: string;
      description: string;
      location: string;
    }>): Promise<CloudResult<Incident>> {
      const idempotencyKey = `create-${actorId}-${Date.now()}`;
      const result = await fetchJson('/v1/incidents', actorId, baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(input),
      });
      if (!result.ok) return result;

      const envelope = result.value as { incident?: unknown };
      const parsed = parseRemoteResource(envelope.incident);
      if (!parsed.ok || parsed.value.payload === null) {
        return { ok: false, error: { kind: 'invalid_payload' } };
      }
      return {
        ok: true,
        value: mapIncidentDtoToDomain(parsed.value.id, parsed.value.status, parsed.value.payload),
      };
    },
  };
}