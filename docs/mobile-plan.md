# Plan de Hermes Mobile

## Arquitectura acordada

Android (Capacitor + React) → clave de acceso local → servicio personal en Mac mini → conectores por PC → Hermes headless. Tailscale cifra los enlaces entre equipos; HTTPS Serve protege el acceso móvil. Cada instalación personal agrupa equipos, y cada equipo expone los perfiles/agents que ya tiene Hermes. El servicio central no ejecuta agentes; este Mac también aloja su propio conector Hermes.

Se reutiliza el protocolo JSON-RPC y los endpoints web del fork MIT de NousResearch/hermes-agent. El desktop sigue siendo la referencia funcional y visual. Los nuevos paquetes están separados del núcleo para facilitar actualizaciones desde upstream.

## Entregado en el código

- Servicio: propietario local con clave de instalación, emparejamiento QR de cinco minutos, credenciales cifradas, SQLite, tickets WebSocket de 30 segundos y uso único, revocación, proxy restringido a Tailscale.
- Conector: proceso Hermes propio en loopback, autentica enlaces del NAS, proxy REST/RPC y terminal nativo con recuperación temporal.
- App: equipos/perfiles, chat y streaming, historial, adjuntos/aprobaciones, archivos, shell, Git y worktrees, ajustes/skills/MCP; interfaz táctil basada en Hermes Desktop.
- Operación: Android versionado, LaunchAgents nativos para este Mac y Docker Compose opcional para NAS, plantillas de autoarranque en macOS/Linux/Windows, configuración sin secretos en Git.

## Activación independiente

1. Generar la clave con `node deploy/mobile/init.mjs <ruta-env>`; realizado en este Mac.
2. Conectar el móvil con la URL HTTPS y la clave generada; no hay registro externo.
3. Servicio activo en el Mac. URL: `https://sergios-mac-mini.tail0b6ccb.ts.net`. No hace falta SSH al NAS.
4. Mac mini (`100.73.102.62`) ya vinculado; añadir los otros PC mediante QR.
5. Validar acceso local nativo, cámara QR, Android físico, suspensión/reconexión, restauración de la base de datos del servicio y estabilidad 24 h. Certificar Windows y Bazzite en sus equipos reales.

## Decisiones y límites

Una cuenta personal evita gestión de organizaciones, permisos compartidos y facturación innecesarios. No se incluye Funnel en esta fase. Una instalación posterior abierta a Internet exige revisar límites por usuario, antiabuso y acceso público antes de activarla.

Los conectores mantienen credenciales propias separadas de la clave de acceso del móvil. El móvil recibe tickets temporales y nunca recibe esos tokens. Desconectar el móvil no termina tareas de Hermes. Revocar bloquea nuevas conexiones y cierra las existentes; no equivale a cancelar un proceso ya lanzado. Los shells recuperables caducan tras 15 minutos desconectados. Archivos grandes se gestionan desde el PC por ahora (subidas de 8 MB).

Las peticiones que dependen de una ventana Electron concreta continúan en Desktop. El cliente móvil identifica esas peticiones y permite cancelarlas, en lugar de inventar una respuesta.

## Despliegue local realizado

Servidor y conector instalados como LaunchAgents del usuario. HTTPS Tailscale activo; servicio activo con autenticación local. El conector ejecuta Hermes y responde 401 sin credenciales. El Mac debe estar encendido y despierto; su servicio es necesario también para acceder a los otros PC.
