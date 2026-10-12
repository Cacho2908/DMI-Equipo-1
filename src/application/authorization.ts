export type Role = 'coordinator' | 'technician' | 'reporter';
export type Action = 
  | 'assign' 
  | 'prioritize' 
  | 'close' 
  | 'reopen' 
  | 'start' 
  | 'resolve' 
  | 'create' 
  | 'comment' 
  | 'attach_evidence';

export interface Actor {
  id: string;
  role: Role;
}

export interface Incident {
  reporterId: string;
  assignedTo?: string | null;
}

/**
 * Evalúa si una incidencia es visible para un actor.
 * Los coordinadores y técnicos ven todas. Los reportantes solo ven las suyas.
 */
export function isIncidentVisible(actor: Actor, incident: Incident): boolean {
  if (actor.role === 'coordinator' || actor.role === 'technician') {
    return true;
  }
  return incident.reporterId === actor.id;
}

/**
 * Función pura que centraliza las reglas de autorización del backend.
 */
export function canPerformAction(actor: Actor, action: Action, incident?: Incident): boolean {
  // Regla: Reportante crea incidencias (no requiere un objeto incidente existente)
  if (action === 'create') {
    return actor.role === 'reporter';
  }

  // Para cualquier otra acción, se requiere la incidencia objetivo
  if (!incident) {
    return false;
  }

  // Regla: Comentar y adjuntar evidencia SOLO en incidencias visibles
  if (action === 'comment' || action === 'attach_evidence') {
    return isIncidentVisible(actor, incident);
  }

  // Reglas específicas por rol
  switch (actor.role) {
    case 'coordinator':
      // Coordinador: assign, prioritize, close, reopen
      return ['assign', 'prioritize', 'close', 'reopen'].includes(action);

    case 'technician':
      // Técnico: start y resolve SOLO en su incidencia asignada
      if (action === 'start' || action === 'resolve') {
        return incident.assignedTo === actor.id;
      }
      return false;

    case 'reporter':
      // El reportante no tiene acciones adicionales sobre una incidencia existente
      return false;

    default:
      return false;
  }
}
