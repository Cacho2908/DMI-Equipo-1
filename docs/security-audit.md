# Auditoría de seguridad y privacidad

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
| - | - | - | - | - |
| 1 | Endpoint y URL base expuestos en el código fuente | Cualquier persona con acceso al repositorio podría conocer la infraestructura interna y puertos del servicio | Se eliminó la URL estática y se exigió una variable de entorno obligatoria | endpoint-corregido.png |
| 2 | Datos de infraestructura y mock data incrustados en la lógica | Dificulta la escalabilidad y mantiene información estática acoplada directamente al repositorio | Se aislaron los datos en un archivo independiente (`incidentsData.ts`) y se importaron de forma segura | repositorio-aislado.png |
| 3 | Mensajes de error directos en la interfaz de usuario | Mostrar textos sin control puede exponer pistas sobre los estados internos de búsqueda | Se sanitizó el mensaje de error para mostrar una respuesta neutral al usuario final | ui-sanitizada.png |

---

## Detalle de Hallazgos y Correcciones

## Hallazgo 1: Endpoint y URL base expuestos en el código fuente

### Problema encontrado
El archivo `src/api/courseBackend.ts` contenía una URL y un puerto local definidos de forma estática (`const DEFAULT_URL = '[http://127.0.0.1:4310](http://127.0.0.1:4310)'`).

### Riesgo
Un atacante o cualquier tercero con acceso al código fuente podría identificar la dirección de red interna y los servicios expuestos.

### Solución aplicada
Se removió la constante por defecto y se implementó una validación estricta que exige la configuración mediante variable de entorno.

**Antes:**
```typescript
const DEFAULT_URL = 'http://127.0.0.1:4310';
Después:

TypeScript
export async function getBackendHealth(
  baseUrl = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL,
): Promise<BackendHealth> {
  if (!baseUrl) {
    throw new Error('Configuración del servicio no disponible.');
  }
  const response = await fetch(`${baseUrl}/health`);
  // ...
}
Evidencia
Hallazgo 2: Datos de infraestructura acoplados al repositorio
Problema encontrado
El archivo src/infrastructure/incidents/fakeIncidentRepository.ts almacenaba los arreglos de datos simulados e identificadores directamente dentro de las funciones de infraestructura.

Riesgo
Acoplar los datos de prueba directamente en el código disminuye la mantenibilidad y mezcla las capas de datos con la lógica de negocio.

Solución aplicada
Se creó un archivo dedicado (incidentsData.ts) para aislar los datos mock y se importaron limpiamente al repositorio.

Antes:

TypeScript
const FAKE_INCIDENTS: readonly Incident[] = [ ... ];
Después:

TypeScript
import { FAKE_INCIDENTS } from './incidentsData';
Evidencia
Hallazgo 3: Mensajes de error expuestos en la interfaz
Problema encontrado
En el componente src/ui/screens/IncidentDetailScreen.tsx, el sistema mostraba un texto directo en pantalla (<Text>No encontrada</Text>) sin un tratamiento neutral.

Riesgo
Revelar estados de búsqueda específicos puede facilitar la enumeración de recursos por parte de usuarios externos.

Solución aplicada
Se sanitizó el componente visual para retornar un mensaje genérico y seguro.

Antes:

TypeScript
if (!incident) return <Text>No encontrada</Text>;
Después:

TypeScript
if (!incident) {
  return (
    <View>
      <Text>El registro solicitado no se encuentra disponible.</Text>
    </View>
  );
  }