import { parseRetryAfter } from '../../domain/resilience/retryPolicy';
import { executeWithRetry, type RetryOptions } from '../http/retryExecutor';
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

export function mapIncidentDtoToDomain(id: string, status: string, payload: Record<string, unknown>): Incident | null {
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
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: authorization, 'X-Course-Actor': actorId, ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, headers: response.headers, json: async () => JSON.parse(text) } as Response;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(
  path: string,
  actorId: string,
  baseUrl: string,
  session: SessionManager | undefined,
  init?: RequestInit,
  options?: RetryOptions,
): Promise<CloudResult<unknown>> {
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) throw new Error('invalid_timeout');
  // Snapshot the exact body and key once, across transport and session retries.
  const headers = new Headers(init?.headers);
  const stableInit = { ...init, headers: Object.fromEntries(headers.entries()) };
  const method = init?.method?.toUpperCase() === 'POST' ? 'POST' : 'GET';
  const once = async (): Promise<{ status: number | 'timeout'; value: CloudResult<unknown>; retryAfterMs?: number | undefined }> => {
    let response: Response;
    try {
      response = session !== undefined
        ? await session.execute(token => attempt(path, actorId, baseUrl, `Bearer ${token}`, stableInit, timeoutMs))
        : await attempt(path, actorId, baseUrl, AUTH_HEADER, stableInit, timeoutMs);
    } catch (err) {
      if (err instanceof SessionError) return { status: 401, value: { ok: false, error: { kind: 'unauthorized' } } };
      return { status: 'timeout', value: { ok: false, error: { kind: err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network_error' } } };
    }
    if (!response.ok) return { status: response.status, retryAfterMs: parseRetryAfter(response.headers.get('retry-after')), value: { ok: false, error: { kind: 'server_error', status: response.status } } };
    try { return { status: response.status, value: { ok: true, value: await response.json() } }; }
    catch { return { status: 422, value: { ok: false, error: { kind: 'invalid_payload' } } }; }
  };
  if (!options) return (await once()).value;
  try { return await executeWithRetry({ method, idempotencyKey: headers.get('idempotency-key') ?? undefined }, once, options); }
  catch (error) {
    if (error instanceof Error && error.message === 'retry_cancelled') return { ok: false, error: { kind: 'unauthorized' } };
    throw error;
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