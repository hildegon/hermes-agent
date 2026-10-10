import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import type WebSocket from 'ws'
import type { Store } from './store.ts'
import { allowedPath, bridgeSockets, proxyHttp, validateMachineUrl, websocketPaths } from './proxy.ts'

export interface ServerOptions {
  store: Store; ownerUid: string; tailnetSuffix: string; allowedOrigins: string[];
  verify: (token: string) => Promise<string>; allowLoopback?: boolean
}
interface PairBody { name: string; url: string; credential: string }
interface RouteParams { machine: string; '*': string }
const pairSchema = { type: 'object', additionalProperties: false, required: ['name', 'url', 'credential'], properties: {
  name: { type: 'string', minLength: 1, maxLength: 64 }, url: { type: 'string', maxLength: 256 }, credential: { type: 'string', minLength: 32, maxLength: 4096 },
} }
export async function createServer(options: ServerOptions) {
  const { store } = options
  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 * 1024, requestTimeout: 30_000 })
  await app.register(cors, { origin: options.allowedOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['authorization', 'content-type'] })
  await app.register(websocket, { options: { maxPayload: 16 * 1024 * 1024 } })
  const sockets = new Map<string, Set<WebSocket>>()
  const buckets = new Map<string, { started: number; count: number }>()
  app.addHook('onRequest', async (request, reply) => {
    const key = request.ip, now = Date.now()
    if (buckets.size > 2048) for (const [ip, bucket] of buckets) if (bucket.started < now - 60_000) buckets.delete(ip)
    let bucket = buckets.get(key)
    if (!bucket || bucket.started < now - 60_000) { bucket = { started: now, count: 0 }; buckets.set(key, bucket) }
    if (++bucket.count > 240) return reply.code(429).send({ error: 'Too many requests; try again in a minute' })
    reply.header('cache-control', 'no-store')
  })
  async function owner(request: { headers: { authorization?: string } }): Promise<string> {
    const value = request.headers.authorization
    if (!value?.startsWith('Bearer ')) throw Object.assign(new Error('Sign in with Google'), { statusCode: 401 })
    let uid: string
    try { uid = await options.verify(value.slice(7)) } catch { throw Object.assign(new Error('Google session expired'), { statusCode: 401 }) }
    if (uid !== options.ownerUid) throw Object.assign(new Error('This account is not authorized'), { statusCode: 403 })
    return uid
  }
  app.setErrorHandler((error, _request, reply) => { const failure = error as Error & { statusCode?: number }; reply.code(failure.statusCode ?? 500).send({ error: failure.statusCode && failure.statusCode < 500 ? failure.message : 'Request failed; check the server connection' }) })
  app.get('/health', async () => ({ ok: true }))
  app.post<{ Body: PairBody }>('/v1/pairings', { schema: { body: pairSchema } }, async (request, reply) => {
    let url: string
    try { url = await validateMachineUrl(request.body.url, options.tailnetSuffix, options.allowLoopback) } catch (error) { return reply.code(400).send({ error: (error as Error).message }) }
    return store.pairing(request.body.name.trim(), url, request.body.credential)
  })
  app.get<{ Params: { code: string } }>('/v1/pairings/:code/status', async (request, reply) => {
    const row = store.pairingStatus(request.params.code)
    return row ? { linked: Boolean(row.machine) } : reply.code(410).send({ error: 'Pairing expired' })
  })
  app.get<{ Params: { code: string } }>('/v1/pairings/:code', async (request, reply) => {
    await owner(request)
    const row = store.preview(request.params.code)
    return row ?? reply.code(410).send({ error: 'Pairing expired or already used' })
  })
  app.post<{ Params: { code: string } }>('/v1/pairings/:code/confirm', async (request, reply) => {
    const uid = await owner(request), pending = store.preview(request.params.code)
    if (!pending) return reply.code(410).send({ error: 'Pairing expired or already used' })
    const machine = store.confirm(request.params.code, uid)
    return machine ? { id: machine.id, name: machine.name, url: machine.url } : reply.code(410).send({ error: 'Pairing expired or already used' })
  })
  app.get('/v1/machines', async request => ({ machines: store.list(await owner(request)) }))
  app.delete<{ Params: { machine: string } }>('/v1/machines/:machine', async request => {
    const uid = await owner(request)
    store.revoke(request.params.machine, uid)
    for (const socket of sockets.get(request.params.machine) ?? []) socket.close(1008, 'Machine revoked')
    sockets.delete(request.params.machine)
    return { ok: true }
  })
  app.post<{ Params: { machine: string }; Body: { path: string } }>('/v1/machines/:machine/ticket', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['path'], properties: { path: { type: 'string', maxLength: 2048 } } } },
  }, async (request, reply) => {
    const uid = await owner(request)
    if (!store.machine(request.params.machine, uid)) return reply.code(404).send({ error: 'Machine unavailable' })
    const path = request.body.path, parsed = new URL(path, 'http://local')
    if (!path.startsWith('/') || parsed.origin !== 'http://local' || !websocketPaths.has(parsed.pathname) || /[\\%#]/.test(parsed.pathname)) return reply.code(400).send({ error: 'Unsupported WebSocket endpoint' })
    return { ticket: store.ticket(uid, request.params.machine, path) }
  })
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body))
  const gatewayRoute = {
    url: '/v1/machines/:machine/gateway/*',
    handler: async (request: import('fastify').FastifyRequest<{ Params: RouteParams }>, reply: import('fastify').FastifyReply) => {
      const uid = await owner(request), machine = store.machine(request.params.machine, uid)
      const raw = request.raw.url ?? '', prefix = `/v1/machines/${request.params.machine}/gateway`
      const path = raw.slice(prefix.length), endpoint = path.split('?')[0]
      if (!machine) return reply.code(404).send({ error: 'Machine unavailable' })
      if (!allowedPath(endpoint) || websocketPaths.has(endpoint)) return reply.code(403).send({ error: 'Unsupported gateway route' })
      if (request.body && !Buffer.isBuffer(request.body)) request.body = Buffer.from(JSON.stringify(request.body))
      try { await proxyHttp(request, reply, machine.url, machine.credential, path) } catch { reply.code(502).send({ error: 'PC unavailable; check Hermes and Tailscale' }) }
    },
    wsHandler: (socket: WebSocket, request: import('fastify').FastifyRequest<{ Params: RouteParams }>) => {
      const raw = request.raw.url ?? '', prefix = `/v1/machines/${request.params.machine}/gateway`
      const requested = new URL(raw.slice(prefix.length), 'http://local')
      const ticket = requested.searchParams.get('ticket') ?? ''
      requested.searchParams.delete('ticket')
      const path = requested.pathname + requested.search, uid = store.consumeTicket(ticket, request.params.machine, path)
      const machine = uid ? store.machine(request.params.machine, uid) : undefined
      if (!machine || !websocketPaths.has(requested.pathname)) { socket.close(1008, 'Invalid or expired ticket'); return }
      const group = sockets.get(machine.id) ?? new Set<WebSocket>()
      group.add(socket); sockets.set(machine.id, group)
      const url = new URL(path, machine.url); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      bridgeSockets(socket, url.toString(), machine.credential, () => { group.delete(socket); if (!group.size) sockets.delete(machine.id) })
    },
  }
  app.route<{ Params: RouteParams }>({ ...gatewayRoute, method: 'GET' })
  app.route<{ Params: RouteParams }>({ method: ['POST', 'PUT', 'DELETE'], url: gatewayRoute.url, handler: gatewayRoute.handler })
  app.addHook('onClose', async () => { for (const group of sockets.values()) for (const socket of group) socket.terminate() })
  return app
}
