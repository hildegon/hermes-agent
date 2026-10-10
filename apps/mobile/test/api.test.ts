import { describe, expect, it } from 'vitest'
import { parsePairing, serverUrl } from '../src/api'
describe('pairing trust boundary', () => {
  it('requires HTTPS, no credentials or extra paths', () => {
    expect(serverUrl('https://actual.tail0b6ccb.ts.net')).toBe('https://actual.tail0b6ccb.ts.net')
    for (const value of ['http://actual.tail0b6ccb.ts.net', 'https://a:b@actual.tail0b6ccb.ts.net', 'https://actual.tail0b6ccb.ts.net/path']) expect(() => serverUrl(value)).toThrow()
  })
  it('rejects a QR from another server before sending an account token', () => {
    const server = 'https://actual.tail0b6ccb.ts.net', code = 'a'.repeat(32)
    expect(parsePairing(JSON.stringify({ version: 1, server, code }), server).code).toBe(code)
    expect(() => parsePairing(JSON.stringify({ version: 1, server: 'https://evil.example', code }), server)).toThrow()
    expect(() => parsePairing(JSON.stringify({ version: 1, server, code: '../x' }), server)).toThrow()
  })
})
