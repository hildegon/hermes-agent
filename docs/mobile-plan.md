# Plan de Hermes Mobile

## Arquitectura acordada

Android (Capacitor + React) → Google/Firebase → servicio personal en NAS → conectores por PC → Hermes headless. Tailscale cifra los enlaces entre equipos; HTTPS Serve protege el acceso móvil. Cada cuenta autorizada agrupa equipos, y cada equipo expone los perfiles/agents que ya tiene Hermes. El NAS no ejecuta agentes.

Se reutiliza el protocolo JSON-RPC y los endpoints web del fork MIT de NousResearch/hermes-agent. El desktop sigue siendo la referencia funcional y visual. Los nuevos paquetes están separados del núcleo para facilitar actualizaciones desde upstream.

## Entregado en el código

- Servicio: propietario único Google, emparejamiento QR de cinco minutos, credenciales cifradas, SQLite, tickets WebSocket de 30 segundos y uso único, revocación, proxy restringido a Tailscale.
- Conector: proceso Hermes propio en loopback, autentica enlaces del NAS, proxy REST/RPC y terminal nativo con recuperación temporal.
- App: equipos/perfiles, chat y streaming, historial, adjuntos/aprobaciones, archivos, shell, Git y worktrees, ajustes/skills/MCP; interfaz táctil basada en Hermes Desktop.
- Operación: Android versionado, Docker Compose para NAS, plantillas de autoarranque en macOS/Linux/Windows, configuración sin secretos en Git.

## Activación pendiente de datos externos

1. Crear el proyecto Firebase del usuario y registrar Android/Google.
2. Definir el UID propietario y configurar APK/NAS.
3. Instalar Compose en `actual` con acceso SSH autorizado. Dirección confirmada: `100.81.111.88` / `actual.tail0b6ccb.ts.net`.
4. Vincular primero este Mac mini (`100.73.102.62`) y después los otros PC.
5. Validar Google, cámara QR, Android físico, suspensión/reconexión, restauración del NAS y estabilidad 24 h. Certificar Windows y Bazzite en sus equipos reales.

## Decisiones y límites

Una cuenta personal evita gestión de organizaciones, permisos compartidos y facturación innecesarios. No se incluye Funnel en esta fase. Una instalación posterior abierta a Internet exige revisar límites por usuario, antiabuso y acceso público antes de activarla.

Los conectores mantienen credenciales propias separadas de Google. El móvil recibe tickets temporales y nunca recibe esos tokens. Desconectar el móvil no termina tareas de Hermes. Revocar bloquea nuevas conexiones y cierra las existentes; no equivale a cancelar un proceso ya lanzado. Los shells recuperables caducan tras 15 minutos desconectados. Archivos grandes se gestionan desde el PC por ahora (subidas de 8 MB).

Las peticiones que dependen de una ventana Electron concreta continúan en Desktop. El cliente móvil identifica esas peticiones y permite cancelarlas, en lugar de inventar una respuesta.
