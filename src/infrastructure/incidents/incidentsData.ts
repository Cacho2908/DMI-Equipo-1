import type { Incident } from '../../domain/incident';

export const FAKE_INCIDENTS: readonly Incident[] = [
  { id: 'campus-inc-001', title: 'Fuga de agua en laboratorio B', category: 'water', status: 'assigned', reporterId: 'reporter-1' },
  { id: 'campus-inc-002', title: 'Falla eléctrica edificio C', category: 'electrical', status: 'open', reporterId: 'reporter-2' },
  { id: 'campus-inc-003', title: 'Sin conectividad en biblioteca', category: 'connectivity', status: 'in_progress', reporterId: 'reporter-1' },
];