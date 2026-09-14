import type { IncidentRepository } from '../domain/incident';

export function listIncidents(repository: IncidentRepository) {
  return repository.listIncidents();
}