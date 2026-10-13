import { Pressable, Text, View } from 'react-native';

export type LoginActor = Readonly<{ id: string; label: string }>;

type Props = {
  actors: readonly LoginActor[];
  busy: boolean;
  message: string | null;
  onLogin: (actorId: string) => void;
};

export function LoginScreen({ actors, busy, message, onLogin }: Props) {
  return (
    <View testID="login-screen">
      <Text style={{ fontSize: 18, fontWeight: '600' }}>Iniciar sesión</Text>
      <Text>Selector de actor de prueba: no es autenticación de producción.</Text>
      {actors.map((actor) => (
        <Pressable key={actor.id} disabled={busy} onPress={() => onLogin(actor.id)} testID={`login-${actor.id}`}>
          <Text>{actor.label}</Text>
        </Pressable>
      ))}
      {message !== null ? <Text testID="session-message">{message}</Text> : null}
    </View>
  );
}