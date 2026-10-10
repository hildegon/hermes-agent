import { registerPlugin } from '@capacitor/core'
import { Api } from './api'
export interface PhoneStatus { accessibility: boolean; enabled: boolean; termux: boolean; device: string; allowed: string[] }
export const PhoneControl = registerPlugin<{
  status(): Promise<PhoneStatus>
  permissions(): Promise<void>
  setEnabled(options: { enabled: boolean }): Promise<void>
  applications(): Promise<{ apps: { package: string; name: string }[] }>
  allowApps(options: { apps: string[] }): Promise<void>
  startRuntime(): Promise<void>
  gateway(options: { path: string; method: string; body?: string }): Promise<{ status: number; body: string }>
  socket(): Promise<{ url: string }>
}>('PhoneControl')
export class PhoneApi extends Api {
  constructor() { super('http://127.0.0.1:9140') }
  override async response(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<Response> {
    signal?.throwIfAborted()
    if (body instanceof FormData) throw new Error('La subida de archivos local todavía no está disponible.')
    const gateway = path.match(/^\/v1\/machines\/this-phone\/gateway(\/api\/.*)$/)?.[1]
    if (!gateway) throw new Error('Ruta local no compatible.')
    const result = await PhoneControl.gateway({ path: gateway, method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    signal?.throwIfAborted()
    if (result.status >= 400) throw new Error(`Hermes local respondió ${result.status}.`)
    return new Response(result.status === 204 ? null : result.body, { status: result.status, headers: { 'content-type': 'application/json' } })
  }
  override async socketUrl(_machine: string, path: string): Promise<string> {
    if (!path.startsWith('/api/ws?')) throw new Error('Canal local no compatible.')
    return (await PhoneControl.socket()).url
  }
}
