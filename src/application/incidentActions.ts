import type {
  ActionOutcome,
  IncidentAction,
  IncidentActionGateway,
  IncidentActionRequest,
  IncidentSnapshot,
} from '../domain/incidentActions';
import type { SessionRole } from './session/sessionManager';

export type ActorContext = Readonly<{ actorId: string; role: SessionRole }>;

export type CanPerform = (
  action: IncidentAction,
  context: Readonly<{ actorId: string; role: SessionRole; incident: IncidentSnapshot }>,
) => boolean;

/**
 * Valida el permiso en la capa de aplicacion ANTES de llamar al servidor.
 * Ocultar un boton no sustituye esta comprobacion, y el servidor vuelve a validar (403).
 */
export async function performIncidentAction(
  deps: Readonly<{ gateway: IncidentActionGateway; canPerform: CanPerform }>,
  actor: ActorContext,
  snapshot: IncidentSnapshot,
  request: IncidentActionRequest,
): Promise<ActionOutcome> {
  if (!deps.canPerform(request.action, { ...actor, incident: snapshot })) {
    return { ok: false, reason: 'forbidden' };
  }
  return deps.gateway.applyAction(snapshot, request);
}