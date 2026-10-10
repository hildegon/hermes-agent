// Run against an unlocked, prepared Android debug app: node scripts/phone-setup-smoke.mjs SERIAL
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright-core'
const serial=process.argv[2]
assert.ok(serial, 'An explicit test device serial is required')
const adb=process.env.ADB || 'adb'
const run=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8'})
const pid=run('shell','pidof','io.hildegon.hermesmobile').trim()
run('forward','tcp:9224','localabstract:webview_devtools_remote_'+pid)
run('forward','tcp:18766','tcp:8766')
let browser
try {
  browser=await chromium.connectOverCDP('http://127.0.0.1:9224',{noDefaults:true})
  const page=browser.contexts()[0].pages()[0]
  const state=await page.evaluate(async()=>{
    const status=await window.Capacitor.nativePromise('PhoneControl','status',{})
    const socket=await window.Capacitor.nativePromise('PhoneControl','socket',{})
    return {phase:status.phase,enabled:status.enabled,privateBackend:socket.url.startsWith('ws://127.0.0.1:9140/api/ws?')}
  })
  assert.equal(state.phase,'ready')
  assert.equal(state.enabled,false,'Setup must not silently enable agent actions')
  assert.equal(state.privateBackend,true)
  assert.equal((await fetch('http://127.0.0.1:18766/setup/bridge.json')).status,401)
  assert.equal((await fetch('http://127.0.0.1:18766/setup/install.sh',{headers:{Authorization:'Bearer wrong'}})).status,401)
  const files=run('shell','run-as','io.hildegon.hermesmobile','ls','shared_prefs').trim().split('\n')
  for(const file of files){
    const prefs=run('shell','run-as','io.hildegon.hermesmobile','cat','shared_prefs/'+file)
    assert.ok(!prefs.includes('name="setupNonce"'),'Temporary setup authorization must be revoked')
  }
  console.log('Phone setup passed: ready, private backend, stopped actions, rejected unauthenticated requests, revoked setup authorization.')
} finally {
  await browser?.close()
  run('forward','--remove','tcp:9224')
  run('forward','--remove','tcp:18766')
}
