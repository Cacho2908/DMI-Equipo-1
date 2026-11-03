import type { IncidentLocation } from '../../campusops/contracts';

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -limit && value <= limit;
}

export function selectIncidentLocation(provider: unknown, manualLabel: string): IncidentLocation {
  if (typeof provider === 'object' && provider !== null && !Array.isArray(provider)) {
    const { label, latitude, longitude } = provider as Record<string, unknown>;
    if (
      typeof label === 'string' &&
      label.trim().length > 0 &&
      isCoordinate(latitude, 90) &&
      isCoordinate(longitude, 180)
    ) {
      return { source: 'provider', label, latitude, longitude };
    }
  }
  return { source: 'manual', label: manualLabel };
}