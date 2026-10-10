# Hermes Mobile

Cliente Android para controlar varios PC con Hermes mediante Google, un servicio personal en el NAS y Tailscale. Mantiene los conceptos y colores de Hermes Desktop, con navegación táctil entre chat, archivos, terminal, Git y ajustes. No modifica el motor de Hermes ni su instalación de escritorio.

## Estado

Implementados: login Google nativo/web, vinculación QR o código, selección de PC y perfil, sesiones persistentes y streaming, adjuntos, aprobaciones, interrupción, archivos con edición y descarga nativa, terminal con reconexión, Git y worktrees, configuración, skills y MCP. Los PC ejecutan los trabajos; el móvil puede desconectarse sin cerrar el chat.

El APK de desarrollo puede compilar sin Firebase y muestra una explicación de configuración pendiente. El acceso a agentes requiere Firebase configurado: no hay modo de acceso anónimo en producción. Las peticiones específicas de una ventana de escritorio (captura de pantalla, vista previa, tour) siguen requiriendo ese cliente.

## Preparar el login de Google

1. Crea un proyecto en Firebase Console y activa Authentication → Google. No necesitas Firestore ni una clave privada en el móvil.
2. Registra una aplicación Android con paquete `io.hildegon.hermesmobile`. Añade la huella SHA-1 del certificado de desarrollo (`./gradlew signingReport` en `android`) y, antes de distribuir, la del certificado de publicación.
3. Descarga `google-services.json` a `apps/mobile/android/app/`. Está excluido de Git. Registra también una app web y copia sus valores públicos en `.env.local` usando `.env.example` como plantilla. Esos valores identifican el proyecto; nunca copies credenciales administrativas a variables `VITE_*`.
4. Crea tu usuario Google en Authentication y copia su **UID de Firebase** en `MOBILE_OWNER_UID` del NAS. El UID no es tu email ni un identificador de GitHub. Solo ese UID puede listar/vincular/controlar equipos.
5. En desarrollo web autoriza `localhost` en Authentication y añade `http://127.0.0.1:5180` a `MOBILE_ALLOWED_ORIGINS`. Para la app instalada los orígenes son `https://localhost` y `http://localhost`.

## Instalar el servicio en el NAS

NAS confirmado: `actual`, Tailscale `100.81.111.88`, DNS `actual.tail0b6ccb.ts.net`.

Desde el checkout en el NAS:

```sh
cp deploy/mobile/.env.example deploy/mobile/.env
# Edita FIREBASE_PROJECT_ID, MOBILE_OWNER_UID y MOBILE_ENCRYPTION_KEY.
openssl rand -base64 32
docker compose -f deploy/mobile/compose.yaml up -d --build
tailscale serve --bg http://127.0.0.1:3000
```

La última orden publica HTTPS **dentro de tu tailnet**. Comprueba `tailscale serve status` antes de cambiar una configuración Serve que ya use el NAS. No actives Funnel todavía: ampliaría la superficie pública sin ser necesario para este uso.

El servicio consume un solo contenedor Node con SQLite, límite de 256 MB y logs rotados. No ejecuta modelos ni guarda transcripciones. Guarda los tokens de los conectores cifrados con AES-GCM; conserva una copia segura de la clave y del volumen `mobile-data`. Sin esa clave, la restauración requiere volver a vincular los PC. Para migrar, detén el contenedor antes de copiar el volumen y conserva su `.env` por separado.

## Conectar este Mac mini

Node 24–26 y Hermes con `hermes serve` son necesarios. Desde la raíz del fork:

```sh
npm --prefix apps/mobile-server ci --workspaces=false
npm --prefix apps/mobile-agent ci --workspaces=false
npm --prefix apps/mobile-agent start -- \
  --hermes /Users/sergio/.local/bin/hermes \
  --host 100.73.102.62 --port 9141 --hermes-port 9140 \
  --server https://actual.tail0b6ccb.ts.net \
  --url http://100.73.102.62:9141 --name "Mac mini" --pair
```

El conector guarda una credencial propia en `~/.config/hermes-mobile/agent.json` (permisos privados), arranca y supervisa su servidor Hermes en loopback, e imprime un QR/código que caduca en cinco minutos. En el móvil: configura el servidor, inicia sesión con Google, escanea y confirma el nombre/dirección del PC. En otros PC sustituye la IP Tailscale y el ejecutable Hermes. Windows usa PowerShell/ConPTY; Linux y Bazzite usan el shell del usuario.

Nunca publiques el puerto 9140: el servidor Hermes queda en `127.0.0.1`. El puerto 9141 requiere la credencial del conector y se liga a la IP Tailscale. El servicio NAS solo acepta destinos IPv4 de Tailscale, fija la IP al vincular y no sigue redirecciones. Revocar un equipo invalida los tickets pendientes y cierra los sockets activos. No mata una tarea ya ejecutándose ni un shell separado: ciérralo explícitamente antes de revocar si lo necesitas.

Para autoarranque utiliza las plantillas de `deploy/mobile/agents/`. Ajusta rutas de Node, fork, Hermes y la IP de cada PC; realiza la vinculación una vez en primer plano. No copies el token al archivo de servicio. Los agentes persistentes se arrancan sin `--pair`. macOS: LaunchAgent del usuario; Linux/Bazzite: systemd del usuario; Windows: tarea al iniciar sesión. El servicio comparte los datos de perfil de Hermes, pero conserva su propio proceso y no adopta un puerto ocupado.

## Compilar Android

```sh
npm --prefix apps/mobile ci --workspaces=false
# Requiere Java 21 y Android SDK 36; ANDROID_HOME apunta al SDK.
npm --prefix apps/mobile run android:build
```

APK: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Android 8+ (API 26). El proyecto Android ya está versionado; no repitas `cap add android`. Para distribución firma una build release con tu keystore, mantenido fuera de Git.

## Verificación

```sh
npm --prefix apps/mobile-server run typecheck
npm --prefix apps/mobile-server test
npm --prefix apps/mobile-agent run typecheck
npm --prefix apps/mobile-agent test
npm --prefix apps/mobile test
npm --prefix apps/mobile run test:browser
npm --prefix apps/mobile run build
```

Las pruebas comprueban cifrado, aislamiento por cuenta, caducidad, uso único y ruta exacta de tickets, rechazo de destinos externos, proxy HTTP/WebSocket, shell real, recuperación de terminal y revocación. La autenticación simulada vive únicamente en los tests; `src/main.ts` verifica tokens reales Google/Firebase.

Límites explícitos: adjuntos/subidas de 8 MB, hasta ocho terminales por conector, recuperación de un shell desconectado durante 15 minutos. Los chats sí persisten en Hermes. No se ha certificado todavía el login Google sin un proyecto real, el lector QR con cámara física, la suspensión de Android, ni Windows/Bazzite en hardware. Antes de uso continuo: probar suspensión/reconexión, restauración del NAS y una ejecución de 24 horas.
