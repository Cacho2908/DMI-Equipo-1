import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { getBackendHealth } from './src/api/courseBackend';
import { SessionManager, type SessionState } from './src/application/session/sessionManager';
import type { Incident } from './src/domain/incident';
import {
  createCloudIncidentClient,
  type CloudClientError,
} from './src/infrastructure/incidents/cloudIncidentClient';
import { createHttpAuthGateway } from './src/infrastructure/session/httpAuthGateway';
import { createSecureTokenStore } from './src/infrastructure/session/secureTokenStore';
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
  const [selected, setSelected] = useState<Incident | null>(null);

  const actorId =
    session.status === 'authenticated' || session.status === 'refreshing' ? session.actorId : null;
  const client = useMemo(
    () => (actorId === null ? null : createCloudIncidentClient(actorId, undefined, manager)),
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
        setSelected(null);
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
    if (client === null || detailId === null) return undefined;
    let active = true;
    client.getIncidentById(detailId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setSelected(result.value);
      } else {
        handleFailure(result.error);
      }
    });
    return () => {
      active = false;
    };
  }, [client, detailId, handleFailure]);

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
    setSelected(null);
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
              setSelected(null);
            }}
            testID="back-button"
          >
            <Text>Volver</Text>
          </Pressable>
          <IncidentDetailScreen incident={selected} />
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