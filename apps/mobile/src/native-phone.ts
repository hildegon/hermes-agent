import { registerPlugin } from '@capacitor/core'
import { Api } from './api'
export interface PhoneStatus { accessibility: boolean; enabled: boolean; termux: boolean; device: string; allowed: string[]; phase: string; commandPermission: boolean; automaticSetup: boolean }
export const PhoneControl = registerPlugin<{
  status(): Promise<PhoneStatus>
  installTermux(): Promise<void>
  prepareRuntime(): Promise<void>
  appSettings(): Promise<void>
  copyLoginCode(options: { code: string }): Promise<void>
  openLogin(options: { url: string }): Promise<void>
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
    if (result.status >= 400) {
      let detail: { error?: unknown; detail?: unknown } = {}
      try { detail = JSON.parse(result.body) } catch { /* Non-JSON failures retain their status. */ }
      const message = typeof detail.error === 'string' ? detail.error : typeof detail.detail === 'string' ? detail.detail : `Hermes local respondió ${result.status}.`
      throw new Error(message)
    }
    return new Response(result.status === 204 ? null : result.body, { status: result.status, headers: { 'content-type': 'application/json' } })
  }
  override async socketUrl(_machine: string, path: string): Promise<string> {
    if (!path.startsWith('/api/ws?')) throw new Error('Canal local no compatible.')
    return (await PhoneControl.socket()).url
  }
}
export interface PhoneLogin { session_id: string; user_code: string; verification_url: string }
export async function configurePhoneProvider(api: PhoneApi, provider: string, model: string, key: string): Promise<PhoneLogin | null> {
  if(!model.trim()) throw new Error('Indica el modelo que quieres utilizar.')
  if(!['openai','openai-codex'].includes(provider)) throw new Error('Proveedor no compatible con este asistente.')
  if(provider==='openai') {
    if(!key.trim()) throw new Error('Introduce tu clave de API.')
    await api.gateway('this-phone','default','/api/credentials/pool','POST',{provider:'openai',api_key:key.trim()})
  }
  await api.gateway('this-phone','default','/api/config','PUT',{config:{model:{provider,default:model.trim(),base_url:provider==='openai-codex'?'https://chatgpt.com/backend-api/codex':'https://api.openai.com/v1'}}})
  return provider==='openai-codex' ? api.gateway<PhoneLogin>('this-phone','default','/api/providers/oauth/openai-codex/start','POST') : null
}

export async function startPhoneRuntime(): Promise<void> {
  await PhoneControl.startRuntime()
  for(let attempt=0;attempt<20;attempt++) {
    try { await PhoneControl.socket(); return } catch { /* Dispatch is not readiness; wait for the private handshake. */ }
    await new Promise(resolve=>setTimeout(resolve,1500))
  }
  throw new Error('Hermes no ha respondido al arranque. Pulsa Preparar Hermes para completar o reparar la instalación; después vuelve a iniciar. Si Termux muestra un error, vuelve a la app para consultar este aviso.')
}
