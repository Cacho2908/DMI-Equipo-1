import type { SessionEvent } from './authEvents';

export type SessionRole = 'reporter' | 'technician' | 'coordinator';

export type SessionState =
  | Readonly<{ status: 'anonymous' }>
  | Readonly<{ status: 'authenticating' }>
  | Readonly<{ status: 'authenticated'; actorId: string; role: SessionRole }>
  | Readonly<{ status: 'refreshing'; actorId: string; role: SessionRole }>;

export type SessionTokens = Readonly<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}>;

export type LoginResult = Readonly<{
  actorId: string;
  role: SessionRole;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}>;

export type RefreshResult = Readonly<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}>;

/** Puerto hacia el servidor de autenticacion (lo implementa infraestructura). */
export interface AuthGateway {
  login(actorId: string): Promise<LoginResult>;
  refresh(refreshToken: string): Promise<RefreshResult>;
}

/** Puerto de persistencia segura de tokens (lo implementa infraestructura). */
export interface TokenStore {
  save(tokens: SessionTokens): Promise<void>;
  clear(): Promise<void>;
}

export type SessionErrorCode =
  | 'unauthenticated'
  | 'login_failed'
  | 'refresh_failed'
  | 'session_ended'
  | 'unauthorized';

const MESSAGES: Record<SessionErrorCode, string> = {
  unauthenticated: 'No hay una sesión activa.',
  login_failed: 'No fue posible iniciar sesión.',
  refresh_failed: 'La sesión expiró. Inicia sesión de nuevo.',
  session_ended: 'La sesión terminó.',
  unauthorized: 'La sesión ya no es válida.',
};

/** Errores de sesion con mensaje generico: nunca incluyen tokens ni detalles internos. */
export class SessionError extends Error {
  readonly code: SessionErrorCode;

  constructor(code: SessionErrorCode) {
    super(MESSAGES[code]);
    this.name = 'SessionError';
    this.code = code;
  }
}

export type SessionLogEntry = Readonly<Record<string, string | number>>;

export type SessionManagerOptions = Readonly<{
  gateway: AuthGateway;
  store: TokenStore;
  now?: () => number;
  expirySkewMs?: number;
  log?: (entry: SessionLogEntry) => void;
}>;

export type AuthorizedResponse = Readonly<{ status: number }>;

type EndReason = 'logout' | 'refresh_failed' | 'unauthorized';

export class SessionManager {
  private readonly gateway: AuthGateway;
  private readonly store: TokenStore;
  private readonly now: () => number;
  private readonly expirySkewMs: number;
  private readonly logSink: ((entry: SessionLogEntry) => void) | undefined;

  private state: SessionState = { status: 'anonymous' };
  private tokens: SessionTokens | null = null;
  private generation = 0;
  private sessionId = 0;
  private refreshPromise: Promise<void> | null = null;
  private requestCounter = 0;
  private refreshCount = 0;
  private events: SessionEvent[] = [];

  constructor(options: SessionManagerOptions) {
    this.gateway = options.gateway;
    this.store = options.store;
    this.now = options.now ?? (() => Date.now());
    this.expirySkewMs = options.expirySkewMs ?? 5000;
    this.logSink = options.log;
  }

  getState(): SessionState {
    return this.state;
  }

  /** Cantidad de renovaciones ejecutadas desde el ultimo inicio de sesion. */
  getRefreshCount(): number {
    return this.refreshCount;
  }

  /** Eventos de sesion sin tokens; se pueden resumir con summarizeSession. */
  getEvents(): readonly SessionEvent[] {
    return [...this.events];
  }

  async login(actorId: string): Promise<SessionState> {
    this.sessionId += 1;
    const session = this.sessionId;
    this.state = { status: 'authenticating' };
    this.tokens = null;
    this.events = [];
    this.refreshCount = 0;

    let result: LoginResult;
    try {
      result = await this.gateway.login(actorId);
    } catch {
      if (session === this.sessionId) this.state = { status: 'anonymous' };
      throw new SessionError('login_failed');
    }

    const tokens: SessionTokens = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: this.now() + result.expiresIn * 1000,
    };
    try {
      await this.store.save(tokens);
    } catch {
      if (session === this.sessionId) this.state = { status: 'anonymous' };
      await this.store.clear().catch(() => undefined);
      throw new SessionError('login_failed');
    }
    if (session !== this.sessionId) {
      await this.store.clear().catch(() => undefined);
      throw new SessionError('session_ended');
    }

