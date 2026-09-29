# Controles de Seguridad y Privacidad

## 1. Controles Implementados
* **Redacción de Telemetría (`redactForTelemetry`):** Función recursiva que intercepta y enmascara campos sensibles (`authorization`, `password`, `token`, `email`, etc.) en objetos y listas sin mutar la entrada original.
* **Almacenamiento Seguro de Sesión:** Uso de `expo-secure-store` para guardar el token de autenticación de forma cifrada en el dispositivo.

## 2. Relación con el Threat Model (Semana 3)
* **Exponer credenciales:** Mitigado al cifrar el almacenamiento local de tokens con `expo-secure-store`, previniendo accesos no autorizados en dispositivos físicos o respaldos.
* **Filtrar datos en registros:** Mitigado mediante `redactForTelemetry`, asegurando que ninguna traza de telemetría o logs exponga información de identificación personal o secretos.

## 3. Justificación de `expo-secure-store`
* **Ventajas:** Proporciona almacenamiento cifrado nativo (Keychain en iOS, Keystore/EncryptedSharedPreferences en Android).
* **Alternativas descartadas:** Se descartó `AsyncStorage` o almacenamiento plano local debido a que guardan texto en claro y son vulnerables a extracción en dispositivos rooteados o con depuración activa.

## 4. Riesgo Residual
* Persiste un riesgo menor si el dispositivo del usuario está completamente comprometido (malware avanzado con privilegios root/jailbreak), nivel en el cual ningún almacenamiento local de aplicación es 100% inmune.