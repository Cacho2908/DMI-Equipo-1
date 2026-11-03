import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { IncidentLocation } from '../../campusops/contracts';

export type LocationSearch = Readonly<{
  select: (query: string, manualLabel: string) => Promise<IncidentLocation>;
}>;

type Props = Readonly<{
  search: LocationSearch;
  label: string;
  onLabelChange: (text: string) => void;
  onSelection: (selection: IncidentLocation | null) => void;
  disabled: boolean;
}>;

export function IncidentLocationPicker({ search, label, onLabelChange, onSelection, disabled }: Props) {
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [found, setFound] = useState<IncidentLocation | null>(null);
  const latest = useRef(0);
  const text = label.trim();

  function edit(next: string) {
    latest.current += 1; // cualquier búsqueda en curso queda obsoleta
    setSearching(false);
    setSearched(false);
    setFound(null);
    onSelection(null);
    onLabelChange(next);
  }

  async function runSearch() {
    if (text.length === 0 || searching || disabled) return;
    latest.current += 1;
    const mine = latest.current;
    setSearching(true);
    let result: IncidentLocation;
    try {
      result = await search.select(text, text);
    } catch {
      result = { source: 'manual', label: text };
    }
    if (mine !== latest.current) return; // se editó el texto o hay otra búsqueda
    const chosen = result.source === 'provider' ? result : null;
    setSearching(false);
    setSearched(true);
    setFound(chosen);
    onSelection(chosen);
  }

  return (
    <View testID="location-picker" style={{ gap: 8 }}>
      <TextInput
        accessibilityLabel="Edificio, zona o referencia"
        testID="location-input"
        value={label}
        onChangeText={edit}
        placeholder="Edificio, zona o referencia"
        editable={!disabled}
        style={{ borderWidth: 1, borderColor: '#777', padding: 8 }}
      />
      <Pressable
        accessibilityRole="button"
        disabled={disabled || searching || text.length === 0}
        onPress={() => {
          void runSearch();
        }}
        testID="location-search-button"
      >
        <Text>{searching ? 'Buscando…' : 'Buscar ubicación (opcional)'}</Text>
      </Pressable>
      {found !== null ? (
        <View testID="location-result">
          <Text>{`Ubicación encontrada (proveedor): ${found.label}`}</Text>
          <Text>Datos de ubicación © OpenStreetMap contributors (Photon)</Text>
        </View>
      ) : null}
      {searched && found === null ? (
        <Text testID="location-fallback">
          No se encontró una ubicación o el servicio no está disponible. Se usará tu texto manual.
        </Text>
      ) : null}
    </View>
  );
}