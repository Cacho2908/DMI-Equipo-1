// Configuración de servicios de la aplicación

// SOLUCIÓN APLICADA: Uso de variables de entorno para evitar exponer credenciales
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || "demo_key_ficticia";
const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://api.ejemplo.com";

export { API_KEY, API_URL };
