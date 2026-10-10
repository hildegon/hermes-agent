import importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('phone',Path(__file__).parent/'plugin/__init__.py');phone=importlib.util.module_from_spec(spec);spec.loader.exec_module(phone)
class PhoneTests(unittest.TestCase):
    def test_state_and_action_routes(self):
        with patch.object(phone,'bridge',return_value={'ok':True}) as bridge:
            self.assertTrue(json.loads(phone.phone_control({'action':'state'}))['ok']);bridge.assert_called_with('/state')
            phone.phone_control({'action':'launch','package':'com.android.settings'});bridge.assert_called_with('/action',{'action':'launch','package':'com.android.settings'})
    def test_failed_bridge_is_recoverable(self):
        with patch.object(phone,'bridge',side_effect=ConnectionError('Control stopped')):
            self.assertIn('Control stopped',json.loads(phone.phone_control({'action':'state'}))['error'])
    def test_invalid_token_never_contacts_server(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(Path,'home',return_value=Path(directory)),patch.object(phone.urllib.request,'urlopen') as request:
            home=Path(directory)/'.hermes';home.mkdir();(home/'phone-bridge.json').write_text('{"token":"short"}')
            self.assertIn('credential',json.loads(phone.phone_control({'action':'state'}))['error']);request.assert_not_called()

# The backend handshake must be protected as well as tool endpoints.
class RuntimeAuthTests(unittest.IsolatedAsyncioTestCase):
    async def test_http_and_socket_boundaries(self):
        spec=importlib.util.spec_from_file_location('runtime',Path(__file__).parent/'runtime.py');runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
        async def downstream(scope,receive,send):await send({'type':'accepted'})
        auth=runtime.PhoneAuth(downstream,'a'*43)
        for scope,expected in [({'type':'http','headers':[]},401),({'type':'http','headers':[(b'authorization',b'Bearer '+b'a'*43)]},'accepted'),({'type':'websocket','query_string':b'token=wrong'},1008),({'type':'websocket','query_string':b'token='+b'a'*43},'accepted')]:
            output=[]
            async def send(event):output.append(event)
            await auth(scope,None,send)
            self.assertEqual(output[0].get('status',output[0].get('code',output[0]['type'])),expected)

if __name__=='__main__':unittest.main()
