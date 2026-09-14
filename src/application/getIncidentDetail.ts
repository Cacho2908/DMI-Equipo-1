import type { IncidentRepository } from '../domain/incident';

export function getIncidentDetail(repository: IncidentRepository, id: string) {
  return repository.getIncidentById(id);
}