import * as SecureStore from 'expo-secure-store';

const SESSION_TOKEN_KEY = 'campusops.session.token';

/**
 * Guarda el token de sesión usando almacenamiento cifrado del sistema
 * (Keychain en iOS, Keystore en Android), nunca en texto plano ni en
 * AsyncStorage.
 */
export async function saveSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

export async function getSessionToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  } catch {
    // No exponemos el motivo real del fallo (podría incluir detalles
    // del almacén seguro del dispositivo); solo indicamos ausencia.
    return null;
  }
}

export async function clearSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}