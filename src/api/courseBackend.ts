export type BackendHealth = Readonly<{
  ok: true;
  service: 'dmi-controlled-backend';
  contractVersion: 1;
}>;

export async function getBackendHealth(
  baseUrl = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL,
): Promise<BackendHealth> {
  
  if (!baseUrl) {
    throw new Error('Configuración del servicio no disponible.');
  }

  const response = await fetch(`${baseUrl}/health`);
  if (!response.ok) {
    throw new Error('No fue posible conectar con el servicio.');
  }
  const payload: unknown = await response.json();
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('ok' in payload) ||
    payload.ok !== true ||
    !('contractVersion' in payload) ||
    payload.contractVersion !== 1
  ) {
    throw new Error('Backend health contract mismatch');
  }
  return payload as BackendHealth;
}
