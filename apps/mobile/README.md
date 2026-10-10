# Hermes Mobile

App Android para controlar tus agentes Hermes en varios PC desde tu propio servicio. Acceso local con una clave aleatoria de instalación, sin Google, Firebase ni registro externo. Una instalación personal tiene un propietario; quien posee su clave puede controlar sus equipos.

Chat, streaming, historial, aprobaciones, archivos, terminal, Git, worktrees, ajustes, skills y MCP mantienen los conceptos de Hermes Desktop. Cada agente trabaja en su PC; desconectar el móvil no cancela el chat. Las peticiones específicas de una ventana Electron siguen requiriendo Desktop.

## Desplegar tu propio servicio

Requisitos: Node 24–26, Hermes con `hermes serve` en los PC, y una red privada entre servicio, móvil y equipos. Esta instalación usa Tailscale; la autenticación de la app no consulta ningún proveedor externo. El proxy admite direcciones IPv4 de `100.64.0.0/10`, fija su IP y no sigue redirecciones. Puede usarse una VPN propia en ese rango y un proxy HTTPS con certificado confiable; no se admiten destinos LAN arbitrarios en esta versión.

Desde la raíz del fork:

```sh
npm --prefix apps/mobile-server ci --workspaces=false
cp deploy/mobile/.env.example deploy/mobile/.env
node deploy/mobile/init.mjs deploy/mobile/.env
# Ajusta MOBILE_TAILNET_SUFFIX a tu red, o déjalo vacío si usas IPs.
# Con Docker:
docker compose -f deploy/mobile/compose.yaml up -d --build
# O con Node nativo, en primer plano:
(cd apps/mobile-server && node --env-file=../../deploy/mobile/.env src/main.ts)
```

Elige Docker o Node, sin ejecutar ambos en el mismo puerto. `init.mjs` crea una clave aleatoria de 32 bytes, guarda solo su hash SHA-256 en `.env` y entrega la clave en `.env.access-key`, con permisos privados. Conserva también `MOBILE_ENCRYPTION_KEY`: cifra las credenciales de los conectores. El script rechaza una instalación ya inicializada y conserva una clave de cifrado existente.

Para HTTPS privado con Tailscale, comprueba primero `tailscale serve status` y ejecuta `tailscale serve --bg http://127.0.0.1:3000`. No actives Funnel para este despliegue privado. En Android, introduce esa URL y la clave de `.env.access-key`, y pulsa **Conectar**. El mismo APK sirve para cualquier instalación; `VITE_MOBILE_SERVER` solo preselecciona una dirección y no contiene credenciales.

La app valida la clave antes de guardarla y la vincula al origen exacto del servidor. Cerrar sesión elimina la credencial del dispositivo. No hay registro, recuperación por email ni permisos compartidos. Para sustituir una clave perdida, genera otra instalación de configuración en una ruta temporal y copia únicamente su `MOBILE_ACCESS_KEY_HASH` al servicio; conserva la clave de cifrado y reinicia el servicio. Los móviles necesitarán la nueva clave. Los tickets previos caducan en 30 segundos.

Para restaurar, detén el servicio antes de copiar SQLite o el volumen Docker y conserva `.env` por separado. Sin la clave de cifrado tendrás que volver a vincular los PC. Las claves privadas y archivos `.env` están excluidos de Git.

## Servicio instalado en este Mac mini

La instalación actual usa Node nativo, sin Docker ni acceso al NAS:

- URL móvil: `https://sergios-mac-mini.tail0b6ccb.ts.net` (Tailscale privado).
- Servidor en `127.0.0.1:3000`; conector en `100.73.102.62:9141`; Hermes headless en `127.0.0.1:9140`.
- Copia de ejecución en `~/Library/Application Support/Hermes Mobile`, separada del checkout en Documents para evitar el bloqueo de privacidad de macOS durante el autoarranque. Incluye `apps/mobile-server`, `apps/mobile-agent`, `apps/shared` y `deploy/mobile/mac/start-server.mjs`, con las dependencias ya instaladas.
- LaunchAgents `io.hildegon.hermes-mobile-server` e `io.hildegon.hermes-mobile` instalados en `~/Library/LaunchAgents`. Arrancan al iniciar sesión y se reinician si terminan.
- Configuración privada: `~/.config/hermes-mobile/server.env` (600). Base de datos: `~/.config/hermes-mobile/data/mobile.sqlite`. Conserva la clave de cifrado; no regenerarla al actualizar.

