import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { IncidentCategory, IncidentLocation } from '../../campusops/contracts';
import type { Incident } from '../../domain/incident';
import type { CloudClientError, CloudResult } from '../../infrastructure/incidents/cloudIncidentClient';
import { IncidentLocationPicker, type LocationSearch } from './IncidentLocationPicker';

export type CreateInput = Readonly<{
  category: IncidentCategory;
  description: string;
  location: string;
}>;

export type CreateIncident = (
  input: CreateInput,
  options: Readonly<{ operationId: string }>,
) => Promise<CloudResult<Incident>>;

const CATEGORIES: readonly Readonly<{ value: IncidentCategory; label: string }>[] = [
  { value: 'electrical', label: 'Eléctrica' },
  { value: 'laboratory', label: 'Laboratorio' },
  { value: 'water', label: 'Agua' },
  { value: 'connectivity', label: 'Conectividad' },
  { value: 'equipment', label: 'Equipo' },
  { value: 'safety', label: 'Seguridad' },
  { value: 'maintenance', label: 'Mantenimiento' },
];

function describeError(error: CloudClientError): string {
  switch (error.kind) {
    case 'timeout':
    case 'network_error':
      return 'No se pudo confirmar la respuesta del servidor y el reporte pudo haberse guardado. Si pulsas Crear reporte otra vez con los mismos datos, se reenviará con la misma clave de operación.';
    case 'server_error':
      return `El servidor no aceptó la solicitud (código ${error.status}). Revisa los datos e inténtalo de nuevo.`;
    case 'invalid_payload':
      return 'La respuesta del servidor no tiene el formato esperado.';
    case 'unauthorized':
      return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.';
  }
}

type Props = Readonly<{
  search: LocationSearch;
  create: CreateIncident;
  newId: () => string;
}>;

export function IncidentReportForm({ search, create, newId }: Props) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IncidentCategory | null>(null);
  const [label, setLabel] = useState('');
  const [selection, setSelection] = useState<IncidentLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const draft = useRef<Readonly<{ key: string; operationId: string }> | null>(null);
  const inFlight = useRef(false);

  async function submit() {
    const text = label.trim();
    const details = description.trim();
    if (inFlight.current || category === null || details.length === 0 || text.length === 0) return;

    // La ubicación manual siempre alcanza: el proveedor solo la mejora.
    const input: CreateInput = { category, description: details, location: selection?.label ?? text };
    const key = JSON.stringify(input);
    // Mismo contenido que un envío anterior: misma operationId. Contenido distinto: operación nueva.
    const existing = draft.current;
    const current = existing !== null && existing.key === key ? existing : { key, operationId: newId() };
    draft.current = current;

    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    let result: CloudResult<Incident>;
    try {
      result = await create(input, { operationId: current.operationId });
    } catch {
      result = { ok: false, error: { kind: 'network_error' } };
    }
    inFlight.current = false;
    setBusy(false);
    if (result.ok) {
      draft.current = null;
      setDescription('');
      setCategory(null);
      setLabel('');
      setSelection(null);
      setEpoch((n) => n + 1);
      setMessage(`Reporte creado: ${result.value.id}`);
    } else {
      setMessage(describeError(result.error));
    }
  }

  return (
    <View testID="report-form" style={{ gap: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>Nuevo reporte</Text>
      <TextInput
        accessibilityLabel="Descripción del reporte"
        testID="description-input"
        value={description}
        onChangeText={setDescription}
        placeholder="Describe el problema (datos ficticios)"
        editable={!busy}
        style={{ borderWidth: 1, borderColor: '#777', padding: 8 }}
      />
      <View style={{ gap: 4 }}>
        {CATEGORIES.map((item) => (
          <Pressable
            key={item.value}
            disabled={busy}
            onPress={() => setCategory(item.value)}
            testID={`category-${item.value}`}
            accessibilityState={{ selected: category === item.value }}
          >
            <Text>{`${category === item.value ? '● ' : '○ '}${item.label}`}</Text>
          </Pressable>
        ))}
      </View>
      <IncidentLocationPicker
        key={epoch}
        search={search}
        label={label}
        onLabelChange={setLabel}
        onSelection={setSelection}
        disabled={busy}
      />
      <Pressable
        disabled={busy}
        onPress={() => {
          void submit();
        }}
        testID="submit-button"
      >
        <Text>{busy ? 'Creando…' : 'Crear reporte'}</Text>
      </Pressable>
      {message !== null ? <Text testID="form-message">{message}</Text> : null}
    </View>
  );
}