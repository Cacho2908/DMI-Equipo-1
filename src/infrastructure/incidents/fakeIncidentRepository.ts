import type { Incident, IncidentRepository } from '../../domain/incident';
import { FAKE_INCIDENTS } from './incidentsData';

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