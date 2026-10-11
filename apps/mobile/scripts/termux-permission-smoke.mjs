// Prepared debug device with Termux permission denied; confirms the actual Android permission dialog.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright-core'
const serial=process.argv[2], adb=process.env.ADB || 'adb'
assert.ok(serial,'An explicit test device serial is required')
const run=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8'})
const pid=run('shell','pidof','io.hildegon.hermesmobile').trim()
run('forward','tcp:9224','localabstract:webview_devtools_remote_'+pid)
let browser
try {
  browser=await chromium.connectOverCDP('http://127.0.0.1:9224',{noDefaults:true})
  const page=browser.contexts()[0].pages()[0]
  const status=await page.evaluate(()=>window.Capacitor.nativePromise('PhoneControl','status',{}))
  assert.equal(status.commandPermission,false,'Run on a device where Termux permission is not yet granted')
  await page.evaluate(()=>window.Capacitor.nativePromise('PhoneControl','socket',{}))
  const local=page.getByRole('button',{name:/Este teléfono|Usar Hermes en este teléfono/})
  if(await local.count())await local.click()
  const setup=page.getByRole('button',{name:'Preparación',exact:true})
  if(await setup.count())await setup.click()
  await page.getByRole('button',{name:'Autorizar Termux',exact:true}).click()
  run('shell','uiautomator','dump','/data/local/tmp/hermes-permission-test.xml')
  const xml=run('shell','cat','/data/local/tmp/hermes-permission-test.xml')
  assert.ok(xml.includes('permissioncontroller'),'Android must show a permission dialog even when the local backend is running')
  assert.ok(/Termux/i.test(xml),'The dialog must name Termux')
  assert.ok(xml.includes('permission_allow_button'),'The user must have an explicit Allow action')
  console.log('Termux permission prompt appears from setup while Hermes is already running. Confirm or deny it on the device.')
} finally {
  await browser?.close()
  run('forward','--remove','tcp:9224')
  run('shell','rm','-f','/data/local/tmp/hermes-permission-test.xml')
}
