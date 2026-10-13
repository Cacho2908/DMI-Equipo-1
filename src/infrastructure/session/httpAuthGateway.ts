import type {
  AuthGateway,
  LoginResult,
  RefreshResult,
  SessionRole,
} from '../../application/session/sessionManager';

const DEFAULT_URL = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? 'http://127.0.0.1:4310';
const REQUEST_TIMEOUT_MS = 4000;
const ROLES: readonly SessionRole[] = ['reporter', 'technician', 'coordinator'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function postJson(baseUrl: string, path: string, body: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('auth_request_failed');
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function readTokens(value: Record<string, unknown>): RefreshResult {
  const { accessToken, refreshToken, expiresIn } = value;
  if (
    typeof accessToken !== 'string' ||
    accessToken.length === 0 ||
    typeof refreshToken !== 'string' ||
    refreshToken.length === 0 ||
    typeof expiresIn !== 'number' ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new Error('auth_contract');
  }
  return { accessToken, refreshToken, expiresIn };
}

/** Habla con /v1/session/login y /v1/session/refresh y valida lo que recibe. */
export function createHttpAuthGateway(baseUrl: string = DEFAULT_URL): AuthGateway {
  return {
    async login(actorId: string): Promise<LoginResult> {
      const value = await postJson(baseUrl, '/v1/session/login', { actorId });
      if (!isRecord(value)) throw new Error('auth_contract');
      const role = ROLES.find((candidate) => candidate === value.role);
      if (typeof value.actorId !== 'string' || role === undefined) throw new Error('auth_contract');
      return { actorId: value.actorId, role, ...readTokens(value) };
    },
    async refresh(refreshToken: string): Promise<RefreshResult> {
      const value = await postJson(baseUrl, '/v1/session/refresh', { refreshToken });
      if (!isRecord(value)) throw new Error('auth_contract');
      return readTokens(value);
    },
  };
}