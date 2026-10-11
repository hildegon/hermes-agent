// Prepared debug device, stopped local backend and Termux command permission denied.
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
  const before=await page.evaluate(()=>window.Capacitor.nativePromise('PhoneControl','status',{}))
  assert.equal(before.commandPermission,false)
  assert.equal(before.accessibility,true)
  assert.equal(before.enabled,false)
  await assert.rejects(page.evaluate(()=>window.Capacitor.nativePromise('PhoneControl','socket',{})))
  const local=page.getByRole('button',{name:/Este teléfono|Usar Hermes en este teléfono/})
  if(await local.count())await local.click()
  const setup=page.getByRole('button',{name:'Preparación',exact:true})
  if(await setup.count())await setup.click()
  await page.getByRole('button',{name:'Iniciar',exact:true}).click()
  const deadline=Date.now()+45000
  let ready=false
  while(Date.now()<deadline){
    try{ready=await page.evaluate(async()=>{const socket=await window.Capacitor.nativePromise('PhoneControl','socket',{});return socket.url.startsWith('ws://127.0.0.1:9140/api/ws?')});if(ready)break}catch{}
    await new Promise(resolve=>setTimeout(resolve,1000))
  }
  assert.equal(ready,true,'The fixed accessibility start must launch the authenticated backend')
  run('shell','am','start','-n','io.hildegon.hermesmobile/.MainActivity')
  await page.getByRole('button',{name:'En ejecución',exact:true}).waitFor({timeout:15000})
  const after=await page.evaluate(()=>window.Capacitor.nativePromise('PhoneControl','status',{}))
  assert.equal(after.commandPermission,false,'Start must work without granting RUN_COMMAND')
  assert.equal(after.enabled,false,'Start must not activate agent UI control')
  console.log('App starts authenticated local Hermes without Termux command permission; agent UI control remains stopped.')
} finally {
  await browser?.close()
  run('forward','--remove','tcp:9224')
}
