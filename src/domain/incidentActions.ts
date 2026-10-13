import type { Incident } from './incident';

export type IncidentAction =
  | 'assign'
  | 'prioritize'
  | 'start'
  | 'resolve'
  | 'close'
  | 'reopen'
  | 'comment'
  | 'add_evidence';

/** Incidencia con lo necesario para decidir permisos y enviar acciones al servidor. */
export type IncidentSnapshot = Readonly<
  Incident & {
    version: number;
    assignedTechnicianId: string | null;
  }
>;

/** Acciones que la app ofrece esta semana. */
export type IncidentActionRequest =
  | Readonly<{ action: 'start' }>
  | Readonly<{ action: 'resolve'; diagnosis: string }>
  | Readonly<{ action: 'close' }>
  | Readonly<{ action: 'reopen' }>;

export type ActionFailureReason = 'forbidden' | 'conflict' | 'rejected' | 'unauthorized' | 'unavailable';

export type ActionOutcome =
  | Readonly<{ ok: true; incident: IncidentSnapshot }>
  | Readonly<{ ok: false; reason: ActionFailureReason }>;

/** Contrato que necesita la aplicacion; lo implementa infraestructura. */
export interface IncidentActionGateway {
  applyAction(snapshot: IncidentSnapshot, request: IncidentActionRequest): Promise<ActionOutcome>;
}