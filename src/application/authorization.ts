import type { IncidentAction } from '../domain/incidentActions';
import type { SessionRole } from './session/sessionManager';

export type AuthorizationContext = Readonly<{
  actorId: string;
  role: SessionRole;
  incident: Readonly<{ reporterId: string; assignedTechnicianId: string | null }>;
}>;

export function canPerformAction(action: IncidentAction, ctx: AuthorizationContext): boolean {
  const { actorId, role, incident } = ctx;

  // 1. Determinar la visibilidad de la incidencia
  let isVisible = false;
  if (role === 'coordinator') {
    isVisible = true;
  } else if (role === 'reporter' && incident.reporterId === actorId) {
    isVisible = true;
  } else if (role === 'technician' && incident.assignedTechnicianId === actorId) {
    isVisible = true;
  }

  // 2. Evaluar permisos según la acción
  switch (action) {
    case 'assign':
    case 'prioritize':
    case 'close':
    case 'reopen':
      return role === 'coordinator';

    case 'start':
    case 'resolve':
      return role === 'technician' && incident.assignedTechnicianId === actorId;

    case 'comment':
    case 'add_evidence':
      return isVisible;

    default:
      return false;
  }
}