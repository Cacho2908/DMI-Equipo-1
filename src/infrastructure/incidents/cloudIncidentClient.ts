import { SessionError, SessionManager } from '../../application/session/sessionManager';
import { parseRemoteResource } from '../../course-evaluation';
import type { Incident } from '../../domain/incident';

const DEFAULT_URL = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? 'http://127.0.0.1:4310';
const REQUEST_TIMEOUT_MS = 4000;
// Solo se usa cuando el cliente se crea SIN sesion (pruebas de contrato de la Semana 5).
const AUTH_HEADER = 'Bearer course-valid-token';

const VALID_CATEGORIES = [
  'electrical',
  'laboratory',
  'water',
  'connectivity',
  'equipment',
  'safety',
  'maintenance',
] as const;

export type CloudClientError =
  | { kind: 'invalid_payload' }
  | { kind: 'timeout' }
  | { kind: 'server_error'; status: number }
  | { kind: 'network_error' }
  | { kind: 'unauthorized' };

export type CloudResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: CloudClientError }>;

function mapIncidentDtoToDomain(id: string, status: string, payload: Record<string, unknown>): Incident | null {
  const { category, description, reporterId } = payload;

  if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
    return null;
  }
  if (typeof description !== 'string' || description.length === 0) {
    return null;
  }

  return {
    id,
    title: description,
    category: category as Incident['category'],
    status: status as Incident['status'],
    reporterId: typeof reporterId === 'string' ? reporterId : '',
  };
}

async function attempt(
  path: string,
  actorId: string,
  baseUrl: string,
  authorization: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: authorization, 'X-Course-Actor': actorId, ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(
  path: string,
  actorId: string,
  baseUrl: string,
  session: SessionManager | undefined,
  init?: RequestInit,
): Promise<CloudResult<unknown>> {
  let response: Response;
  try {
    // Con sesion: el SessionManager pone el token vigente, renueva una sola vez ante un 401
    // y reintenta una sola vez. Sin sesion: comportamiento de la Semana 5.
    response =
      session !== undefined
        ? await session.execute((token) => attempt(path, actorId, baseUrl, `Bearer ${token}`, init))
        : await attempt(path, actorId, baseUrl, AUTH_HEADER, init);
  } catch (err) {
    if (err instanceof SessionError) {
      return { ok: false, error: { kind: 'unauthorized' } };
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: { kind: 'timeout' } };
    }
    return { ok: false, error: { kind: 'network_error' } };
  }

  if (!response.ok) {
    return { ok: false, error: { kind: 'server_error', status: response.status } };
  }

  try {
    return { ok: true, value: await response.json() };
  } catch {
    return { ok: false, error: { kind: 'invalid_payload' } };
  }
}

export function createCloudIncidentClient(actorId: string, baseUrl = DEFAULT_URL, session?: SessionManager) {
  return {
    async getIncidentById(id: string): Promise<CloudResult<Incident | null>> {
      const result = await fetchJson(`/v1/incidents/${id}`, actorId, baseUrl, session);
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
      const incident = mapIncidentDtoToDomain(parsed.value.id, parsed.value.status, parsed.value.payload);
      if (incident === null) {
        return { ok: false, error: { kind: 'invalid_payload' } };
      }
      return { ok: true, value: incident };
    },

    async listIncidents(): Promise<CloudResult<readonly Incident[]>> {
      const result = await fetchJson('/v1/incidents', actorId, baseUrl, session);
      if (!result.ok) return result;

      // El sobre puede venir como null, arreglo u otro tipo aunque el HTTP sea 200.
      const envelope = result.value;
      if (typeof envelope !== 'object' || envelope === null || !('items' in envelope) || !Array.isArray(envelope.items)) {
        return { ok: false, error: { kind: 'invalid_payload' } };
      }

      const incidents: Incident[] = [];
      for (const raw of envelope.items) {
        const parsed = parseRemoteResource(raw);
        if (!parsed.ok) {
          // Un elemento corrupto no se omite en silencio: la lista no sería completa.
          return { ok: false, error: { kind: 'invalid_payload' } };
        }
        if (parsed.value.payload === null) continue; // válido por contrato, pero sin datos que mostrar
        const incident = mapIncidentDtoToDomain(parsed.value.id, parsed.value.status, parsed.value.payload);
        if (incident === null) {
          return { ok: false, error: { kind: 'invalid_payload' } };
        }
        incidents.push(incident);
      }
      return { ok: true, value: incidents };
    },

    async createIncident(input: Readonly<{
      category: string;
      description: string;
      location: string;
    }>): Promise<CloudResult<Incident>> {
      // La misma llave de idempotencia se reutiliza si la solicitud se reintenta tras renovar la sesión.
      const idempotencyKey = `create-${actorId}-${Date.now()}`;
      const result = await fetchJson('/v1/incidents', actorId, baseUrl, session, {
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
      const incident = mapIncidentDtoToDomain(parsed.value.id, parsed.value.status, parsed.value.payload);
      if (incident === null) {
        return { ok: false, error: { kind: 'invalid_payload' } };
      }
      return { ok: true, value: incident };
    },
  };
}