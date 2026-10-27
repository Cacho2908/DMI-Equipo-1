import { render, fireEvent, waitFor } from '@testing-library/react-native';
import App from '../../App';

import type { PendingOperation, OfflineStore } from '../../src/domain/offline';
import type { IncidentSnapshot } from '../../src/domain/incidentActions';

// El primer render de React Native puede cargar módulos nativos simulados en frío.
jest.setTimeout(30000);


const mockSnapshot: IncidentSnapshot = { id: 'campus-inc-001', version: 1, title: 'Falla ficticia', category: 'electrical', reporterId: 'reporter-1', assignedTechnicianId: 'technician-1', status: 'assigned' };
let mockOperations: PendingOperation[] = [];
let mockCached: IncidentSnapshot[] = [];
const mockStore: OfflineStore = {
  initialize: async () => {},
  saveRemote: async (_actor, incident) => { mockCached = [incident]; },
  listCached: async () => mockCached,
  enqueue: async op => { mockOperations.push(op); },
  listPending: async actor => mockOperations.filter(op => op.actorId === actor),
  mark: async (actor, id, status, fields, code) => { mockOperations = mockOperations.map(op => op.actorId === actor && op.operationId === id ? { ...op, status, conflictFields: fields, lastErrorCode: code } : op); },
  confirm: async (actor, id, incident) => { mockOperations = mockOperations.filter(op => op.actorId !== actor || op.operationId !== id); mockCached = [incident]; },
  archiveResolution: async (actor, id) => { mockOperations = mockOperations.filter(op => op.actorId !== actor || op.operationId !== id); },
};
const mockSend = jest.fn(async () => ({ kind: 'confirmed', incident: { ...mockSnapshot, version: 2, status: 'in_progress' } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'ui-operation-0001' }));
jest.mock('../../src/infrastructure/persistence/sqliteOfflineStore', () => ({ createSqliteOfflineStore: () => mockStore }));
jest.mock('../../src/infrastructure/incidents/offlineSyncGateway', () => ({ createOfflineSyncGateway: () => ({ send: mockSend, read: async () => mockSnapshot }) }));
jest.mock('../../src/api/courseBackend', () => ({ getBackendHealth: async () => ({ ok: true }) }));
jest.mock('../../src/infrastructure/session/secureTokenStore', () => ({ createSecureTokenStore: () => ({ save: async () => {}, clear: async () => {} }) }));
jest.mock('../../src/infrastructure/session/httpAuthGateway', () => ({ createHttpAuthGateway: () => ({
  login: async (actorId: string) => ({ actorId, role: 'technician', accessToken: 'fixture', refreshToken: 'fixture', expiresIn: 3600 }),
}) }));
jest.mock('../../src/infrastructure/incidents/cloudIncidentClient', () => ({ createCloudIncidentClient: () => ({ listIncidents: async () => ({ ok: true, value: [mockSnapshot] }) }) }));
jest.mock('../../src/infrastructure/incidents/cloudIncidentActions', () => ({ createCloudIncidentActions: () => ({ getIncidentSnapshot: async () => ({ ok: true, value: mockSnapshot }) }) }));
beforeEach(() => { mockOperations = []; mockCached = []; mockSend.mockClear(); });
async function login(view: Awaited<ReturnType<typeof render>>) {
  await fireEvent.press(view.getByText('Técnico (technician-1)'));
  await waitFor(() => expect(view.getByText('Falla ficticia')).toBeTruthy());
}
test('UI queues a local action without sending, shows note and explicitly synchronizes', async () => {
  const view = await render(<App />);
  await login(view);
  await fireEvent.press(view.getByTestId('incident-campus-inc-001'));
  await fireEvent.changeText(await view.findByLabelText('Nota o comentario'), 'Nota recuperable');
  await fireEvent.press(view.getByText('Iniciar atención'));
  await waitFor(() => expect(view.getByText('Nota local conservada: Nota recuperable')).toBeTruthy());
  expect(mockSend).not.toHaveBeenCalled();
  expect(mockOperations[0]?.operationId).toBe('ui-operation-0001');
  await fireEvent.press(view.getByTestId('sync-button'));
  await waitFor(() => expect(view.getByText('Pendientes de tu sesión: 0')).toBeTruthy());
  expect(mockSend).toHaveBeenCalledTimes(1);
});
test('UI reload recovers existing pending and logout hides private note', async () => {
  const first = await render(<App />);
  await login(first);
  await fireEvent.press(first.getByTestId('incident-campus-inc-001'));
  await fireEvent.changeText(await first.findByLabelText('Nota o comentario'), 'Privada de la sesión');
  await fireEvent.press(first.getByText('Iniciar atención'));
  await waitFor(() => expect(mockOperations.length).toBe(1));
  await first.unmount();
  const reopened = await render(<App />);
  await login(reopened);
  await waitFor(() => expect(reopened.getByText('Nota local conservada: Privada de la sesión')).toBeTruthy());
  await fireEvent.press(reopened.getByTestId('logout-button'));
  await waitFor(() => expect(reopened.queryByText('Nota local conservada: Privada de la sesión')).toBeNull());
  expect(mockOperations.length).toBe(1);
});
