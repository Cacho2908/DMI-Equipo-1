import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { randomUUID } from 'expo-crypto';
import { getBackendHealth } from './src/api/courseBackend';
import { canPerformAction } from './src/application/authorization';
import { availableActions } from './src/application/availableActions';
import { SessionManager, type SessionState } from './src/application/session/sessionManager';
import { createOfflineSync } from './src/application/sync/offlineSync';
import type { IncidentSnapshot } from './src/domain/incidentActions';
import type { PendingOperation, OfflineRequest } from './src/domain/offline';
import { createCloudIncidentActions } from './src/infrastructure/incidents/cloudIncidentActions';
import { createCloudIncidentClient } from './src/infrastructure/incidents/cloudIncidentClient';
import { createOfflineSyncGateway } from './src/infrastructure/incidents/offlineSyncGateway';
import { createSqliteOfflineStore } from './src/infrastructure/persistence/sqliteOfflineStore';
import { createHttpAuthGateway } from './src/infrastructure/session/httpAuthGateway';
import { createSecureTokenStore } from './src/infrastructure/session/secureTokenStore';
import { IncidentActionBar } from './src/ui/screens/IncidentActionBar';
import { IncidentDetailScreen } from './src/ui/screens/IncidentDetailScreen';
import { IncidentListScreen } from './src/ui/screens/IncidentListScreen';
import { LoginScreen, type LoginActor } from './src/ui/screens/LoginScreen';

const ACTORS: readonly LoginActor[] = [
  { id: 'reporter-1', label: 'Reportante (reporter-1)' },
  { id: 'technician-1', label: 'Técnico (technician-1)' },
  { id: 'technician-2', label: 'Técnico (technician-2)' },
  { id: 'coordinator-1', label: 'Coordinación (coordinator-1)' },
];

