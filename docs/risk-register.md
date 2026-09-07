# Registro de riesgos — CampusOps

> Registren exactamente tres riesgos y ordénenlos del más al menos prioritario.

| ID | Riesgo | Probabilidad | Motivo Probabilidad | Impacto | Motivo Impacto | Mitigación | Comprobación de Mitigación |
|---|---|---|---|---|---|---|---|
| **R-01** | Inconsistencia o pérdida de estado en la transición del reporte (`Reportado` -> `Cerrado`). | Media | La lógica de manejo de estado en frontend/backend puede no validar adecuadamente las transiciones permitidas. | Alto | Un usuario o técnico podría dejar reportes en estados inválidos o huérfanos, arruinando la trazabilidad del sistema. | Implementar validaciones explícitas de transición de estados y respaldar con pruebas unitarias/smoke. | Ejecutar `npm run test:smoke` para validar que los flujos principales y renderizados iniciales respondan sin errores. |
| **R-02** | Formulario enviado con datos incompletos o mal formados por el usuario. | Alta | Los usuarios finales suelen enviar reportes rápidos sin especificar aula, edificio o detalle de la falla. | Medio | Dificulta la asignación eficiente por parte del coordinador y retrasa la atención en sitio. | Añadir validación estricta de formularios del lado del cliente antes de permitir el submit. | Intentar enviar un reporte con campos vacíos y verificar visual y funcionalmente que el botón de envío se bloquee o emita alerta. |
| **R-03** | Falta de sincronización en el trabajo colaborativo de Git (conflictos en `main` o commits mal estructurados). | Media | Integración de 3 desarrolladores trabajando simultáneamente en la misma semana sobre la misma base de código. | Alto | Riesgo de sobrescribir archivos JSON de entrega (`baseline`, `engineering`, `individual`) o desalinear la etiqueta `week-01-final`. | Establecer un orden estricto de commits por integrante y realizar `git pull origin main` antes de trabajar. | Ejecutar `git log --graph --oneline` para confirmar una historia limpia y lineal antes del etiquetado final. |

## Riesgo que atenderíamos primero

**Riesgo prioritario:** R-01 (Inconsistencia o pérdida de estado en la transición del reporte).

**Justificación de la decisión:**
Atenderíamos este riesgo en primer lugar porque la función principal y el valor central de CampusOps radican en la trazabilidad y la correcta gestión del ciclo de vida de los reportes (`Reportado` -> `Asignado` -> `En Atención` -> `Cerrado`). Si la lógica de estados falla o permite estados inválidos, el sistema pierde confiabilidad operativa inmediatamente para todos los actores (reportantes, técnicos y coordinadores), invalidando los datos de las pruebas y métricas. Asegurar la consistencia de los estados desde el inicio garantiza una base sólida antes de abordar validaciones secundarias en el cliente o temas del flujo de trabajo en Git.