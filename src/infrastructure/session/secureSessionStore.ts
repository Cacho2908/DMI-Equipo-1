import * as SecureStore from 'expo-secure-store';

const SESSION_TOKEN_KEY = 'campusops.session.token';

/**
 * Guarda el token de sesión usando almacenamiento cifrado del sistema
 * (Keychain en iOS, Keystore en Android), nunca en texto plano ni en
 * AsyncStorage.
 */
export async function saveSessionToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
  } catch {
    // Mensaje genérico: el error original del almacén podría incluir
    // detalles internos o el valor que se intentaba guardar.
    throw new Error('No se pudo guardar la sesión de forma segura');
  }
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
  try {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  } catch {
    throw new Error('No se pudo cerrar la sesión de forma segura');
  }
}

const REFRESH_TOKEN_KEY = 'campusops.session.refresh';

export async function saveRefreshToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } catch {
    throw new Error('No se pudo guardar la sesión de forma segura');
  }
}

export async function clearRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    throw new Error('No se pudo cerrar la sesión de forma segura');
  }
}