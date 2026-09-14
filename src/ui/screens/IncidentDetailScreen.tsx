import { Text, View } from 'react-native';
import type { Incident } from '../../domain/incident';

type Props = { incident: Incident | null };

export function IncidentDetailScreen({ incident }: Props) {
  if (!incident) return <Text>No encontrada</Text>;
  return (
    <View testID="incident-detail">
      <Text style={{ fontSize: 18, fontWeight: '600' }}>{incident.title}</Text>
      <Text>Categoría: {incident.category}</Text>
      <Text>Estado: {incident.status}</Text>
    </View>
  );
}