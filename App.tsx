import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { getBackendHealth } from './src/api/courseBackend';
import { createFakeIncidentRepository } from './src/infrastructure/incidents/fakeIncidentRepository';
import { listIncidents } from './src/application/listIncidents';
import { getIncidentDetail } from './src/application/getIncidentDetail';
import { IncidentListScreen } from './src/ui/screens/IncidentListScreen';
import { IncidentDetailScreen } from './src/ui/screens/IncidentDetailScreen';
import type { Incident } from './src/domain/incident';

const repository = createFakeIncidentRepository();

export default function App() {
  const [status, setStatus] = useState<'checking' | 'available' | 'offline'>('checking');
  const [incidents, setIncidents] = useState<readonly Incident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Incident | null>(null);

  useEffect(() => {
    let active = true;
    getBackendHealth()
      .then(() => active && setStatus('available'))
      .catch(() => active && setStatus('offline'));
    listIncidents(repository).then((items) => active && setIncidents(items));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    getIncidentDetail(repository, selectedId).then(setSelected);
  }, [selectedId]);

  return (
    <View style={styles.screen}>
      <View accessibilityRole="summary" style={styles.card}>
        <Text style={styles.title}>CampusOps</Text>
        <Text>Incidencias del campus · entorno académico ficticio</Text>
        <Text testID="backend-status">Backend: {status}</Text>
      </View>
      {selectedId ? (
        <IncidentDetailScreen incident={selected} />
      ) : (
        <IncidentListScreen incidents={incidents} onSelect={setSelectedId} />
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