El servicio ya está activo con acceso local y este Mac mini está vinculado. La clave privada del móvil está en `~/.config/hermes-mobile/server.env.access-key` (600); `server.env` guarda su hash y una clave de cifrado separada. No copies la clave del conector al móvil.

Después de actualizar la configuración del servidor, reinícialo (501 es el UID local de Sergio):

```sh
launchctl kickstart -k gui/501/io.hildegon.hermes-mobile-server
```

Para obtener el QR, reinicia el conector en primer plano después de detener su LaunchAgent, utilizando el comando de la sección siguiente con `--pair`; al terminar la vinculación vuelve a arrancar su LaunchAgent. No ejecutes dos conectores con los mismos puertos.

El Mac debe permanecer encendido, despierto, conectado a Tailscale y con la sesión del usuario iniciada. Si se apaga, tampoco se podrán controlar los demás PC a través de este servicio. Para actualizar, detén ambos LaunchAgents, actualiza la copia de ejecución y vuelve a cargarlos; un git pull en Documents no cambia automáticamente el servicio instalado.

## Conectar un PC

Desde la raíz del fork, cambia las rutas, IP y URL por las de tu instalación:

```sh
npm --prefix apps/mobile-agent ci --workspaces=false
npm --prefix apps/mobile-agent start -- \
  --hermes /Users/sergio/.local/bin/hermes \
  --host 100.73.102.62 --port 9141 --hermes-port 9140 \
  --server https://sergios-mac-mini.tail0b6ccb.ts.net \
  --url http://100.73.102.62:9141 --name "Mac mini" --pair
```

El conector guarda su credencial propia en `~/.config/hermes-mobile/agent.json` (600), supervisa Hermes en loopback e imprime un QR/código de cinco minutos. En el móvil conectado al servicio: escanea o pega ese código y confirma nombre/dirección del PC. El móvil no recibe la credencial del conector. Nunca publiques el puerto 9140; el conector 9141 se liga a la IP privada y requiere su credencial.

Windows usa PowerShell/ConPTY y Linux/Bazzite el shell del usuario. Para autoarranque utiliza las plantillas de `deploy/mobile/agents/`, adaptando rutas y dirección. Los procesos persistentes arrancan sin `--pair`. No ejecutes un segundo conector en un puerto ocupado.

## Compilar Android

```sh
npm --prefix apps/mobile ci --workspaces=false
# Java 21 y Android SDK 36; ANDROID_HOME apunta al SDK.
npm --prefix apps/mobile run android:build
```

APK: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Android 8+ (API 26). No hace falta registrar la app en ningún servicio. Para distribución firma una build release con un keystore fuera de Git.

## Verificación y límites

```sh
npm --prefix apps/mobile-server run typecheck
npm --prefix apps/mobile-server test
npm --prefix apps/mobile-agent run typecheck
npm --prefix apps/mobile-agent test
npm --prefix apps/mobile test
npm --prefix apps/mobile run test:browser
```

Las pruebas cubren clave local, rechazo sin credenciales, conservación del cifrado, aislamiento, caducidad/tickets de uso único, límites del proxy, shell real, reconexión, revocación, borradores y aprobaciones. No hay bypass de autenticación en el APK.

Adjuntos/subidas: 8 MB. Hasta ocho terminales por conector, con recuperación durante 15 minutos desconectados. Revocar cierra los sockets e invalida tickets, pero no cancela una tarea ya lanzada. Pendientes: cámara QR física, suspensión/reconexión, estabilidad de 24 horas, restauración y conectores Windows/Linux en hardware.
