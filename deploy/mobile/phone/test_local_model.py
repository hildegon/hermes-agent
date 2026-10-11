"""Small trust-boundary checks for the bundled model lifecycle script."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('local-model.sh')

class ModelScriptTest(unittest.TestCase):
    def test_invalid_action_and_missing_setup_credential(self):
        for action, token in [('arbitrary', 'test'), ('install', '')]:
            env = dict(os.environ, HERMES_LOCAL_ACTION=action, HERMES_PHONE_SETUP_TOKEN=token)
            self.assertNotEqual(subprocess.run(['bash', str(SCRIPT)], env=env, capture_output=True).returncode, 0)

    def test_stop_refuses_unrelated_process(self):
        with tempfile.TemporaryDirectory() as home:
            folder = Path(home) / 'hermes-phone'
            folder.mkdir()
            pidfile = folder / 'local-model.pid'
            pidfile.write_text(str(os.getpid()))
            binary = Path(home) / 'bin'
            binary.mkdir()
            curl = binary / 'curl'
            curl.write_text('#!/bin/sh\nexit 0\n')
            curl.chmod(0o700)
            env = dict(os.environ, HOME=home, PATH=str(binary)+':'+os.environ['PATH'], HERMES_LOCAL_ACTION='stop', HERMES_PHONE_SETUP_TOKEN='test')
            result = subprocess.run(['bash', str(SCRIPT)], env=env, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            os.kill(os.getpid(), 0)
            self.assertTrue(pidfile.exists())

if __name__ == '__main__':
    unittest.main()
