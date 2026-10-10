import { describe, expect, it, vi } from 'vitest'
const native = vi.hoisted(() => ({ gateway: vi.fn(), socket: vi.fn() }))
vi.mock('@capacitor/core', () => ({ registerPlugin: () => native }))
import { PhoneApi } from '../src/native-phone'
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
  it('preserves native backend errors', async () => {
    native.gateway.mockResolvedValue({ status: 401, body: '{}' })
    await expect(new PhoneApi().gateway('this-phone','default','/api/config')).rejects.toThrow('401')
  })
})
