import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { getBackendHealth } from './src/api/courseBackend';
import { canPerformAction } from './src/application/authorization';
import { availableActions } from './src/application/availableActions';
import { performIncidentAction } from './src/application/incidentActions';
import { SessionManager, type SessionState } from './src/application/session/sessionManager';
import type { Incident } from './src/domain/incident';
import type { ActionFailureReason, IncidentSnapshot } from './src/domain/incidentActions';
import { createCloudIncidentActions } from './src/infrastructure/incidents/cloudIncidentActions';
import {
  createCloudIncidentClient,
  type CloudClientError,
} from './src/infrastructure/incidents/cloudIncidentClient';
import { createHttpAuthGateway } from './src/infrastructure/session/httpAuthGateway';
import { createSecureTokenStore } from './src/infrastructure/session/secureTokenStore';
import { IncidentActionBar } from './src/ui/screens/IncidentActionBar';
import { IncidentDetailScreen } from './src/ui/screens/IncidentDetailScreen';
import { IncidentListScreen } from './src/ui/screens/IncidentListScreen';
import { LoginScreen, type LoginActor } from './src/ui/screens/LoginScreen';

const ACTORS: readonly LoginActor[] = [
  { id: 'reporter-1', label: 'Reportante (reporter-1)' },
  { id: 'technician-1', label: 'Técnico (technician-1)' },
  { id: 'coordinator-1', label: 'Coordinación (coordinator-1)' },
];

function describeError(error: CloudClientError): string {
  switch (error.kind) {
    case 'timeout':
      return 'El servidor tardó demasiado en responder.';
    case 'server_error':
      return `El servidor respondió con un error (${error.status}).`;
    case 'network_error':
      return 'No fue posible conectar con el servidor.';
    case 'invalid_payload':
      return 'El servidor devolvió datos que la app no puede usar.';
    case 'unauthorized':
      return 'La sesión expiró. Inicia sesión de nuevo.';
  }
}

function describeActionFailure(reason: ActionFailureReason): string {
  switch (reason) {
    case 'forbidden':
      return 'No tienes permiso para realizar esta acción.';
    case 'conflict':
      return 'La incidencia cambió mientras la veías. Se recargó; inténtalo de nuevo.';
    case 'rejected':
      return 'El servidor no aceptó la acción.';
    case 'unauthorized':
      return 'La sesión expiró. Inicia sesión de nuevo.';
    case 'unavailable':
      return 'No fue posible completar la acción.';
  }
}

