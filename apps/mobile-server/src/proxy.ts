import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'
import type WebSocket from 'ws'
import type { FastifyReply, FastifyRequest } from 'fastify'

export const websocketPaths = new Set(['/api/ws', '/mobile/terminal'])
const apiFamilies = new Set(['status', 'fs', 'files', 'media', 'chat', 'git', 'config', 'env', 'profiles', 'model', 'skills', 'mcp', 'tools', 'providers', 'cron', 'projects', 'sessions'])
export function allowedPath(path: string): boolean {
  if (/[\\%#]/.test(path) || path.split('/').some(part => part === '.' || part === '..')) return false
  return websocketPaths.has(path) || (path.startsWith('/api/') && apiFamilies.has(path.split('/')[2]))
}
export function isTailnetAddress(address: string): boolean {
  const octets = address.split('.').map(Number)
  return isIP(address) === 4 && octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127
}
export async function validateMachineUrl(value: string, suffix: string, allowLoopback = false): Promise<string> {
  const url = new URL(value)
  if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use a machine base URL without credentials, path or query')
  const host = url.hostname.toLowerCase()
  if (allowLoopback && host === '127.0.0.1') return url.origin
  if (!isTailnetAddress(host) && (!suffix || !host.endsWith(`.${suffix}`))) throw new Error('Machine must belong to the configured Tailscale network')
  const addresses = await lookup(host, { all: true, family: 4 })
  if (!addresses.length || addresses.some(item => !isTailnetAddress(item.address))) throw new Error('Machine DNS must resolve exclusively to Tailscale IPv4 addresses')
  // Pin the route to the validated address: a DNS change must never redirect credentials.
  url.hostname = addresses[0].address
  return url.origin
}
export async function proxyHttp(request: FastifyRequest, reply: FastifyReply, base: string, credential: string, path: string): Promise<void> {
  const headers: Record<string, string> = { authorization: `Bearer ${credential}` }
  for (const name of ['content-type', 'range']) {
    const value = request.headers[name]
    if (typeof value === 'string') headers[name] = value
  }
  const controller = new AbortController()
  reply.raw.on('close', () => controller.abort())
  const response = await fetch(`${base}${path}`, {
    method: request.method, headers, redirect: 'manual', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body ? new Uint8Array(request.body as Buffer) : undefined,
  })
  if (response.status >= 300 && response.status < 400) { reply.code(502).send({ error: 'Gateway redirects are not permitted' }); return }
  reply.code(response.status)
  for (const name of ['content-type', 'content-range', 'content-disposition', 'accept-ranges']) {
    const value = response.headers.get(name)
    if (value) reply.header(name, value)
  }
  reply.header('cache-control', 'no-store')
  if (!response.body) { reply.send(); return }
  await reply.send(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]))
}
export function bridgeSockets(client: WebSocket, url: string, credential: string, onClosed?: () => void) {
  const Socket = client.constructor as typeof WebSocket
  const upstream = new Socket(url, { headers: { authorization: `Bearer ${credential}` }, maxPayload: 16 * 1024 * 1024, handshakeTimeout: 15_000 })
  const queued: { data: WebSocket.RawData; binary: boolean }[] = []
  let queuedBytes = 0
  function forward(target: WebSocket, data: WebSocket.RawData, binary: boolean) {
    if (target.bufferedAmount > 8 * 1024 * 1024) { client.close(1013, 'Slow connection'); upstream.close(); return }
    if (target.readyState === Socket.OPEN) target.send(data, { binary })
  }
  client.on('message', (data, binary) => {
    if (upstream.readyState === Socket.CONNECTING) {
      queuedBytes += Buffer.byteLength(data as Buffer)
      if (queuedBytes > 1024 * 1024) { client.close(1009, 'Too much pending data'); upstream.close(); return }
      queued.push({ data, binary })
    } else forward(upstream, data, binary)
  })
  upstream.on('open', () => { for (const item of queued) forward(upstream, item.data, item.binary); queued.length = 0 })
  upstream.on('message', (data, binary) => forward(client, data, binary))
  upstream.on('error', () => client.close(1011, 'Gateway connection failed'))
  client.on('error', () => upstream.close())
  client.on('close', () => { upstream.close(); onClosed?.() })
  upstream.on('close', (code) => client.close([1000, 1008, 1009, 1013].includes(code) ? code : 1011, 'Gateway disconnected'))
  return upstream
}
