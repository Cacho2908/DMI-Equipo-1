export type SessionEvent = Readonly<{
  type: 'request401' | 'refreshSucceeded' | 'refreshFailed' | 'logout';
  requestId?: string;
  generation?: number;
  token?: string;
}>;

export type SessionSummary = Readonly<{
  status: 'anonymous' | 'authenticated';
  activeGeneration: number | null;
  refreshCalls: number;
  retriedRequestIds: readonly string[];
  persistedToken: string | null;
}>;

/**
 * Reductor puro del ciclo de sesion. Reglas:
 * - Varios 401 simultaneos comparten UNA sola renovacion.
 * - Cada solicitud se reintenta como maximo una vez.
 * - Un 401 con generacion anterior a la activa ya fue cubierto por una renovacion: solo se reintenta.
 * - Si la renovacion falla o hay logout, la sesion queda anonima, sin token, sin reintentos.
 * - Estando anonima no se inicia ninguna renovacion (sin bucles) y un resultado tardio no la revive.
 */
export function summarizeSession(events: readonly SessionEvent[]): SessionSummary {
  let status = 'authenticated' as 'anonymous' | 'authenticated';
  let activeGeneration = 0 as number | null;
  let persistedToken = null as string | null;
  let refreshCalls = 0;
  let refreshing = false;
  let waiting: string[] = [];
  const retriedRequestIds: string[] = [];
  const retried = new Set<string>();

  const retryOnce = (requestId: string): void => {
    if (retried.has(requestId)) return;
    retried.add(requestId);
    retriedRequestIds.push(requestId);
  };

  const endSession = (): void => {
    status = 'anonymous';
    activeGeneration = null;
    persistedToken = null;
    refreshing = false;
    waiting = [];
  };

  for (const event of events) {
    switch (event.type) {
      case 'request401': {
        const requestId = event.requestId;
        if (status === 'anonymous' || requestId === undefined || retried.has(requestId)) break;
        const generation = event.generation ?? 0;
        if (activeGeneration !== null && generation < activeGeneration) {
          retryOnce(requestId);
          break;
        }
        if (!refreshing) {
          refreshing = true;
          refreshCalls += 1;
        }
        if (!waiting.includes(requestId)) waiting.push(requestId);
        break;
      }
      case 'refreshSucceeded': {
        if (status === 'anonymous' || !refreshing) break;
        activeGeneration = event.generation ?? (activeGeneration ?? 0) + 1;
        persistedToken = event.token ?? persistedToken;
        refreshing = false;
        for (const requestId of waiting) retryOnce(requestId);
        waiting = [];
        break;
      }
      case 'refreshFailed':
      case 'logout':
        endSession();
        break;
    }
  }

  return { status, activeGeneration, refreshCalls, retriedRequestIds, persistedToken };
}