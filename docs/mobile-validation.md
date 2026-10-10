# Verificación de Hermes Mobile — 2026-10-10

- TypeScript: los tres paquetes pasan typecheck. APK Android debug compilado con Java 21 y SDK 36.
- Pruebas: 3 de servidor, 1 de integración del conector con PTY real, 2 de API móvil y 3 de navegador pasan. Cubren aislamiento, cifrado, tickets, revocación, reconexión, borradores, peticiones restauradas y aprobaciones recibidas solo cuando el chat está visible.
- Hermes instalado en este Mac: proxy de status, directorio, esquema (895 campos), skills y MCP; RPC de perfiles y sesiones comprobados sin modificar conversaciones.
- Docker: imagen compilada en Linux x86_64 (Bazzite); contenedor efímero con sistema de archivos de solo lectura, health 200 y acceso sin autenticación rechazado (401).
- UI: capturas en móvil claro/oscuro y pantalla ancha sin desbordamiento; navegación, chat, archivos, Git y ajustes con fixtures identificados como pruebas. Revisión independiente resolvió el tamaño táctil mínimo de 48 px. Captura nativa en emulador Android 36 limitada a la entrada sin Firebase.
- Dependencias: npm audit sin vulnerabilidades en los tres paquetes al realizar la comprobación.

## Pendiente de activación real

No existe todavía proyecto Firebase. Hermes no conoce el usuario SSH del NAS `actual` y su memoria indica que la clave local no estaba autorizada; no se ha desplegado allí ni realizado acceso SSH.

Login Google, cámara QR, uso autenticado en móvil físico, suspensión, estabilidad de 24 horas, restauración del NAS y conectores Windows/Linux en hardware quedan pendientes. El APK es una compilación debug; una distribución final requiere configuración Firebase y firma release.

## Servicio alojado en el Mac mini

Por petición del usuario se prescinde del NAS para el despliegue inicial. Servidor y conector nativos instalados bajo Application Support y cargados como LaunchAgents. HTTPS privado de Tailscale apunta a loopback 3000. La comprobación con asserts confirma 503 y configured:false para health, equipos y emparejamiento mientras falta Firebase; conector activo con 401 sin credenciales; archivo de configuración con permisos 600. El NAS no es necesario para activar esta instalación.
