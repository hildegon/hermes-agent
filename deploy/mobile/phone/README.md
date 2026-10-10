# Hermes on Android (experimental)

Hermes Mobile can chat with a Hermes backend running **inside the same phone**, and a user-enabled accessibility service exposes an authenticated loopback tool. No Mac, Tailscale, root, ADB or hosted account is required for normal operation. A network connection to the configured AI provider remains necessary; this is not an on-device language model.

Tested on a Samsung SM-G998B, Android 15, arm64, Termux 0.118.3, PRoot-Distro 5.9.0 and Python 3.14.8. Core Hermes is installed editable from this fork. The headless JSON-RPC server does not need a TUI/desktop/Node build.

## Installation

1. Install Termux from its official GitHub releases or F-Droid. Open it once. The older target SDK may require confirming Android's per-app installation warning.
2. Download this directory's `install.sh` from the fork, review it and run `bash install.sh` in Termux. It creates a separate `hermes-phone` Linux container and refuses to overwrite an existing runtime. Allow storage/time for the Linux image and Python dependencies. The first installation downloads the current `feature/mobile` source; it does not automatically update an installed runtime.
3. Run `proot-distro login hermes-phone -- /opt/hermes/.venv/bin/hermes setup` to configure your provider. Afterwards confirm that `/root/.hermes/config.yaml` still contains `plugins.enabled: [android-phone]` and `platform_toolsets.cli: [android_phone]` (merge these YAML sections with your model settings). Do not put credentials into Git or the APK. Prefer an independent provider login per device.
4. In Termux's `~/.termux/termux.properties`, set `allow-external-apps=true` and reload Termux settings. In Android's app permissions, allow Hermes Mobile to run Termux commands when requested.
5. Open **Este teléfono → Abrir permisos** in Hermes Mobile and enable its accessibility service. Android may require **Allow restricted settings** on the app's info page for a sideloaded APK.
6. Tap **Activar**, authorize the apps Hermes may operate, tap **Iniciar**, then **Comprobar Hermes local** until ready. Open the local chat. The server stays bound to `127.0.0.1:9140`; the control service uses `127.0.0.1:8766`. Start a task such as “Abre Ajustes y dime los apartados visibles sin cambiar nada”.

## Boundaries

Only apps selected by the owner can be read or operated. Each node action requires a recent screen snapshot. Password nodes are omitted. The control token lives in private app storage and is passed privately to Termux at startup. **Detener** disables phone actions immediately; it does not shut down the chat backend. Accessibility restarts start with control disabled. The runtime uses only the `default` profile; local terminal and filesystem tabs are not exposed in this version.

Android can terminate Termux in the background. Exclude Termux from battery optimization if uninterrupted operation is needed; this does not guarantee indefinite availability. Keep the phone unlocked for UI tasks. Secure windows, inaccessible controls and apps without usable accessibility trees may not work. Screenshot-based gestures, background autostart and offline inference are outside this version.

## Validation

`python3 deploy/mobile/phone/test_plugin.py`; `npm --prefix apps/mobile test`; Android debug build. On the actual Samsung: unauthenticated requests rejected (401), unauthorized app and stale snapshot rejected (400), Settings launch and scrolling succeeded, and the local Hermes chat used `android_phone` to report Settings sections without a desktop execution proxy. Provider settings were transferred privately from the owner's Mac by request; unrelated credentials were excluded.

The runtime wrapper additionally authenticates every HTTP route (including the desktop token handshake) and WebSocket connection: Android loopback is shared by apps, so binding locally alone does not protect it. The APK verifies its private credential against the backend handshake. Running plain `hermes serve` without this wrapper is not supported by local mode.
