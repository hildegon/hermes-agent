import { JsonRpcGatewayClient } from '@hermes/shared'
import { accessToken } from './auth'
export interface Machine { id: string; name: string; url: string }
export interface Pairing { version: number; server: string; code: string }
export function serverUrl(value: string): string {
  const url = new URL(value)
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Usa una dirección HTTPS de Tailscale Serve, sin ruta ni credenciales.')
  return url.origin
}
export function parsePairing(value: string, expectedServer: string): Pairing {
  const parsed = JSON.parse(value) as Pairing
  if (parsed.version !== 1 || serverUrl(parsed.server) !== serverUrl(expectedServer) || !/^[A-Za-z0-9_-]{32}$/.test(parsed.code)) throw new Error('Este QR no pertenece a tu servidor o ya no es válido.')
  return parsed
}
export class Api {
  readonly server: string
  constructor(server: string, private token = accessToken) { this.server = serverUrl(server) }
  async request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.response(path, method, body, signal)
    return response.status === 204 ? undefined as T : response.json() as Promise<T>
  }
  async response(path: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
    const form = body instanceof FormData
    const response = await fetch(`${this.server}${path}`, { method, signal, headers: { authorization: `Bearer ${await this.token(this.server)}`, ...(!form && body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : form ? body : JSON.stringify(body) })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string; detail?: string }
      throw new Error(payload.error || payload.detail || `La petición falló (${response.status}).`)
    }
    return response
  }
  gateway<T>(machine: string, profile: string, path: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
    return this.request<T>(this.gatewayPath(machine, profile, path), method, body, signal)
  }
  gatewayPath(machine: string, profile: string, path: string) {
    return `/v1/machines/${encodeURIComponent(machine)}/gateway${path}${path.includes('?') ? '&' : '?'}profile=${encodeURIComponent(profile)}`
  }
  async socketUrl(machine: string, path: string) {
    const { ticket } = await this.request<{ ticket: string }>(`/v1/machines/${encodeURIComponent(machine)}/ticket`, 'POST', { path })
    const url = new URL(`/v1/machines/${encodeURIComponent(machine)}/gateway${path}`, this.server)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('ticket', ticket)
    return url.toString()
  }
}
export class AgentConnection {
  readonly client = new JsonRpcGatewayClient({ connectTimeoutMs: 15_000 })
  private timer: ReturnType<typeof setTimeout> | undefined
  private disposed = false
  private attempts = 0
  private connecting = false
  private unwatch: () => void
  constructor(readonly api: Api, readonly machine: string, readonly profile: string) {
    this.unwatch = this.client.onState(state => {
      if (state === 'open') this.attempts = 0
      if ((state === 'closed' || state === 'error') && !this.connecting) this.retry()
    })
  }
  private retry() {
    if (this.disposed || this.timer || this.attempts >= 5) return
    this.timer = setTimeout(() => { this.timer = undefined; void this.connect().catch(() => {}) }, Math.min(1000 * 2 ** this.attempts++, 15000))
  }
  async connect() {
    if (this.disposed || this.connecting) return
    this.connecting = true
    try {
      const url = await this.api.socketUrl(this.machine, `/api/ws?profile=${encodeURIComponent(this.profile)}`)
      if (!this.disposed) await this.client.connect(url)
    } finally { this.connecting = false; if (!this.disposed && this.client.connectionState !== 'open') this.retry() }
  }
  close() { this.disposed = true; if (this.timer) clearTimeout(this.timer); this.unwatch(); this.client.close() }
}
