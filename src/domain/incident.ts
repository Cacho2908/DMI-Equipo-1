import type { IncidentCategory, IncidentStatus } from '../campusops/contracts';

export type Incident = Readonly<{
  id: string;
  title: string;
  category: IncidentCategory;
  status: IncidentStatus;
  reporterId: string;
}>;

/** Contrato que "aplicación" necesita; "infraestructura" lo implementa. */
export interface IncidentRepository {
  listIncidents(): Promise<readonly Incident[]>;
  getIncidentById(id: string): Promise<Incident | null>;
}