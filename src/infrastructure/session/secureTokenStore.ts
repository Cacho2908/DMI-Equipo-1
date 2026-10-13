import type { SessionTokens, TokenStore } from '../../application/session/sessionManager';
import {
  clearRefreshToken,
  clearSessionToken,
  saveRefreshToken,
  saveSessionToken,
} from './secureSessionStore';

/** Guarda access y refresh token en el almacen seguro del dispositivo. */
export function createSecureTokenStore(): TokenStore {
  return {
    async save(tokens: SessionTokens): Promise<void> {
      await saveSessionToken(tokens.accessToken);
      await saveRefreshToken(tokens.refreshToken);
    },
    async clear(): Promise<void> {
      const results = await Promise.allSettled([clearSessionToken(), clearRefreshToken()]);
      if (results.some((result) => result.status === 'rejected')) {
        throw new Error('No se pudo cerrar la sesión de forma segura');
      }
    },
  };
}