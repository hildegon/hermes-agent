import { afterEach, expect, it, vi } from 'vitest'
const lifecycle = vi.hoisted(() => ({ resume: (_state: { isActive: boolean }) => {}, remove: vi.fn() }))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async (_event, listener) => { lifecycle.resume = listener; return { remove: lifecycle.remove } }) } }))
vi.mock('@hermes/shared', () => ({ JsonRpcGatewayClient: class { connectionState = 'closed'; onState() { return () => {} }; close() {} } }))
import { AgentConnection, type Api } from '../src/api'
afterEach(() => vi.useRealTimers())
it('resumes after retry exhaustion and ignores activity after disposal', async () => {
  vi.useFakeTimers()
  const socketUrl = vi.fn().mockRejectedValue(new Error('offline'))
  const connection = new AgentConnection({ socketUrl } as unknown as Api, 'mac', 'default')
  await expect(connection.connect()).rejects.toThrow('offline')
  await vi.advanceTimersByTimeAsync(120000)
  const exhausted = socketUrl.mock.calls.length
  expect(exhausted).toBeGreaterThan(1)
  await vi.advanceTimersByTimeAsync(120000)
  expect(socketUrl).toHaveBeenCalledTimes(exhausted)
  lifecycle.resume({ isActive: false }); expect(socketUrl).toHaveBeenCalledTimes(exhausted)
  lifecycle.resume({ isActive: true }); await vi.advanceTimersByTimeAsync(0)
  expect(socketUrl).toHaveBeenCalledTimes(exhausted + 1)
  connection.close(); await Promise.resolve()
  lifecycle.resume({ isActive: true }); await vi.advanceTimersByTimeAsync(120000)
  expect(socketUrl).toHaveBeenCalledTimes(exhausted + 1)
  expect(lifecycle.remove).toHaveBeenCalled()
})
