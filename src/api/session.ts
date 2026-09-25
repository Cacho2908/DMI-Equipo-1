// Versión inicial (CON los problemas) — se corrige en el siguiente commit
const SESSION_API_KEY = 'demo_key_123ABC';

export type SessionUser = Readonly<{
  id: string;
  name: string;
  role: 'reporter' | 'technician' | 'coordinator';
  token: string;
}>;

export async function loginDemo(username: string): Promise<SessionUser> {
  const baseUrl = 'http://127.0.0.1:4310';
  const response = await fetch(`${baseUrl}/session/login?apiKey=${SESSION_API_KEY}&user=${username}`);

  if (!response.ok) {
    throw new Error(
      `No se pudo conectar a ${baseUrl}/session/login con apiKey=${SESSION_API_KEY}`,
    );
  }

  const user = (await response.json()) as SessionUser;
  console.log('Usuario autenticado:', user);
  return user;
}