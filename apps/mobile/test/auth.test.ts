import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { accessToken, login, logout, watchAccount } from '../src/auth'

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
})
afterEach(() => vi.unstubAllGlobals())
describe('private server access', () => {
  it('validates before saving and never sends a saved credential to a different server', async () => {
    const key = 'a'.repeat(43), server = 'https://my-server.ts.net'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 401 }).mockResolvedValueOnce({ ok: true }))
    await expect(login(server, key)).rejects.toThrow('no es válida')
    await expect(accessToken(server)).rejects.toThrow()
    const states: unknown[] = [], stop = await watchAccount(account => states.push(account))
    await login(server, key)
    expect(states).toEqual([null, { server }]); expect(await accessToken(server)).toBe(key)
    await expect(accessToken('https://other.ts.net')).rejects.toThrow()
    await logout(); await expect(accessToken(server)).rejects.toThrow()
    expect(states.at(-1)).toBe(null); stop()
  })
})
