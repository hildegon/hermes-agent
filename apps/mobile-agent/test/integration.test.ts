import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import WebSocket from 'ws'
import { createConnector } from '../src/connector.ts'
import { createServer } from '../../mobile-server/src/server.ts'
import { Store } from '../../mobile-server/src/store.ts'

test('HTTP, WebSocket, shell, reconnect and revoke across both proxy hops', { timeout: 20000 }, async () => {
  const backend = Fastify()
  await backend.register(websocket)
  backend.get('/api/status', async request => ({ token: request.headers.authorization === 'Bearer local-secret' }))
  backend.get('/api/ws', { websocket: true }, (socket, request) => {
    assert.equal((request.query as { token: string }).token, 'local-secret')
    socket.on('message', data => socket.send(data))
  })
  const backendUrl = await backend.listen({ host: '127.0.0.1', port: 0 })
  const connector = await createConnector({ backend: backendUrl, credential: 'connector-secret', backendToken: async () => 'local-secret' })
  const connectorUrl = await connector.listen({ host: '127.0.0.1', port: 0 })
  const store = new Store(':memory:', randomBytes(32).toString('base64'))
  const central = await createServer({ store, ownerUid: 'owner', verify: async token => token, tailnetSuffix: '', allowedOrigins: [], allowLoopback: true })
  const centralUrl = await central.listen({ host: '127.0.0.1', port: 0 })
  const connections: WebSocket[] = []
  try {
    assert.equal((await fetch(`${connectorUrl}/api/status`)).status, 401)
    const pair = store.pairing('test', connectorUrl, 'connector-secret'), machine = store.confirm(pair.code, 'owner')!
    const response = await fetch(`${centralUrl}/v1/machines/${machine.id}/gateway/api/status`, { headers: { authorization: 'Bearer owner' } })
    assert.deepEqual(await response.json(), { token: true })
    console.log('HTTP verified')
    async function connect(path: string) {
      const ticket = store.ticket('owner', machine.id, path)
      const socket = new WebSocket(`${centralUrl.replace('http:', 'ws:')}/v1/machines/${machine.id}/gateway${path}${path.includes('?') ? '&' : '?'}ticket=${ticket}`)
      connections.push(socket)
      return socket
    }
    const rpc = await connect('/api/ws?profile=default')
    await once(rpc, 'open')
    const echoed = once(rpc, 'message'); rpc.send('immediate frame')
    assert.equal(String((await echoed)[0]), 'immediate frame')
    console.log('RPC verified')
    const terminal = await connect(`/mobile/terminal?cwd=${encodeURIComponent(homedir())}`)
    const ready = JSON.parse(String((await Promise.race([once(terminal, 'message'), once(terminal, 'close').then(([code, reason]) => { throw new Error(`Terminal closed: ${code} ${reason}`) })]))[0]))
    assert.equal(ready.type, 'ready')
    console.log('Terminal ready')
    const output = new Promise<void>(resolve => terminal.on('message', raw => { const event = JSON.parse(raw.toString()); if (event.type === 'output' && event.text.includes('MOBILE_PROOF')) resolve() }))
    terminal.send(JSON.stringify({ type: 'input', text: 'echo MOBILE_PROOF\r' }))
    await output
    console.log('Terminal output verified')
    terminal.close(); await once(terminal, 'close')
    const resumed = await connect(`/mobile/terminal?terminal=${ready.id}`)
    const replay = JSON.parse(String((await once(resumed, 'message'))[0]))
    assert.equal(replay.id, ready.id); assert.ok(replay.replay.includes('MOBILE_PROOF'))
    const expired = await connect('/mobile/terminal?terminal=00000000-0000-0000-0000-000000000000')
    assert.equal((await once(expired, 'close'))[0], 1008)
    const closed = once(rpc, 'close')
    await central.inject({ method: 'DELETE', url: `/v1/machines/${machine.id}`, headers: { authorization: 'Bearer owner' } })
    assert.equal((await closed)[0], 1008)
    assert.equal(store.machine(machine.id, 'owner'), undefined)
  } finally {
    for (const socket of connections) socket.terminate()
    await central.close(); await connector.close(); await backend.close(); store.close()
  }
})
