# Asistencia de Inteligencia Artificial (Semana 6)

Este documento registra el uso de herramientas de asistencia de inteligencia artificial para apoyar el desarrollo de las tareas de la Semana 6 del proyecto de equipo.

## 1. Alcance de la Asistencia
- **Diseño de máquina de estados (`docs/session-state-machine.mmd`):** Estructuración de los estados de sesión (`anonymous`, `authenticating`, `authenticated`, `refreshing`) y sus transiciones.
- **Implementación de Reglas de Autorización (`src/application/authorization.ts`):** Redacción de la función pura `canPerformAction` en TypeScript utilizando el `AuthorizationContext`.

## 2. Validación Humana
Todo el código e información generados mediante asistencia de IA han sido verificados rigurosamente:
- Se validó que la lógica cumpla estrictamente con la matriz de permisos de roles (Coordinador, Técnico, Reportante).
- Se probó la tabla de permisos y se revisó el código fuente línea por línea para corregir ortografía y redacción.
- Se ejecutaron exitosamente los comandos de validación estática del proyecto (`npx tsc --noEmit` y `npm run lint`) para garantizar que no existan errores de compilación ni de formato.

   ## Núcleo de sesión, cliente cloud y acciones (Héctor)

   `authEvents.ts`, `sessionManager.ts`, los adaptadores de infraestructura, el cliente cloud, las acciones sobre incidencias y `App.tsx` se redactaron con ayuda de Claude (Anthropic) y fueron revisados y probados por Héctor.
   Verificación: compilación estricta (`tsc`), lint, prueba pública de la Semana 6, smoke test, pruebas de equipo y las pruebas de Janeth contra el backend del curso; sus resultados quedan en `reports/week-06/`.