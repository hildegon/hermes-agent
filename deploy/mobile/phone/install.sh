#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
umask 077
: "${HERMES_PHONE_SETUP_TOKEN:?Start installation from Hermes Mobile}"
setup_url=http://127.0.0.1:8766/setup
setup_header="Authorization: Bearer $HERMES_PHONE_SETUP_TOKEN"
report() { curl --fail --silent --show-error -H "$setup_header" -H 'Content-Type: application/json' -d "{\"phase\":\"$1\"}" "$setup_url/status" >/dev/null; }
trap 'report error || true' ERR
mkdir -p "$HOME/hermes-phone" "$HOME/.termux"
props="$HOME/.termux/termux.properties"
touch "$props"
sed -i '/^[[:space:]]*allow-external-apps[[:space:]]*=/d' "$props"
printf '\nallow-external-apps=true\n' >> "$props"
termux-reload-settings
report dependencies || true
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get -o Dpkg::Options::=--force-confold install -y openssl proot-distro curl tar
report linux
if ! proot-distro login hermes-phone -- true >/dev/null 2>&1; then
  proot-distro install python:3.14-slim-bookworm --name hermes-phone
fi
# Core source is pinned; installation support files come from the installed APK.
source_archive="$HOME/hermes-phone/source.tar.gz"
curl --fail --location --retry 3 https://github.com/hildegon/hermes-agent/archive/b4ee08ed97.tar.gz -o "$source_archive"
for file in bridge.json start.sh runtime.py configure.py plugin/plugin.yaml plugin/__init__.py; do
  mkdir -p "$HOME/hermes-phone/$(dirname "$file")"
  curl --fail --silent --show-error --max-filesize 1048576 -H "$setup_header" "$setup_url/$file" -o "$HOME/hermes-phone/$file"
  case "$file" in
    bridge.json) expected='@SHA_BRIDGE@';;
    start.sh) expected='@SHA_START@';;
    runtime.py) expected='@SHA_RUNTIME@';;
    configure.py) expected='@SHA_CONFIGURE@';;
    plugin/plugin.yaml) expected='@SHA_MANIFEST@';;
    plugin/__init__.py) expected='@SHA_PLUGIN@';;
  esac
  actual=$(sha256sum "$HOME/hermes-phone/$file")
  if [ "${actual%% *}" != "$expected" ]; then report error || true; echo 'Installation resource verification failed' >&2; exit 1; fi
done
chmod 700 "$HOME/hermes-phone/start.sh"
report python
proot-distro login hermes-phone --bind "$HOME/hermes-phone:/phone" -- bash -lc '
  set -e
  umask 077
  if [ ! -f /opt/hermes/pyproject.toml ]; then
    mkdir -p /opt/hermes
    tar -xzf /phone/source.tar.gz --strip-components=1 -C /opt/hermes
  fi
  if [ ! -x /opt/hermes/.venv/bin/python ]; then python -m venv /opt/hermes/.venv; fi
  /opt/hermes/.venv/bin/pip install -e /opt/hermes
  mkdir -p /root/.hermes/plugins/android-phone /opt/hermes/deploy/mobile/phone
  cp /phone/plugin/* /root/.hermes/plugins/android-phone/
  cp /phone/runtime.py /opt/hermes/deploy/mobile/phone/runtime.py
  cp /phone/bridge.json /root/.hermes/phone-bridge.json
  /opt/hermes/.venv/bin/python /phone/configure.py
'
report starting
if ! curl --silent --max-time 3 http://127.0.0.1:9140/ -o /dev/null; then
  nohup bash "$HOME/hermes-phone/start.sh" > "$HOME/hermes-phone/runtime.log" 2>&1 </dev/null &
fi
report ready
printf '\nHermes preparado. Vuelve a Hermes Mobile para conectar tu proveedor de IA.\n'
