# Hermes on Android (experimental)

Open **Este teléfono** in Hermes Mobile to prepare the local agent. You do not need a desktop, Tailscale, ADB or terminal commands. Android still requires you to confirm installation and grant accessibility permissions in its own screens. The AI provider normally requires internet access; this is not an on-device language model.

## Setup from the app

1. Tap **Instalar entorno**. Hermes Mobile downloads a pinned official Termux arm64 APK, verifies SHA-256 and opens Android's installer. If prompted, allow installation from Hermes Mobile. Open Termux once to initialize it, then return to Hermes Mobile.
2. Tap **Abrir permisos** and enable **Hermes · Control del teléfono**. If Android restricts the sideloaded app, use **Abrir ficha de la app**, open ⋮ and allow restricted settings. Return to Hermes Mobile.
3. Tap **Preparar Hermes**. The app opens a NEW Termux terminal and enters its fixed, bundled installer using Android's accessibility input-method API. This explicit setup action is separate from agent tools: the agent cannot authorize or operate Termux. The installer enables Termux integration, installs Linux/Python/Hermes and reports progress back to the app. Keep the phone unlocked; downloads and installation may take several minutes. You may return to Hermes Mobile to follow progress.
4. In **Proveedor de IA**, connect a ChatGPT account using its device-code login, or enter an OpenAI API key and model. Login opens the provider's HTTPS page, with a **Copiar código** button. Hermes Mobile polls completion. Existing providers, profile data and credentials are preserved during repair.
5. Activate phone control, select authorized apps and open the local chat. **Detener** immediately disables UI actions while leaving chat running. On subsequent launches, **Iniciar** starts the prepared agent. If Android has not granted the custom Termux command permission, Android 13+ opens a fresh Termux session and enters only the fixed background start command through the setup input-method integration. Keep the device unlocked and return to Hermes Mobile after launch; there is no extra permission to find in Settings. If the command permission was already granted, the existing Termux service path is used.

Automatic preparation requires Android 13+ and arm64. The Pixel 8 Pro meets these platform requirements; it has not been directly tested. The Android APK and Samsung SM-G998B / Android 15 were tested, and a fresh arm64 Android emulator completed the automatic Linux/Python/Hermes installation.

## Security and implementation

Core source is pinned to commit `b4ee08ed97`; installation support files are packaged in the APK. Setup assets are checked against hashes generated from those packaged files, including the private bridge configuration: another app taking over a loopback port cannot substitute installation code or credentials. The temporary installation authorization expires after an hour and is revoked on completion or failure. Setup routes are separate from agent action routes and do not require activating phone control.

The runtime is in Termux-private storage inside `hermes-phone`. Only explicitly selected apps can be read or operated; password nodes are omitted and node actions need a recent screen snapshot. The default profile is used in local chat. Accessibility restarts leave control stopped. Every HTTP route (including the desktop handshake) and WebSocket is authenticated, because Android loopback is shared between apps. The APK verifies its own private credential against the backend handshake. Running plain `hermes serve` without this wrapper is not supported.

Termux battery restrictions can interrupt operation; this is not a guarantee of unattended availability. Screenshots, pixel gestures, offline inference, local terminal/filesystem tabs and automatic boot after restarting Android are outside this version. Desktop remote mode retains its existing capabilities.

## Validation

`python3 deploy/mobile/phone/test_plugin.py` (Python 3.11+ with the project YAML dependency), mobile Vitest tests and Android debug build. Tests cover preservation of existing model/tool configuration, invalid configuration without overwrite, OAuth request contract, incomplete forms without credential writes, and private backend boundaries. On Samsung, the app dispatched preparation through accessibility into a fresh Termux session, and native setup/error UI was inspected. A fresh emulator completed installation without any typed shell commands; Android confirmations were granted by test tooling. The fresh emulator also started the actual ChatGPT device-code flow from the UI and copied its code. `ADB=/path/to/adb node apps/mobile/scripts/phone-setup-smoke.mjs SERIAL` checks prepared debug devices for private backend readiness, stopped actions, unauthorized setup rejection and revoked setup authorization. Actual Google Pixel hardware and human completion of a new ChatGPT account login remain untested.

`ADB=/path/to/adb node apps/mobile/scripts/phone-start-smoke.mjs SERIAL` checks a prepared debug device with a stopped backend and denied Termux command permission. It starts Hermes from the UI, verifies the authenticated local handshake and checks that command permission remains denied and agent UI control remains stopped.