export default function App() {
  const manager = useMemo(() => new SessionManager({ gateway: createHttpAuthGateway(), store: createSecureTokenStore() }), []);
  const store = useMemo(() => createSqliteOfflineStore(), []);
  const [backend, setBackend] = useState('checking');
  const [session, setSession] = useState<SessionState>({ status: 'anonymous' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<readonly IncidentSnapshot[]>([]);
  const [pending, setPending] = useState<readonly PendingOperation[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const [offline, setOffline] = useState(false);
  const actorId = session.status === 'authenticated' || session.status === 'refreshing' ? session.actorId : null;
  const sync = useMemo(() => actorId === null ? null : createOfflineSync({
    store, gateway: createOfflineSyncGateway(actorId, manager), newId: randomUUID,
    session: () => {
      const state = manager.getState();
      return state.status === 'authenticated' || state.status === 'refreshing'
        ? { actor: { actorId: state.actorId, role: state.role }, revision: manager.getSessionRevision() } : null;
    },
  }), [actorId, manager, store]);
  const isCurrent = useCallback((actor: string, revision: number) => {
    const state = manager.getState();
    return (state.status === 'authenticated' || state.status === 'refreshing') && state.actorId === actor && manager.getSessionRevision() === revision;
  }, [manager]);
  const reloadLocal = useCallback(async (actor: string, revision: number) => {
    const [cached, operations] = await Promise.all([store.listCached(actor), store.listPending(actor)]);
    if (isCurrent(actor, revision)) { setIncidents(cached); setPending(operations); }
  }, [store, isCurrent]);
  useEffect(() => {
    let active = true;
    getBackendHealth().then(() => { if (active) setBackend('available'); }).catch(() => { if (active) setBackend('offline'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!actorId) return;
    let active = true;
    const revision = manager.getSessionRevision();
    void (async () => {
      try {
        await store.initialize();
        await reloadLocal(actorId, revision);
        if (offline || !active || !isCurrent(actorId, revision)) return;
        const client = createCloudIncidentClient(actorId, undefined, manager);
        const actions = createCloudIncidentActions(actorId, manager);
        const list = await client.listIncidents();
        if (!list.ok) {
          if (active && isCurrent(actorId, revision)) setMessage('Sin datos remotos. Se conserva la información local.');
          return;
        }
        for (const item of list.value) {
          if (!active || !isCurrent(actorId, revision)) return;
          const remote = await actions.getIncidentSnapshot(item.id);
          if (remote.ok && remote.value && active && isCurrent(actorId, revision)) await store.saveRemote(actorId, remote.value);
        }
        if (active) await reloadLocal(actorId, revision);
      } catch {
        if (active && isCurrent(actorId, revision)) setMessage('No se pudo abrir o actualizar el almacenamiento local.');
      } finally {
        if (active && manager.getState().status === 'anonymous') { setSession(manager.getState()); setPending([]); setIncidents([]); setDetailId(null); setNote(''); setEvidenceId(''); }
      }
    })();
    return () => { active = false; };
  }, [actorId, offline, manager, store, reloadLocal, isCurrent]);
  const operation = pending.find(op => op.incidentId === detailId);
  const cached = incidents.find(item => item.id === detailId) ?? null;
  const snapshot = operation?.status === 'pending' ? operation.local : cached;
  const role = session.status === 'authenticated' || session.status === 'refreshing' ? session.role : null;
  const buttons = snapshot && actorId && role && !operation ? availableActions(canPerformAction, { actorId, role }, snapshot) : [];
  async function enqueue(request: OfflineRequest) {
    if (!sync || !snapshot || !actorId) return;
    const actor = actorId, revision = manager.getSessionRevision();
    setBusy(true);
    try {
      await sync.enqueue(snapshot, request, note);
      await reloadLocal(actor, revision);
      if (isCurrent(actor, revision)) { setMessage('Cambio guardado. Pendiente de sincronizar.'); setNote(''); setEvidenceId(''); }
    } catch {
      if (isCurrent(actor, revision)) setMessage('No se guardó el cambio. Revisa permisos, contenido o pendientes existentes.');
    } finally { if (isCurrent(actor, revision)) setBusy(false); }
  }
  async function synchronize() {
    if (!sync || !actorId || offline) return;
    const actor = actorId, revision = manager.getSessionRevision();
    setBusy(true);
    try {
      await sync.synchronize();
      await reloadLocal(actor, revision);
      if (isCurrent(actor, revision)) setMessage('Sincronización terminada. Revisa los pendientes y conflictos.');
    } catch {
      if (isCurrent(actor, revision)) setMessage('No se completó la sincronización. Los pendientes se conservan.');
    } finally {
      if (isCurrent(actor, revision)) setBusy(false);
      if (manager.getState().status === 'anonymous') {
        setSession(manager.getState()); setPending([]); setIncidents([]); setDetailId(null); setBusy(false);
      }
    }
  }
  async function login(id: string) {
    setBusy(true); setMessage(null); setPending([]); setIncidents([]); setDetailId(null); setNote(''); setEvidenceId('');
    try { setSession(await manager.login(id)); }
    catch { setSession(manager.getState()); setMessage('No fue posible iniciar sesión.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    // Hide data immediately; revision changes before any token-store await.
    setPending([]); setIncidents([]); setDetailId(null); setNote(''); setEvidenceId(''); setMessage(null); setBusy(false);
    try { await manager.logout(); } catch { setMessage('No se pudo limpiar el almacén seguro.'); }
    setSession(manager.getState());
  }
  async function archive(op: PendingOperation) {
    const revision = manager.getSessionRevision();
    setBusy(true);
    try {
      await store.archiveResolution(op.actorId, op.operationId, 'El usuario acepta no aplicar esta intención; se conserva archivada para revisión.');
      await reloadLocal(op.actorId, revision);
      if (isCurrent(op.actorId, revision)) setMessage('Intención archivada sin aplicarla. Su contenido se conserva.');
    } catch { if (isCurrent(op.actorId, revision)) setMessage('No se pudo archivar. La intención se conserva.'); }
    finally { if (isCurrent(op.actorId, revision)) setBusy(false); }
  }
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View accessibilityRole="summary" style={styles.card}>
        <Text style={styles.title}>CampusOps</Text>
        <Text>Incidencias del campus · entorno académico ficticio</Text>
        <Text testID="backend-status">Backend: {backend}</Text>
        {actorId ? <View>
          <Text testID="session-actor">Sesión: {actorId}</Text>
          <Pressable onPress={logout} testID="logout-button"><Text>Cerrar sesión</Text></Pressable>
        </View> : null}
      </View>
      {actorId === null ? <LoginScreen actors={ACTORS} busy={busy} message={message} onLogin={login} /> : <View style={styles.card}>
        <Pressable disabled={busy} onPress={() => setOffline(!offline)} testID="offline-toggle"><Text>{offline ? 'Modo de prueba sin conexión: activo' : 'Modo conectado · pulsar para trabajar sin conexión'}</Text></Pressable>
        <Text>El modo de prueba pausa las consultas y los envíos. Prueba también desconectando la red del dispositivo.</Text>
        <Pressable disabled={busy || offline} onPress={synchronize} testID="sync-button"><Text>{busy ? 'Procesando…' : 'Sincronizar'}</Text></Pressable>
        {message ? <Text testID="session-message">{message}</Text> : null}
        <Text>Pendientes de tu sesión: {pending.length}</Text>
        {pending.map(op => <View key={op.operationId} style={styles.pending}>
          <Text>{op.incidentId} · {op.request.action} · {op.status === 'pending' ? 'Pendiente' : op.status === 'conflict' ? 'Conflicto' : 'Bloqueada'}</Text>
          {op.note ? <Text>Nota local conservada: {op.note}</Text> : null}
          {op.request.action === 'comment' ? <Text>Comentario pendiente: {op.request.text}</Text> : null}
          {op.request.action === 'add_evidence' ? <Text>Referencia sintética pendiente: {op.request.evidenceId}. No acredita una fotografía subida.</Text> : null}
          {op.lastErrorCode ? <Text>{op.lastErrorCode === 'forbidden' ? 'El servidor rechazó el permiso. La intención local sigue guardada.' : 'La operación requiere revisión o un nuevo intento.'} {op.conflictFields.join(', ')}</Text> : null}
          {op.status !== 'pending' ? <Pressable disabled={busy} onPress={() => archive(op)}><Text>Resolver: aceptar no aplicar y conservar en archivo</Text></Pressable> : null}
        </View>)}
        {detailId !== null ? <View>
          <Pressable onPress={() => { setDetailId(null); setNote(''); setEvidenceId(''); }} testID="back-button"><Text>Volver</Text></Pressable>
          <IncidentDetailScreen incident={snapshot} />
          <TextInput accessibilityLabel="Nota o comentario" value={note} onChangeText={setNote} placeholder="Nota local o comentario ficticio" />
          <IncidentActionBar buttons={buttons.map(b => ({ key: b.request.action, label: b.label }))} busy={busy} message={null}
            onPress={key => { const button = buttons.find(b => b.request.action === key); if (button) void enqueue(button.request); }} />
          {!operation && snapshot && role && canPerformAction('comment', { actorId, role, incident: snapshot }) ? <View>
            <Pressable disabled={busy || !note.trim()} onPress={() => enqueue({ action: 'comment', text: note })}><Text>Guardar comentario pendiente</Text></Pressable>
            <TextInput accessibilityLabel="Referencia de evidencia sintética" value={evidenceId} onChangeText={setEvidenceId} placeholder="ID de recurso sintético" />
            <Pressable disabled={busy || !evidenceId.trim()} onPress={() => enqueue({ action: 'add_evidence', evidenceId })}><Text>Guardar referencia pendiente</Text></Pressable>
          </View> : null}
        </View> : <IncidentListScreen incidents={incidents.map(item => pending.find(op => op.incidentId === item.id && op.status === 'pending')?.local ?? item)} onSelect={setDetailId} />}
      </View>}
      <StatusBar style="auto" />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 24 }, card: { gap: 12, padding: 20 }, title: { fontSize: 24, fontWeight: '700' },
  pending: { padding: 12, gap: 8, borderWidth: 1, borderColor: '#777' },
});
