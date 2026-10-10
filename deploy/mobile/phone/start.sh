#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
umask 077
# PRoot provides Linux wheels while upstream's native Android package is unavailable.
exec proot-distro login hermes-phone --bind "$HOME/hermes-phone:/phone" -- bash -lc '
  set -e
  umask 077
  mkdir -p /root/.hermes
  if [ -f /phone/bridge.json ]; then cp /phone/bridge.json /root/.hermes/phone-bridge.json; chmod 600 /root/.hermes/phone-bridge.json; fi
  export PATH=/opt/hermes/.venv/bin:$PATH
  cd /opt/hermes
  exec /opt/hermes/.venv/bin/python /opt/hermes/deploy/mobile/phone/runtime.py
'
