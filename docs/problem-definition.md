# Definición del problema — CampusOps

> Sustituyan todas las indicaciones entre corchetes por el trabajo del equipo.

## Problema

Actualmente, el reporte, seguimiento y resolución de incidencias e infraestructura en el campus se realiza de forma descentralizada, informal y poco trazable. Esto genera pérdidas de información, tiempos de respuesta prolongados y falta de visibilidad para los usuarios finales y los administradores del campus.

## Alcance

### Incluye

- Registro y captura de reportes de incidencias del campus por parte de los usuarios.
- Asignación de reportes a personal técnico o cuadrillas de mantenimiento.
- Seguimiento de estados del reporte: `Reportado` -> `Asignado` -> `En Atención` -> `Cerrado`.
- Panel básico de consulta de estado para los usuarios reportantes.

### No incluye

- Procesamiento de pagos o compras de suministros de reparación.
- Integración con sistemas externos de nómina o recursos humanos.
- Notificaciones por SMS o mensajería instantánea de terceros en esta fase.

## Actores y responsabilidades

- **Reportante (Estudiante / Docente / Personal):** Genera el reporte inicial con ubicación y descripción del problema; consulta el estado del reporte.
- **Técnico / Encargado de Cuadrilla:** Recibe la asignación del reporte, actualiza el estado conforme atiende la incidencia y registra el cierre con evidencia.
- **Coordinador / Administrador de CampusOps:** Supervisa el flujo global, asigna o reasigna incidencias a los técnicos y revisa métricas generales de resolución.

## Flujo principal

1. **Reportar:** El usuario detecta una falla y llena el formulario en CampusOps indicando ubicación y descripción. El estado inicial es `Reportado`.
2. **Asignar:** El coordinador o el sistema asigna la incidencia a un técnico responsable. El estado pasa a `Asignado`.
3. **Atender:** El técnico inicia los trabajos en sitio y marca el estado como `En Atención`.
4. **Cerrar:** Una vez resuelta la falla, el técnico valida la solución y marca el estado como `Cerrado`.
## Criterios de aceptación verificables

1. **Transición de estados válida:** La interfaz y la lógica del sistema deben permitir que una incidencia avance secuencialmente por los estados (`Reportado` -> `Asignado` -> `En Atención` -> `Cerrado`) sin saltarse pasos.
2. **Campos obligatorios en el reporte:** Al crear una incidencia, el sistema debe rechazar el envío si faltan los campos de `ubicación` o `descripción`, mostrando un mensaje explicativo en pantalla.
3. **Persistencia del reporte registrado:** Al crear un nuevo reporte y consultar la lista de incidencias, el nuevo elemento debe aparecer listado con su identificador único y estado inicial `Reportado`.