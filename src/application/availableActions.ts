import type { IncidentActionRequest, IncidentSnapshot } from '../domain/incidentActions';
import type { ActorContext, CanPerform } from './incidentActions';

/** Dato ficticio: esta version de la app todavia no pide el diagnostico al usuario. */
export const DIAGNOSIS_PLACEHOLDER = 'Diagnóstico registrado desde la app (dato ficticio)';

export type AvailableAction = Readonly<{ request: IncidentActionRequest; label: string }>;

type Candidate = Readonly<{
  request: IncidentActionRequest;
  label: string;
  statuses: readonly string[];
}>;

// Transiciones validas del backend: start (assigned), resolve (in_progress),
// close (resolved), reopen (resolved o closed).
const CANDIDATES: readonly Candidate[] = [
  { request: { action: 'start' }, label: 'Iniciar atención', statuses: ['assigned'] },
  {
    request: { action: 'resolve', diagnosis: DIAGNOSIS_PLACEHOLDER },
    label: 'Marcar como resuelta',
    statuses: ['in_progress'],
  },
  { request: { action: 'close' }, label: 'Cerrar incidencia', statuses: ['resolved'] },
  { request: { action: 'reopen' }, label: 'Reabrir incidencia', statuses: ['resolved', 'closed'] },
];

/** Acciones que se ofrecen: estado compatible Y permiso del actor (la UI solo muestra lo que ya se validó). */
export function availableActions(
  canPerform: CanPerform,
  actor: ActorContext,
  snapshot: IncidentSnapshot,
): readonly AvailableAction[] {
  return CANDIDATES.filter(
    (candidate) =>
      candidate.statuses.includes(snapshot.status) &&
      canPerform(candidate.request.action, { ...actor, incident: snapshot }),
  ).map(({ request, label }) => ({ request, label }));
}