export default function App() {
  const manager = useMemo(
    () => new SessionManager({ gateway: createHttpAuthGateway(), store: createSecureTokenStore() }),
    [],
  );
  const [backend, setBackend] = useState<'checking' | 'available' | 'offline'>('checking');
  const [session, setSession] = useState<SessionState>({ status: 'anonymous' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<readonly Incident[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<IncidentSnapshot | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const actorId =
    session.status === 'authenticated' || session.status === 'refreshing' ? session.actorId : null;
  const role =
    session.status === 'authenticated' || session.status === 'refreshing' ? session.role : null;
  const client = useMemo(
    () => (actorId === null ? null : createCloudIncidentClient(actorId, undefined, manager)),
    [actorId, manager],
  );
  const actions = useMemo(
    () => (actorId === null ? null : createCloudIncidentActions(actorId, manager)),
    [actorId, manager],
  );

  useEffect(() => {
    let active = true;
    getBackendHealth()
      .then(() => active && setBackend('available'))
      .catch(() => active && setBackend('offline'));
    return () => {
      active = false;
    };
  }, []);

  const handleFailure = useCallback(
    (error: CloudClientError) => {
      setMessage(describeError(error));
      if (error.kind === 'unauthorized') {
        // El SessionManager ya dejó la sesión cerrada y sin tokens guardados.
        setSession(manager.getState());
        setIncidents([]);
        setDetailId(null);
        setSnapshot(null);
      }
    },
    [manager],
  );

  useEffect(() => {
    if (client === null) return undefined;
    let active = true;
    client.listIncidents().then((result) => {
      if (!active) return;
      if (result.ok) {
        setIncidents(result.value);
        setMessage(null);
      } else {
        handleFailure(result.error);
      }
    });
    return () => {
      active = false;
    };
  }, [client, handleFailure]);

  useEffect(() => {
    if (actions === null || detailId === null) return undefined;
    let active = true;
    actions.getIncidentSnapshot(detailId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setSnapshot(result.value);
      } else {
        handleFailure(result.error);
      }
    });
    return () => {
      active = false;
    };
  }, [actions, detailId, handleFailure]);

  const buttons = useMemo(
    () =>
      snapshot !== null && actorId !== null && role !== null
        ? availableActions(canPerformAction, { actorId, role }, snapshot)
        : [],
    [snapshot, actorId, role],
  );

  const handleAction = useCallback(
    async (key: string) => {
      const chosen = buttons.find((button) => button.request.action === key);
      if (chosen === undefined || actions === null || actorId === null || role === null || snapshot === null) {
        return;
      }
      setActionBusy(true);
      setActionMessage(null);
      const outcome = await performIncidentAction(
        { gateway: actions, canPerform: canPerformAction },
        { actorId, role },
        snapshot,
        chosen.request,
      );
      if (outcome.ok) {
        setSnapshot(outcome.incident);
        setIncidents((current) =>
          current.map((item) =>
            item.id === outcome.incident.id ? { ...item, status: outcome.incident.status } : item,
          ),
        );
      } else if (outcome.reason === 'unauthorized') {
        handleFailure({ kind: 'unauthorized' });
      } else {
        setActionMessage(describeActionFailure(outcome.reason));
        if (outcome.reason === 'conflict') {
          const fresh = await actions.getIncidentSnapshot(snapshot.id);
          if (fresh.ok) setSnapshot(fresh.value);
        }
      }
      setActionBusy(false);
    },
    [actions, actorId, buttons, handleFailure, role, snapshot],
  );

  const handleLogin = useCallback(
    async (id: string) => {
      setBusy(true);
      setMessage(null);
      try {
        setSession(await manager.login(id));
      } catch {
        setSession(manager.getState());
        setMessage('No fue posible iniciar sesión.');
      } finally {
        setBusy(false);
      }
    },
    [manager],
  );

  const handleLogout = useCallback(async () => {
    try {
      await manager.logout();
      setMessage(null);
    } catch {
      setMessage('No se pudo cerrar la sesión de forma segura.');
    }
    setSession(manager.getState());
    setIncidents([]);
    setDetailId(null);
    setSnapshot(null);
  }, [manager]);

  return (
    <View style={styles.screen}>
      <View accessibilityRole="summary" style={styles.card}>
        <Text style={styles.title}>CampusOps</Text>
        <Text>Incidencias del campus · entorno académico ficticio</Text>
        <Text testID="backend-status">Backend: {backend}</Text>
        {actorId !== null ? (
          <View>
            <Text testID="session-actor">Sesión: {actorId}</Text>
            <Pressable onPress={handleLogout} testID="logout-button">
              <Text>Cerrar sesión</Text>
            </Pressable>
          </View>
        ) : null}
        {actorId !== null && message !== null ? <Text testID="session-message">{message}</Text> : null}
      </View>
      {client === null ? (
        <LoginScreen actors={ACTORS} busy={busy} message={message} onLogin={handleLogin} />
      ) : detailId !== null ? (
        <View>
          <Pressable
            onPress={() => {
              setDetailId(null);
              setSnapshot(null);
            }}
            testID="back-button"
          >
            <Text>Volver</Text>
          </Pressable>
          <IncidentDetailScreen incident={snapshot} />
          <IncidentActionBar
            buttons={buttons.map((button) => ({ key: button.request.action, label: button.label }))}
            busy={actionBusy}
            message={actionMessage}
            onPress={handleAction}
          />
        </View>
      ) : (
        <IncidentListScreen incidents={incidents} onSelect={setDetailId} />
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { gap: 12, padding: 20 },
  title: { fontSize: 24, fontWeight: '700' },
});