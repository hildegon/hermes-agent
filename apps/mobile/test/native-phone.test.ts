import { describe, expect, it, vi } from 'vitest'
const native = vi.hoisted(() => ({ gateway: vi.fn(), socket: vi.fn() }))
vi.mock('@capacitor/core', () => ({ registerPlugin: () => native }))
import { PhoneApi, configurePhoneProvider } from '../src/native-phone'
describe('local phone transport', () => {
  it('uses the native bridge and keeps the profile in the API request', async () => {
    native.gateway.mockResolvedValue({ status: 200, body: '{"ok":true}' })
    expect(await new PhoneApi().gateway('this-phone','default','/api/fs/default-cwd')).toEqual({ ok: true })
    expect(native.gateway).toHaveBeenCalledWith({ path: '/api/fs/default-cwd?profile=default', method: 'GET' })
  })
  it('rejects remote machine paths before calling native code', async () => {
    native.gateway.mockClear()
    await expect(new PhoneApi().gateway('another','default','/api/config')).rejects.toThrow('Ruta local')
    expect(native.gateway).not.toHaveBeenCalled()
  })
  it('shows recoverable backend validation errors', async () => {
    native.gateway.mockResolvedValue({ status: 400, body: '{"detail":"El modelo no está disponible"}' })
    await expect(new PhoneApi().gateway('this-phone','default','/api/config','PUT',{config:{}})).rejects.toThrow('El modelo no está disponible')
  })
  it('preserves native backend errors', async () => {
    native.gateway.mockResolvedValue({ status: 401, body: '{}' })
    await expect(new PhoneApi().gateway('this-phone','default','/api/config')).rejects.toThrow('401')
  })
})

describe('phone provider setup', () => {
  it('starts OAuth through the existing profile-scoped backend', async () => {
    const api=new PhoneApi(), gateway=vi.spyOn(api,'gateway').mockResolvedValueOnce({}).mockResolvedValueOnce({ session_id:'login',user_code:'test',verification_url:'https://auth.openai.com/codex/device' })
    const login=await configurePhoneProvider(api,'openai-codex','gpt-6-luna','')
    expect(login?.session_id).toBe('login')
    expect(gateway.mock.calls[0]).toEqual(['this-phone','default','/api/config','PUT',{config:{model:{provider:'openai-codex',default:'gpt-6-luna',base_url:'https://chatgpt.com/backend-api/codex'}}}])
    expect(gateway.mock.calls[1]).toEqual(['this-phone','default','/api/providers/oauth/openai-codex/start','POST'])
  })
  it('rejects incomplete forms before writing credentials', async () => {
    const api=new PhoneApi(), gateway=vi.spyOn(api,'gateway')
    await expect(configurePhoneProvider(api,'openai','gpt-test','')).rejects.toThrow('clave')
    await expect(configurePhoneProvider(api,'openai-codex','','')).rejects.toThrow('modelo')
    expect(gateway).not.toHaveBeenCalled()
  })
})
