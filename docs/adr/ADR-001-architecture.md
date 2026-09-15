# ADR-001: Selección de Arquitectura en Capas (Clean Architecture) con Inversión de Dependencias

* **Estatus:** Aceptado
* **Fecha:** 2026-09-11
* **Autores:** Equipo 10A-E01 (Janeth Cabrera Arguelles, Héctor Ulises Cacho Gonzales Celis, Fátima Avelino)

---

## 1. Contexto

CampusOps requiere organizar las responsabilidades de UI, incidencias, sesión, persistencia y ubicación. Necesitamos que la pantalla de lista y detalle de incidencias se pueda probar sin depender de un backend real o librerías externas, permitiendo cambiar los proveedores técnicos más adelante sin reescribir las vistas ni la lógica.

---

## 2. Alternativas Consideradas

### Alternativa A: Arquitectura Modular Centrada en Funcionalidades (MVC / Features)
Organizar el código en carpetas por característica (ej. `features/incidents`), donde las pantallas consumen directamente librerías HTTP o adaptadores de almacenamiento dentro del mismo módulo.

* **Ventajas:** Desarrollo inicial rápido y menor cantidad de archivos.
* **Desventajas:** Alto acoplamiento. La UI conoce detalles de infraestructura, dificultando las pruebas aisladas y el cambio de proveedores.

### Alternativa B: Arquitectura en Capas con Inversión de Dependencias (Clean Architecture)
Dividir el sistema en 4 capas con límites estrictos:
1. **UI (`src/ui`):** Pantallas y componentes visuales de React Native.
2. **Aplicación (`src/application`):** Casos de uso que orquestan los flujos.
3. **Dominio (`src/domain`):** Entidades y contratos/interfaces (puertos).
4. **Infraestructura (`src/infrastructure`):** Adaptadores concretos y fakes en memoria.

* **Ventajas:** Testabilidad alta mediante fakes deterministas y aislamiento total de proveedores técnicos.
* **Desventajas:** Requiere crear más archivos e interfaces intermedias.

---

## 3. Decisión

Elegimos la **Alternativa B (Clean Architecture)**. 

La regla de dependencias establece que las capas superiores (`UI`, `Application`) sólo conocen los contratos del `Domain`. Queda **estrictamente prohibido** que los componentes de `UI` importen código de `Infrastructure`.

---

## 4. Matriz Comparativa y Trade-Offs

| Criterio | Alternativa A (Modular) | Alternativa B (Clean Architecture) |
| :--- | :--- | :--- |
| **Testabilidad** | Baja (requiere backend/mocks globales) | **Alta** (pruebas aisladas con fakes) |
| **Complejidad** | **Baja** (menos archivos) | Media (requiere interfaces y contratos) |
| **Cambio de Proveedor** | Difícil (se reescriben pantallas) | **Fácil** (solo se cambia el adaptador) |

---

## 5. Consecuencias

* **Positivas:** El código cumple con las verificaciones de arquitectura automatizadas (`make verify-week-02`) y permite cambiar la persistencia o la API sin afectar las pantallas.
* **Negativas:** Exige definir interfaces explícitas para cada repositorio en la capa de dominio.