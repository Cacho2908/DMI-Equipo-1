import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { IncidentLocation } from '../../src/campusops/contracts';
import type { Incident } from '../../src/domain/incident';
import type { CloudResult } from '../../src/infrastructure/incidents/cloudIncidentClient';
import type { LocationSearch } from '../../src/ui/components/IncidentLocationPicker';
import { IncidentReportForm, type CreateIncident } from '../../src/ui/components/IncidentReportForm';

type ScenarioType = 'nominal' | 'boundary' | 'failure';
type Check = { id: string; status: 'pass' | 'fail'; scenarioType: ScenarioType; command: string; evidence: string };
type View = Awaited<ReturnType<typeof render>>;

const CMD = 'npx jest course-tests/team/week-09-location-ui.test.tsx';
const checks: Check[] = [];

const INCIDENT: Incident = {
  id: 'campus-inc-101',
  title: 'Falla ficticia',
  category: 'connectivity',
  status: 'open',
  reporterId: 'reporter-1',
};
const CREATED: CloudResult<Incident> = { ok: true, value: INCIDENT };
const NETWORK_FAILURE: CloudResult<Incident> = { ok: false, error: { kind: 'network_error' } };

async function observe(id: string, type: ScenarioType, what: string, body: () => Promise<unknown>) {
  try {
    const observed = await body();
    checks.push({ id, status: 'pass', scenarioType: type, command: CMD, evidence: `${what}. Observado: ${JSON.stringify(observed)}` });
  } catch (error) {
    checks.push({ id, status: 'fail', scenarioType: type, command: CMD, evidence: `${what}. Falló: ${(error as Error).message}` });
    throw error;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function setup() {
  const select = jest.fn<Promise<IncidentLocation>, [string, string]>();
  const create = jest.fn<ReturnType<CreateIncident>, Parameters<CreateIncident>>();
  create.mockResolvedValue(CREATED);
  const ids = ['op-1', 'op-2', 'op-3'];
  const newId = jest.fn(() => ids.shift() ?? 'op-extra');
  const search: LocationSearch = { select };
  return { select, create, newId, search };
}

async function fillForm(
  view: View,
  values: { description?: string; category?: string; label?: string } = {},
) {
  await fireEvent.changeText(view.getByTestId('description-input'), values.description ?? 'Falla ficticia en el laboratorio');
  await fireEvent.press(view.getByTestId(`category-${values.category ?? 'connectivity'}`));
  await fireEvent.changeText(view.getByTestId('location-input'), values.label ?? 'Edificio de prueba A');
}

function callOf(create: jest.Mock<ReturnType<CreateIncident>, Parameters<CreateIncident>>, index: number) {
  const call = create.mock.calls[index];
  if (!call) throw new Error(`create no se llamó la vez ${index + 1}`);
  return call;
}

test('UI-01 búsqueda exitosa usa la etiqueta del proveedor y muestra la atribución', () =>
  observe('ui-01-ubicacion-del-proveedor', 'nominal',
    'Con una búsqueda exitosa se envía la etiqueta del proveedor, sin coordenadas, y se muestra la atribución',
    async () => {
      const { select, create, newId, search } = setup();
      select.mockResolvedValue({ source: 'provider', label: 'Biblioteca Central, Campus', latitude: 19.4, longitude: -99.1 });
      const view = await render(<IncidentReportForm search={search} create={create} newId={newId} />);
      await fillForm(view, { label: 'Biblioteca' });
      await fireEvent.press(view.getByTestId('location-search-button'));
      await waitFor(() => view.getByText(/OpenStreetMap/));
      await fireEvent.press(view.getByTestId('submit-button'));
      await waitFor(() => view.getByText(/Reporte creado: campus-inc-101/));
      const [input] = callOf(create, 0);
      expect(input.location).toBe('Biblioteca Central, Campus');
      expect(Object.keys(input).sort()).toEqual(['category', 'description', 'location']);
      return { searchCalls: select.mock.calls, sent: input };
    }));

test('UI-02a el proveedor no encuentra nada: se continúa con el texto manual', () =>
  observe('ui-02a-sin-resultado-usa-manual', 'failure',
    'Si el proveedor devuelve la alternativa manual, se puede crear el reporte con el texto escrito y sin coordenadas',
    async () => {
      const { select, create, newId, search } = setup();
      select.mockResolvedValue({ source: 'manual', label: 'Biblioteca' });
      const view = await render(<IncidentReportForm search={search} create={create} newId={newId} />);
      await fillForm(view, { label: 'Biblioteca' });
      await fireEvent.press(view.getByTestId('location-search-button'));
      await waitFor(() => view.getByText(/texto manual/));
      await fireEvent.press(view.getByTestId('submit-button'));
      await waitFor(() => view.getByText(/Reporte creado/));
      const [input] = callOf(create, 0);
      expect(input.location).toBe('Biblioteca');
      expect(Object.keys(input).sort()).toEqual(['category', 'description', 'location']);
      return { sent: input };
    }));

test('UI-02b el servicio falla: se continúa con el texto manual', () =>
  observe('ui-02b-servicio-caido-usa-manual', 'failure',
    'Si la búsqueda rechaza (desconexión), el texto manual se conserva y el reporte se puede crear',
    async () => {
      const { select, create, newId, search } = setup();
      select.mockRejectedValue(new Error('Network request failed'));
      const view = await render(<IncidentReportForm search={search} create={create} newId={newId} />);
      await fillForm(view, { label: 'Zona norte' });
      await fireEvent.press(view.getByTestId('location-search-button'));
      await waitFor(() => view.getByText(/texto manual/));
      await fireEvent.press(view.getByTestId('submit-button'));
      await waitFor(() => view.getByText(/Reporte creado/));
      const [input] = callOf(create, 0);
      expect(input.location).toBe('Zona norte');
      return { sent: input };
    }));

test('UI-03 no se consulta por cada tecla', () =>
  observe('ui-03-busqueda-solo-con-boton', 'boundary',
    'Escribir varias veces no consulta al proveedor; solo lo hace el botón Buscar',
    async () => {
      const { select, create, newId, search } = setup();
      select.mockResolvedValue({ source: 'manual', label: 'Edificio B' });
      const view = await render(<IncidentReportForm search={search} create={create} newId={newId} />);
      await fireEvent.changeText(view.getByTestId('location-input'), 'E');
      await fireEvent.changeText(view.getByTestId('location-input'), 'Ed');
      await fireEvent.changeText(view.getByTestId('location-input'), 'Edificio B');
      expect(select).not.toHaveBeenCalled();
      await fireEvent.press(view.getByTestId('location-search-button'));
      await waitFor(() => expect(select).toHaveBeenCalledTimes(1));
      return { callsAfterTyping: 0, callsAfterPress: select.mock.calls.length };
    }));

test('UI-04 una respuesta obsoleta no se aplica', () =>
  observe('ui-04-respuesta-obsoleta', 'boundary',
    'Si el texto cambia mientras se busca, el resultado tardío se ignora y se usa el texto actual',
    async () => {
      const { select, create, newId, search } = setup();
      const late = deferred<IncidentLocation>();
      select.mockReturnValueOnce(late.promise);
      const view = await render(<IncidentReportForm search={search} create={create} newId={newId} />);
      await fillForm(view, { label: 'Biblioteca' });
      await fireEvent.press(view.getByTestId('location-search-button'));
      await fireEvent.changeText(view.getByTestId('location-input'), 'Biblioteca norte');
      await act(async () => {
        late.resolve({ source: 'provider', label: 'Resultado viejo', latitude: 1, longitude: 2 });
      });
      expect(view.queryByText(/Resultado viejo/)).toBeNull();
      await fireEvent.press(view.getByTestId('submit-button'));
      await waitFor(() => view.getByText(/Reporte creado/));
      const [input] = callOf(create, 0);
      expect(input.location).toBe('Biblioteca norte');
      return { sent: input };
    }));

test('UI-05 un doble toque no envía dos veces', () =>
  observe('ui-05-doble-envio', 'boundary',
    'Dos toques seguidos en Crear reporte producen una sola creación',
    async () => {
      const { create, newId, search } = setup();
      const gate = deferred<CloudResult<Incident>>();
      create.mockReturnValueOnce(gate.promise);
      const view = await render(<IncidentReportForm search={search} create={create} newId={newId} />);
      await fillForm(view);
      await fireEvent.press(view.getByTestId('submit-button'));
      await fireEvent.press(view.getByTestId('submit-button'));
      expect(create).toHaveBeenCalledTimes(1);
      await act(async () => {
        gate.resolve(CREATED);
      });
      await waitFor(() => view.getByText(/Reporte creado/));
      return { createCalls: create.mock.calls.length };
    }));

test('UI-06 respuesta perdida: el reenvío conserva clave y contenido', () =>
  observe('ui-06-respuesta-perdida-misma-clave', 'failure',
    'Tras un error de red, reintentar con los mismos datos reutiliza la misma operationId y el mismo cuerpo',
    async () => {
      const { create, newId, search } = setup();
      create.mockResolvedValueOnce(NETWORK_FAILURE).mockResolvedValueOnce(CREATED);
      const view = await render(<IncidentReportForm search={search} create={create} newId={newId} />);
      await fillForm(view);
      await fireEvent.press(view.getByTestId('submit-button'));
      await waitFor(() => view.getByText(/pudo haberse guardado/));
      await fireEvent.press(view.getByTestId('submit-button'));
      await waitFor(() => view.getByText(/Reporte creado/));
      const [firstInput, firstOptions] = callOf(create, 0);
      const [secondInput, secondOptions] = callOf(create, 1);
      expect(secondOptions.operationId).toBe(firstOptions.operationId);
      expect(JSON.stringify(secondInput)).toBe(JSON.stringify(firstInput));
      expect(newId).toHaveBeenCalledTimes(1);
      return { operationIds: [firstOptions.operationId, secondOptions.operationId], idsGenerated: newId.mock.calls.length };
    }));

test('UI-07 si el contenido cambia, es una operación nueva', () =>
  observe('ui-07-contenido-distinto-clave-nueva', 'boundary',
    'Cambiar la descripción después de un fallo incierto genera otra operationId (decisión explícita del usuario)',
    async () => {
      const { create, newId, search } = setup();
      create.mockResolvedValueOnce(NETWORK_FAILURE).mockResolvedValueOnce(CREATED);
      const view = await render(<IncidentReportForm search={search} create={create} newId={newId} />);
      await fillForm(view);
      await fireEvent.press(view.getByTestId('submit-button'));
      await waitFor(() => view.getByText(/pudo haberse guardado/));
      await fireEvent.changeText(view.getByTestId('description-input'), 'Otra falla distinta');
      await fireEvent.press(view.getByTestId('submit-button'));
      await waitFor(() => view.getByText(/Reporte creado/));
      const [, firstOptions] = callOf(create, 0);
      const [, secondOptions] = callOf(create, 1);
      expect(secondOptions.operationId).not.toBe(firstOptions.operationId);
      return { operationIds: [firstOptions.operationId, secondOptions.operationId] };
    }));

test('UI-08 sin descripción, categoría o ubicación no se envía nada', () =>
  observe('ui-08-formulario-incompleto', 'boundary',
    'Con datos faltantes o en blanco el botón no crea el reporte',
    async () => {
      const { create, newId, search } = setup();
      const view = await render(<IncidentReportForm search={search} create={create} newId={newId} />);
      await fireEvent.press(view.getByTestId('submit-button'));
      await fireEvent.changeText(view.getByTestId('description-input'), 'Falla ficticia');
      await fireEvent.press(view.getByTestId('submit-button'));
      await fireEvent.press(view.getByTestId('category-water'));
      await fireEvent.changeText(view.getByTestId('location-input'), '   ');
      await fireEvent.press(view.getByTestId('submit-button'));
      expect(create).not.toHaveBeenCalled();
      return { createCalls: create.mock.calls.length };
    }));

afterAll(() => {
  const file = path.join(os.tmpdir(), 'janeth-week09-ui-checks.json');
  fs.writeFileSync(file, JSON.stringify(checks, null, 2), 'utf8');
  process.stdout.write(`\nChecks guardados en: ${file}\n`);
});