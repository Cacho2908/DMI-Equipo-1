import { Pressable, Text, View } from 'react-native';

export type ActionButton = Readonly<{ key: string; label: string }>;

type Props = {
  buttons: readonly ActionButton[];
  busy: boolean;
  message: string | null;
  onPress: (key: string) => void;
};

export function IncidentActionBar({ buttons, busy, message, onPress }: Props) {
  return (
    <View testID="incident-actions">
      {buttons.map((button) => (
        <Pressable key={button.key} disabled={busy} onPress={() => onPress(button.key)} testID={`action-${button.key}`}>
          <Text>{button.label}</Text>
        </Pressable>
      ))}
      {message !== null ? <Text testID="action-message">{message}</Text> : null}
    </View>
  );
}