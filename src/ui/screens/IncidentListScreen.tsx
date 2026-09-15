import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Incident } from '../../domain/incident';

type Props = {
  incidents: readonly Incident[];
  onSelect: (id: string) => void;
};


export function IncidentListScreen({ incidents, onSelect }: Props) {
  return (
    <ScrollView>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>Incidencias</Text>
      {incidents.map((item) => (
        <Pressable key={item.id} onPress={() => onSelect(item.id)} testID={`incident-${item.id}`}>
          <View>
            <Text>{item.title}</Text>
            <Text>{item.status}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}