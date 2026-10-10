"""Enable the phone plugin without replacing an existing provider or profile data."""
import os
from pathlib import Path
import hermes_yaml as yaml

def configure(home):
    path = Path(home) / 'config.yaml'
    config = yaml.safe_load(path.read_text()) if path.exists() else {
        'model': {'provider': 'openai-codex', 'default': 'gpt-6-luna', 'base_url': 'https://chatgpt.com/backend-api/codex'},
        'language': 'es',
    }
    if not isinstance(config, dict):
        raise ValueError('Existing configuration is invalid; it was not changed')
    enabled = config.setdefault('plugins', {}).setdefault('enabled', [])
    tools = config.setdefault('platform_toolsets', {}).setdefault('cli', [])
    if not isinstance(enabled, list) or not isinstance(tools, list):
        raise ValueError('Existing plugin/tool configuration is invalid; it was not changed')
    if 'android-phone' not in enabled: enabled.append('android-phone')
    if 'android_phone' not in tools: tools.append('android_phone')
    temporary = path.with_suffix('.phone-setup.tmp')
    temporary.write_text(yaml.safe_dump(config))
    temporary.chmod(0o600)
    os.replace(temporary, path)

if __name__ == '__main__':
    home = Path.home() / '.hermes'
    home.mkdir(parents=True, exist_ok=True)
    configure(home)
