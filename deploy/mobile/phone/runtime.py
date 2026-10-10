"""Keep the desktop loopback handshake private on Android's shared loopback."""
import hmac
import json
import runpy
import re
from pathlib import Path
from urllib.parse import parse_qs

class PhoneAuth:
    def __init__(self, app, token):
        self.app, self.token = app, token

    async def __call__(self, scope, receive, send):
        if scope['type'] in ('http', 'websocket'):
            headers = dict(scope.get('headers', []))
            supplied = headers.get(b'authorization', b'')
            valid = hmac.compare_digest(supplied, ('Bearer ' + self.token).encode())
            if scope['type'] == 'websocket':
                query = parse_qs(scope.get('query_string', b'').decode('ascii', errors='replace'))
                valid = valid or hmac.compare_digest(query.get('token', [''])[0].encode(), self.token.encode())
            if not valid:
                if scope['type'] == 'websocket':
                    await send({'type': 'websocket.close', 'code': 1008})
                else:
                    await send({'type': 'http.response.start', 'status': 401, 'headers': [(b'content-type', b'application/json')]})
                    await send({'type': 'http.response.body', 'body': b'{"error":"Authentication required"}'})
                return
        await self.app(scope, receive, send)

if __name__ == '__main__':
    home = Path.home() / '.hermes'
    token = json.loads((home / 'phone-bridge.json').read_text())['token']
    if not isinstance(token, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
        raise ValueError('Invalid phone credential')
    import os
    os.environ['HERMES_SERVE_HEADLESS'] = '1'
    os.environ['HERMES_DASHBOARD_SESSION_TOKEN'] = token
    from hermes_cli.web_server import app
    os.environ.pop('HERMES_DASHBOARD_SESSION_TOKEN', None)
    app.add_middleware(PhoneAuth, token=token)
    import sys
    sys.argv = ['hermes', 'serve', '--host', '127.0.0.1', '--port', '9140']
    runpy.run_module('hermes_cli.main', run_name='__main__')
