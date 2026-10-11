#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
umask 077
mode=${HERMES_LOCAL_ACTION:-${1:-start}}
case "$mode" in install|start|stop);; *) echo 'Invalid model action' >&2; exit 1;; esac
: "${HERMES_PHONE_SETUP_TOKEN:?Start from Hermes Mobile}"
folder="$HOME/hermes-phone"
mkdir -p "$folder"
header="Authorization: Bearer $HERMES_PHONE_SETUP_TOKEN"
report() { curl --fail --silent --show-error --max-time 10 -H "$header" -H 'Content-Type: application/json' -d "{\"phase\":\"$1\"}" http://127.0.0.1:8766/setup/status >/dev/null; }
trap 'report error || true' ERR
if [ "$mode" = install ]; then
  report dependencies
  if [ "$(dpkg-query -W -f='${Version}' llama-cpp 2>/dev/null || true)" != 0.6.0 ] || ! llama-server --version >/dev/null 2>&1; then
    printf 'deb https://packages.termux.dev/apt/termux-main stable main\n' > "$folder/model-sources.list"
    apt-get -o Dir::Etc::sourcelist="$folder/model-sources.list" -o Dir::Etc::sourceparts=- update
    DEBIAN_FRONTEND=noninteractive apt-get -o Dir::Etc::sourcelist="$folder/model-sources.list" -o Dir::Etc::sourceparts=- -o Dpkg::Options::=--force-confold install -y openssl curl libc++ llama-cpp=0.6.0
  fi
  if [ ! -f "$folder/model.gguf" ]; then
    free_kb=$(df -Pk "$folder" | awk 'NR==2 {print $4}')
    if [ "$free_kb" -lt 2097152 ]; then echo 'At least 2 GB of free storage is required' >&2; report error; exit 1; fi
    report downloading
    curl --fail --location --retry 3 --connect-timeout 20 --max-time 3600 --max-filesize 1834426016 -C - 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/90862c4b9d2787eaed51d12237eafdfe7c5f6077/Qwen3-1.7B-Q8_0.gguf?download=true' -o "$folder/model.part"
    report verifying
    printf '%s  %s\n' '061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a' "$folder/model.part" | sha256sum -c -
    mv "$folder/model.part" "$folder/model.gguf"
  fi
  report verifying
  printf '%s  %s\n' '061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a' "$folder/model.gguf" | sha256sum -c -
  for resource in bridge.json local-model.sh; do
    curl --fail --silent --show-error --max-filesize 1048576 -H "$header" "http://127.0.0.1:8766/setup/$resource" -o "$folder/$resource.model-tmp"
    case "$resource" in bridge.json) expected='@SHA_BRIDGE@';; local-model.sh) expected='@SHA_SELF@';; esac
    printf '%s  %s\n' "$expected" "$folder/$resource.model-tmp" | sha256sum -c -
  done
  sed -n 's/^{"token":"\([A-Za-z0-9_-]\{43\}\)"}$/\1/p' "$folder/bridge.json.model-tmp" > "$folder/local-model.key"
  printf '\n' >> "$folder/local-model.key"
  [ "$(wc -c < "$folder/local-model.key")" -eq 44 ]
  mv "$folder/local-model.sh.model-tmp" "$folder/local-model.sh"
  rm "$folder/bridge.json.model-tmp"
  chmod 700 "$folder/local-model.sh"
  report ready
elif [ "$mode" = start ]; then
  report starting
  [ -f "$folder/model.gguf" ] && [ -s "$folder/local-model.key" ]
  auth="Authorization: Bearer $(cat "$folder/local-model.key")"
  if ! curl --fail --silent --max-time 3 -H "$auth" http://127.0.0.1:8767/v1/models >/dev/null; then
    nohup llama-server -m "$folder/model.gguf" --alias hermes-phone-local --host 127.0.0.1 --port 8767 --api-key-file "$folder/local-model.key" -c 65536 --rope-scaling yarn --rope-scale 2 --yarn-orig-ctx 32768 --flash-attn on --cache-type-k q4_0 --cache-type-v q4_0 --parallel 1 --threads 4 --threads-batch 4 --jinja --reasoning-budget 0 > "$folder/local-model.log" 2>&1 </dev/null &
    echo $! > "$folder/local-model.pid"
    ready=false
    for attempt in $(seq 1 60); do
      if curl --fail --silent --max-time 2 -H "$auth" http://127.0.0.1:8767/v1/models >/dev/null; then ready=true; break; fi
      sleep 1
    done
    [ "$ready" = true ]
  fi
  report ready
else
  if [ -f "$folder/local-model.pid" ]; then
    pid=$(cat "$folder/local-model.pid")
    case "$pid" in ''|*[!0-9]*) report error; exit 1;; esac
    if kill -0 "$pid" 2>/dev/null; then
      command=$(tr '\0' ' ' < "/proc/$pid/cmdline")
      [[ "$command" == *llama-server* && "$command" == *"$folder/model.gguf"* && "$command" == *"--port 8767"* ]]
      kill -TERM "$pid"
    fi
    rm "$folder/local-model.pid"
  fi
  report stopped
fi
printf '\nVuelve a Hermes Mobile para ver el estado del modelo.\n'
