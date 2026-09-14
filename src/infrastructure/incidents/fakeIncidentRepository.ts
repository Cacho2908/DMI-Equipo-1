import type { Incident, IncidentRepository } from '../../domain/incident';

const FAKE_INCIDENTS: readonly Incident[] = [
  { id: 'campus-inc-001', title: 'Fuga de agua en laboratorio B', category: 'water', status: 'assigned', reporterId: 'reporter-1' },
  { id: 'campus-inc-002', title: 'Falla eléctrica edificio C', category: 'electrical', status: 'open', reporterId: 'reporter-2' },
  { id: 'campus-inc-003', title: 'Sin conectividad en biblioteca', category: 'connectivity', status: 'in_progress', reporterId: 'reporter-1' },
];

export function createFakeIncidentRepository(): IncidentRepository {
  return {
    async listIncidents() {
      return FAKE_INCIDENTS;
    },
    async getIncidentById(id: string) {
      return FAKE_INCIDENTS.find((incident) => incident.id === id) ?? null;
    },
  };
}