    this.tokens = tokens;
    this.generation = 0;
    this.state = { status: 'authenticated', actorId: result.actorId, role: result.role };
    this.log({ event: 'login', actorId: result.actorId, role: result.role });
    return this.state;
  }

  async logout(): Promise<void> {
    await this.endSession('logout');
  }

  /**
   * Ejecuta una solicitud con el token vigente. Si el servidor responde 401 se
   * renueva la sesion UNA sola vez (compartida con las demas solicitudes) y la
   * solicitud se reintenta UNA sola vez.
   */
  async execute<T extends AuthorizedResponse>(
    send: (accessToken: string) => Promise<T>,
    requestId: string = `req-${++this.requestCounter}`,
  ): Promise<T> {
    this.requireSession();
    await this.refreshIfExpired();

    const first = this.currentAccess('unauthenticated');
    this.log({ event: 'request', requestId, generation: first.generation });
    const response = await send(first.accessToken);
    if (response.status !== 401) return response;

    this.events.push({ type: 'request401', requestId, generation: first.generation });
    this.log({ event: '401', requestId, generation: first.generation });

    if (this.generation === first.generation) {
      await this.refreshOnce();
    }

    const second = this.currentAccess('session_ended');
    this.log({ event: 'retry', requestId, generation: second.generation });
    const retry = await send(second.accessToken);
    if (retry.status === 401) {
      await this.endSession('unauthorized').catch(() => undefined);
      throw new SessionError('unauthorized');
    }
    return retry;
  }

  private requireSession(): void {
    if (this.state.status === 'anonymous' || this.state.status === 'authenticating') {
      throw new SessionError('unauthenticated');
    }
  }

  private currentAccess(code: SessionErrorCode): { accessToken: string; generation: number } {
    if (this.tokens === null || this.state.status === 'anonymous') {
      throw new SessionError(code);
    }
    return { accessToken: this.tokens.accessToken, generation: this.generation };
  }

  private async refreshIfExpired(): Promise<void> {
    if (this.tokens !== null && this.now() >= this.tokens.expiresAt - this.expirySkewMs) {
      await this.refreshOnce();
    }
  }

  /** Una sola renovacion en curso: quien llegue despues espera la misma promesa. */
  private refreshOnce(): Promise<void> {
    if (this.refreshPromise !== null) return this.refreshPromise;
    this.refreshPromise = this.doRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<void> {
    const session = this.sessionId;
    const current = this.tokens;
    if (current === null || this.state.status === 'anonymous' || this.state.status === 'authenticating') {
      throw new SessionError('unauthenticated');
    }
    this.state = { status: 'refreshing', actorId: this.state.actorId, role: this.state.role };
    this.refreshCount += 1;
    this.log({ event: 'refresh_start', generation: this.generation });

    let result: RefreshResult;
    try {
      result = await this.gateway.refresh(current.refreshToken);
    } catch {
      if (session !== this.sessionId) throw new SessionError('session_ended');
      await this.endSession('refresh_failed').catch(() => undefined);
      throw new SessionError('refresh_failed');
    }
    if (session !== this.sessionId) throw new SessionError('session_ended');

    const next: SessionTokens = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: this.now() + result.expiresIn * 1000,
    };
    try {
      await this.store.save(next);
    } catch {
      if (session === this.sessionId) await this.endSession('refresh_failed').catch(() => undefined);
      throw new SessionError('refresh_failed');
    }
    if (session !== this.sessionId) {
      // Hubo logout mientras se guardaba: no dejar tokens persistidos.
      await this.store.clear().catch(() => undefined);
      throw new SessionError('session_ended');
    }

    this.tokens = next;
    this.generation += 1;
    if (this.state.status === 'refreshing') {
      this.state = { status: 'authenticated', actorId: this.state.actorId, role: this.state.role };
    }
    this.events.push({ type: 'refreshSucceeded', generation: this.generation });
    this.log({ event: 'refresh_success', generation: this.generation });
  }

  private async endSession(reason: EndReason): Promise<void> {
    this.sessionId += 1;
    this.tokens = null;
    this.state = { status: 'anonymous' };
    this.events.push(reason === 'refresh_failed' ? { type: 'refreshFailed' } : { type: 'logout' });
    this.log({ event: 'session_ended', reason });
    await this.store.clear();
  }

  private log(entry: SessionLogEntry): void {
    this.logSink?.(entry);
  }
}