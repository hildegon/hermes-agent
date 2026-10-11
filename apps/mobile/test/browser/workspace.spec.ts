import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

async function fixture(page: Page, resume = false, failTurn = false) {
  await page.addInitScript(() => { localStorage.setItem('mobile:server:v1', 'http://127.0.0.1:3000'); localStorage.setItem('mobile:access:v1', JSON.stringify({ server: 'http://127.0.0.1:3000', key: 'a'.repeat(43) })) })
  const replies: unknown[] = [], calls: string[] = []
  let askApproval = () => {}, approvalPending = false
  if (resume) await page.addInitScript(() => localStorage.setItem('mobile:session:http://127.0.0.1:3000:mac:default', 'stored'))
  await page.route('**/v1/**', async route => {
    const url = new URL(route.request().url())
    let body: unknown = {}
    if (url.pathname === '/v1/machines') body = { machines: [{ id: 'mac', name: 'Mac mini · prueba', url: 'http://100.73.102.62:9141' }, { id: 'ubuntu', name: 'Ubuntu · prueba', url: 'http://100.64.0.2:9141' }] }
    else if (url.pathname.endsWith('/ticket')) body = { ticket: 'fixture-ticket' }
    else if (url.pathname.endsWith('/api/fs/default-cwd')) body = { cwd: '/tmp/mobile-proof' }
    else if (url.pathname.endsWith('/api/fs/list')) body = { entries: [{ name: 'README.md', path: '/tmp/mobile-proof/README.md', isDirectory: false }] }
    else if (url.pathname.endsWith('/api/fs/read-text')) body = { path: '/tmp/mobile-proof/README.md', text: '# Prueba de archivos\n', binary: false, truncated: false }
    else if (url.pathname.endsWith('/api/git/status')) body = { branch: 'feature/mobile', ahead: 1, behind: 0, files: [{ path: 'README.md', status: 'M', staged: false, unstaged: true }] }
    else if (url.pathname.endsWith('/api/git/review/diff')) body = { diff: 'diff --git a/README.md b/README.md\n+Hermes Mobile' }
    else if (url.pathname.endsWith('/api/config/schema')) body = { fields: { model: { type: 'string', category: 'general', description: 'Modelo' }, 'agent.max_turns': { type: 'number', category: 'general', description: 'Máximo de turnos' }, 'agent.tags': { type: 'list', category: 'general', description: 'Etiquetas' } } }
    else if (url.pathname.endsWith('/api/config')) body = { model: 'modelo de prueba', agent: { max_turns: 50, tags: [] }, mcp_servers: {} }
    else if (url.pathname.endsWith('/api/skills')) body = [{ name: 'review', description: 'Revisar un cambio', enabled: true }]
    else if (url.pathname.endsWith('/api/mcp/servers')) body = { servers: [] }
    await route.fulfill({ json: body, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
  })
  await page.routeWebSocket('**/gateway/api/ws?*', ws => {
    askApproval = () => { approvalPending = true; ws.send(JSON.stringify({ jsonrpc: '2.0', id: 'approval-request', method: 'approval', params: { session_id: 'runtime' } })) }
    ws.onMessage(raw => {
      const frame = JSON.parse(String(raw)), method = frame.method
      if (!method) { replies.push(frame.result); return }
      calls.push(method)
      let result: unknown = {}
      if (method === 'profiles.list') result = { profiles: [{ name: 'default' }, { name: 'developer', display_name: 'Developer' }] }
      if (method === 'session.list') result = { sessions: [] }
      if (method === 'session.history') result = { messages: [] }
      if (method === 'session.resume') result = { session_id: 'runtime', stored_session_id: 'stored', messages: [], open_requests: [{ id: 'pending-question', method: 'clarify', params: { session_id: 'runtime', questions: [{ qid: 'folder', question: '¿Qué carpeta usamos?' }] } }] }
      if (method === 'session.create') result = { session_id: 'runtime', stored_session_id: 'stored', messages: [] }
      if (method === 'approval.pending') result = { approvals: approvalPending ? [{ request_id: 'approval-1', command: 'echo proof', description: 'Comando de prueba', choices: ['once', 'deny'] }] : [] }
      if (method === 'approval.respond') approvalPending = false
      if (method === 'prompt.submit') result = { status: 'streaming' }
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result }))
      if (method === 'prompt.submit' && failTurn) { ws.send(JSON.stringify({jsonrpc:'2.0',method:'event',params:{type:'message.complete',session_id:'runtime',payload:{status:'error',text:'El proveedor no está disponible.'}}})); return }
      if (method === 'prompt.submit') setTimeout(() => ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.delta', session_id: 'runtime', payload: { text: 'Respuesta de prueba: conexión lista.' } } })), 20)
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Mac mini/ }).click()
  await expect(page.getByRole('status')).toContainText('Conectado')
  return { replies, calls, askApproval: () => askApproval() }
}

test('mobile workspace operates across views and keeps the conversation', async ({ page }) => {
  await fixture(page)
  await page.getByRole('textbox', { name: 'Mensaje para Hermes' }).fill('Mensaje de prueba')
  await page.getByRole('button', { name: 'Enviar mensaje' }).click()
  await expect(page.getByText('Respuesta de prueba: conexión lista.')).toBeVisible()
  await page.screenshot({ path: '/tmp/hermes-workspace-chat.png' })
  await page.getByRole('button', { name: 'Archivos', exact: true }).click()
  await page.getByRole('button', { name: 'README.md', exact: true }).click()
  await expect(page.getByLabel('Contenido')).toHaveValue('# Prueba de archivos\n')
  await page.getByLabel('Contenido').fill('Borrador sin guardar')
  await page.screenshot({ path: '/tmp/hermes-workspace-files.png' })
  await page.getByRole('button', { name: 'Git', exact: true }).click()
  await expect(page.locator('.branch')).toBeVisible()
  await page.screenshot({ path: '/tmp/hermes-workspace-git.png' })
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(page.getByLabel('Modelo', { exact: true })).toHaveValue('modelo de prueba')
  await page.screenshot({ path: '/tmp/hermes-workspace-settings.png' })
  await page.getByRole('button', { name: 'Archivos', exact: true }).click()
  await expect(page.getByLabel('Contenido')).toHaveValue('Borrador sin guardar')
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(page.getByText('Respuesta de prueba: conexión lista.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await page.locator('button:visible').evaluateAll(buttons => buttons.every(button => { const bounds = button.getBoundingClientRect(); return bounds.width >= 48 && bounds.height >= 48 }))).toBe(true)
})

test('resume restores the unanswered request before adopting its runtime session', async ({ page }) => {
  const { replies } = await fixture(page, true)
  await page.getByLabel('¿Qué carpeta usamos?').fill('/tmp')
  await page.getByRole('button', { name: 'Responder', exact: true }).click()
  await expect.poll(() => replies).toContainEqual({ answers: { folder: '/tmp' } })
  await expect(page.getByText('Respuesta pendiente')).not.toBeVisible()
})


test('hidden chat alerts for approval and acknowledges only when shown', async ({ page }) => {
  const { calls, askApproval } = await fixture(page)
  await page.getByRole('textbox', { name: 'Mensaje para Hermes' }).fill('Prueba')
  await page.getByRole('button', { name: 'Enviar mensaje' }).click()
  await expect(page.getByText('Respuesta de prueba: conexión lista.')).toBeVisible()
  await page.getByRole('button', { name: 'Archivos', exact: true }).click()
  askApproval()
  const alert = page.getByRole('button', { name: 'Hermes necesita tu respuesta · Abrir chat' })
  await expect(alert).toBeVisible()
  expect(calls).not.toContain('approval.received')
  await alert.click()
  await expect.poll(() => calls).toContain('approval.received')
  await page.getByRole('button', { name: 'Permitir una vez', exact: true }).click()
  await expect(page.getByText('Hermes necesita tu aprobación')).not.toBeVisible()
  expect(calls).toContain('approval.respond')
})

test('connects with a local key, restores access after reload and logs out', async ({ page }) => {
  const key = 'a'.repeat(43)
  await page.route('**/v1/machines', route => route.fulfill({ status: route.request().headers().authorization === `Bearer ${key}` ? 200 : 401, json: { machines: [] } }))
  await page.goto('/')
  await page.getByLabel('Servidor privado').fill('http://127.0.0.1:3000')
  await page.getByLabel('Clave de acceso').fill('b'.repeat(43))
  await page.getByRole('button', { name: 'Conectar', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('La clave de acceso no es válida.')
  await page.getByLabel('Clave de acceso').fill(key)
  await page.getByRole('button', { name: 'Conectar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tus máquinas' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tus máquinas' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByLabel('Clave de acceso')).toHaveValue('')
})

test('shows terminal model failures instead of an empty successful chat', async ({page}) => {
  await fixture(page, false, true)
  await page.getByLabel('Mensaje para Hermes').fill('Prueba de error')
  await page.getByRole('button', {name:'Enviar mensaje'}).click()
  await expect(page.getByRole('alert')).toContainText('El proveedor no está disponible.')
  await expect(page.getByRole('button', {name:'Detener tarea'})).toHaveCount(0)
})
