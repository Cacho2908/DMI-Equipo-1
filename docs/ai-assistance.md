# Asistencia de IA - Semana 6

Durante la Semana 6, se utilizó asistencia de inteligencia artificial para los siguientes entregables:

1. **Diseño de Máquina de Estados (`docs/session-state-machine.mmd`):** 
   - Generación de la sintaxis Mermaid para mapear el ciclo de vida de la sesión.
   - Estructuración de las transiciones entre los estados `anonymous`, `authenticating`, `authenticated` y `refreshing` basándose en los eventos del reductor del núcleo de sesión.

2. **Lógica de Autorización (`src/application/authorization.ts`):**
   - Desarrollo de funciones puras (`isIncidentVisible` y `canPerformAction`) en TypeScript.
   - Traducción de las reglas de negocio en código duro para evitar dependencias de la UI (ocultamiento de botones), validando permisos por rol (Coordinador, Técnico, Reportante) y titularidad de asignación para los técnicos.
   