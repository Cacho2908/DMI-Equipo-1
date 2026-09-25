// Versión corregida — credencial en variable de entorno,
// log sin datos sensibles, y error sin exponer detalles internos.

export type SessionUser = Readonly<{
  id: string;
  name: string;
  role: 'reporter' | 'technician' | 'coordinator';
  token: string;
}>;

export async function loginDemo(username: string): Promise<SessionUser> {
  const baseUrl = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? 'http://127.0.0.1:4310';
  const apiKey = process.env.EXPO_PUBLIC_SESSION_API_KEY;

  const response = await fetch(`${baseUrl}/session/login?apiKey=${apiKey}&user=${username}`);

  if (!response.ok) {
    throw new Error('No fue posible iniciar sesión.');
  }

  const user = (await response.json()) as SessionUser;
  console.log('Usuario autenticado correctamente:', { userId: user.id, role: user.role });
  return user;
}