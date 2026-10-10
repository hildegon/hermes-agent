import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import type WebSocket from 'ws'
import { timingSafeEqual } from 'node:crypto'
import { allowedPath, bridgeSockets, proxyHttp } from '../../mobile-server/src/proxy.ts'
import { Terminals } from './terminal.ts'

export interface ConnectorOptions { credential: string; backend: string; backendToken: () => Promise<string> }
export async function createConnector(options: ConnectorOptions) {
  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 * 1024 })
  const terminals = new Terminals()
  await app.register(websocket, { options: { maxPayload: 16 * 1024 * 1024 } })
  app.addHook('onRequest', async (request, reply) => {
    const supplied = Buffer.from(request.headers.authorization ?? ''), expected = Buffer.from(`Bearer ${options.credential}`)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply.code(401).send({ error: 'Connector authentication required' })
  })
  app.setErrorHandler((_error, _request, reply) => reply.code(502).send({ error: 'Hermes backend unavailable' }))
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body))
  app.get<{ Querystring: { terminal?: string; cwd?: string } }>('/mobile/terminal', { websocket: true }, (socket, request) => {
    try { terminals.attach(socket, request.query.terminal, request.query.cwd) } catch { socket.close(1011, 'Cannot start terminal') }
  })
  app.get('/api/ws', { websocket: true }, (socket, request) => {
    const queued: [WebSocket.RawData, boolean][] = []
    let bytes = 0
    const capture = (data: WebSocket.RawData, binary: boolean) => { bytes += Buffer.byteLength(data as Buffer); if (bytes > 1024 * 1024) socket.close(1009); else queued.push([data, binary]) }
    socket.on('message', capture)
    let disconnected = false
    socket.once('close', () => { disconnected = true })
    void options.backendToken().then(token => {
      if (disconnected) return
      const url = new URL(request.raw.url ?? '/api/ws', options.backend)
      url.protocol = 'ws:'; url.searchParams.set('token', token)
      bridgeSockets(socket, url.toString(), token)
      socket.off('message', capture)
      for (const [data, binary] of queued) socket.emit('message', data, binary)
    }).catch(() => socket.close(1011, 'Hermes unavailable'))
  })
  app.route({ method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'], url: '/api/*', handler: async (request, reply) => {
    const path = request.raw.url ?? ''
    if (!allowedPath(path.split('?')[0])) return reply.code(403).send({ error: 'Unsupported gateway endpoint' })
    if (request.body && !Buffer.isBuffer(request.body)) request.body = Buffer.from(JSON.stringify(request.body))
    const token = await options.backendToken()
    await proxyHttp(request, reply, options.backend, token, path)
  } })
  app.addHook('onClose', async () => terminals.close())
  return app
}
