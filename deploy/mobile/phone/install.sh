#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
umask 077
# Run in Termux. Keep all credentials and runtime files in app-private storage.
pkg install -y proot-distro curl tar
mkdir -p "$HOME/hermes-phone"
source_archive="$HOME/hermes-phone/source.tar.gz"
curl --fail --location --retry 3 https://github.com/hildegon/hermes-agent/archive/refs/heads/feature/mobile.tar.gz -o "$source_archive"
if ! proot-distro login hermes-phone -- true >/dev/null 2>&1; then
  proot-distro install python:3.14-slim-bookworm --name hermes-phone
fi
proot-distro login hermes-phone --bind "$HOME/hermes-phone:/phone" -- bash -lc '
  set -e
  umask 077
  if [ -e /opt/hermes ]; then echo "Runtime already exists; refusing to overwrite it." >&2; exit 1; fi
  mkdir -p /opt/hermes
  tar -xzf /phone/source.tar.gz --strip-components=1 -C /opt/hermes
  python -m venv /opt/hermes/.venv
  /opt/hermes/.venv/bin/pip install -e /opt/hermes
  mkdir -p /root/.hermes/plugins/android-phone
  cp /opt/hermes/deploy/mobile/phone/plugin/* /root/.hermes/plugins/android-phone/
  cp /opt/hermes/deploy/mobile/phone/start.sh /phone/start.sh
  chmod 700 /phone/start.sh
  if [ ! -e /root/.hermes/config.yaml ]; then
    printf "plugins:\n  enabled: [android-phone]\nplatform_toolsets:\n  cli: [android_phone]\n" > /root/.hermes/config.yaml
  fi
'
printf '\nRuntime installed. Configure your provider with:\nproot-distro login hermes-phone -- /opt/hermes/.venv/bin/hermes setup\n'
printf '\nThen enable Termux external commands and Hermes Mobile phone control; see README.md.\n'
