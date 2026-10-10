# Verificación de Hermes Mobile — acceso independiente

La instalación actual sustituye el login Google/Firebase por una clave aleatoria de instalación. No requiere proyecto cloud ni registro externo.

- Servidor: 4 pruebas pasan, incluyendo generación de claves sin sobrescribir una instalación, conservación del cifrado, permisos 600 y acceso correcto/incorrecto.
- App: 4 pruebas unitarias y 4 pruebas de navegador pasan. Acceso local, persistencia tras recarga, logout, credencial vinculada al servidor, navegación/borradores, solicitudes restauradas y aprobación solo al mostrar Chat.
- TypeScript: servidor y app pasan. APK Android debug compilado sin dependencias Firebase.
- Servicio instalado en Application Support del Mac: HTTPS Tailscale válido, health 200, peticiones sin clave o con una incorrecta 401. Mac mini vinculado; proxy real de status y esquema de Hermes 200. La clave de cifrado existente se conserva.
- Autenticación retirada: Firebase, Firebase Admin, plugin Android y configuración Google Services eliminados. npm audit sin vulnerabilidades después de instalar las dependencias restantes.

La integración del conector con PTY, tickets, recuperación y revocación se comprobó en la primera implementación. Las capturas de workspace con fixtures están etiquetadas como prueba. Además, el APK nativo en emulador Android 36 pasó login con la clave real, conexión WebSocket al Hermes de este Mac y cierre de sesión; la credencial de prueba se eliminó del emulador. Las capturas nativas guardan esos estados reales.

Pendientes: cámara QR física, suspensión, estabilidad 24 horas, restauración y conectores Windows/Linux en hardware. El APK es debug; distribución final requiere firma release. El Mac debe permanecer encendido y despierto; el acceso remoto actual utiliza Tailscale.

## Samsung físico — 2026-10-11

Samsung S21 Ultra incorporado a la red privada existente con Tailscale oficial. Hermes Mobile pasó acceso con clave local y conexión WebSocket real al Mac mini; credencial y servidor conservados al actualizar el APK. La prueba física también pasó volver desde segundo plano y comprobar conexión activa. Se restauró el ajuste original de apagado de pantalla y se cerraron los puertos temporales de depuración.

La prueba física detectó conexión interrumpida después del bloqueo. El cliente ahora reinicia sus intentos cuando la app vuelve al primer plano. Una prueba de regresión falla en la versión anterior y pasa con el cambio; también verifica que el listener se retira al cerrar el cliente. La suspensión prolongada y estabilidad de 24 horas siguen pendientes.

## Estética Desktop Nous — 2026-10-11

Paleta clara/oscura extraída del tema Nous predeterminado en apps/shared/src/theme-presets.ts, marca original de apps/desktop/public con procedencia MIT embebida, tipografía de interfaz y tratamiento de controles/composer de Desktop adaptados a objetivos táctiles de 48px. La identidad se verificó contra el código y contrato de diseño de escritorio; no se ejecutó la app Electron en esta revisión.

Cuatro pruebas de navegador pasan. Capturas Chromium 390×844 clara/oscura y 1024×768 sin desbordamiento ni botones menores de 48px. APK compilado y verificado conectado al Mac mini en Samsung S21 Ultra. Detector web sin hallazgos. Revisión visual independiente: ship en el alcance estético tras corregir el contraste del autor en la burbuja clara (12,66:1). Documentación de diseño conservada y ampliada. Pendientes de esta revisión: tema claro nativo, escala de fuente Android aumentada y disposición con teclado abierto.

## Instalación limpia del conector — 2026-10-11

Reproducido «Missing: mobile-agent@0.1.0 from lock file» en una copia sin node_modules al instalar con npm --prefix sobre /tmp (ruta simbólica a /private/tmp). Reproducido con npm 11.16.0 y 11.19.0. El mismo manifiesto/lockfile instala 97 paquetes desde la carpeta del conector con npm ci --workspaces=false; también funciona --prefix con la ruta canónica. La guía usa ahora la carpeta del conector y el paquete autoriza únicamente los scripts de node-pty@1.1.0 para su compilación en Linux. No se cambian versiones ni se regenera el lockfile. La compilación nativa Linux y el arranque systemd siguen pendientes en el PC Bazzite.

La prueba de importación aislada detectó una dependencia de ejecución de ws resuelta desde mobile-server, que no se instala en el PC remoto. El puente ahora reutiliza el constructor WebSocket del cliente recibido; la importación del conector pasa sin node_modules del servidor central. Pasan las cinco pruebas existentes de agente/servidor (HTTP, WebSocket, terminal, reconexión, revocación, autenticación y límites de rutas) y ambas comprobaciones TypeScript.
