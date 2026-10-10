import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { Store } from '../src/store.ts'
import { createServer } from '../src/server.ts'
import { allowedPath, validateMachineUrl } from '../src/proxy.ts'

test('pairing, encryption, ownership, expiry and one-use scoped tickets', () => {
  const store = new Store(':memory:', randomBytes(32).toString('base64'))
  try {
    const secret = 'connector-secret', pair = store.pairing('Mac', 'http://100.73.102.62:9141', secret, 1000)
    assert.equal(store.preview(pair.code, 301000), undefined)
    const machine = store.confirm(pair.code, 'owner', 2000)!
    assert.equal(machine.credential, secret)
    assert.equal(store.confirm(pair.code, 'owner', 2000), undefined)
    assert.equal(store.machine(machine.id, 'stranger'), undefined)
    assert.ok(!JSON.stringify(store.list('owner')).includes(secret))
    assert.ok(!String(store.db.prepare('SELECT credential FROM machines').get()!.credential).includes(secret))
    const ticket = store.ticket('owner', machine.id, '/api/ws?profile=work', 3000)
    assert.equal(store.consumeTicket(ticket, machine.id, '/api/ws', 3001), undefined)
    assert.equal(store.consumeTicket(ticket, machine.id, '/api/ws?profile=work', 3001), 'owner')
    assert.equal(store.consumeTicket(ticket, machine.id, '/api/ws?profile=work', 3001), undefined)
    const expired = store.ticket('owner', machine.id, '/api/ws', 3000)
    assert.equal(store.consumeTicket(expired, machine.id, '/api/ws', 33000), undefined)
    const revoked = store.ticket('owner', machine.id, '/api/ws', 3000)
    store.revoke(machine.id, 'stranger'); assert.ok(store.machine(machine.id, 'owner'))
    store.revoke(machine.id, 'owner')
    assert.equal(store.consumeTicket(revoked, machine.id, '/api/ws', 3001), undefined)
  } finally { store.close() }
})

test('authentication and route boundaries cannot expose another account or proxy the internet', async () => {
  const store = new Store(':memory:', randomBytes(32).toString('base64'))
  const app = await createServer({ store, ownerUid: 'owner', verify: async token => token, tailnetSuffix: 'tail0b6ccb.ts.net', allowedOrigins: [] })
  try {
    assert.equal((await app.inject('/v1/machines')).statusCode, 401)
    assert.equal((await app.inject({ url: '/v1/machines', headers: { authorization: 'Bearer other' } })).statusCode, 403)
    const bad = await app.inject({ method: 'POST', url: '/v1/pairings', payload: { name: 'bad', url: 'http://169.254.169.254', credential: 'x'.repeat(43) } })
    assert.equal(bad.statusCode, 400)
    const pair = store.pairing('Mac', 'http://100.73.102.62:9141', 'x'.repeat(43))
    const linked = await app.inject({ method: 'POST', url: `/v1/pairings/${pair.code}/confirm`, headers: { authorization: 'Bearer owner' } })
    assert.equal(linked.statusCode, 200)
    assert.ok(!linked.body.includes('credential'))
    const id = linked.json().id
    const denied = await app.inject({ method: 'POST', url: `/v1/machines/${id}/ticket`, headers: { authorization: 'Bearer owner' }, payload: { path: '//evil/api/ws' } })
    assert.equal(denied.statusCode, 400)
    assert.equal((await app.inject({ url: `/v1/machines/${id}/gateway/api/../private`, headers: { authorization: 'Bearer owner' } })).statusCode, 403)
    const ticket = await app.inject({ method: 'POST', url: `/v1/machines/${id}/ticket`, headers: { authorization: 'Bearer owner' }, payload: { path: '/api/ws?profile=default' } })
    assert.equal(ticket.statusCode, 200)
  } finally { await app.close(); store.close() }
})

test('proxy accepts only explicit API families and pinned Tailscale addresses', async () => {
  assert.equal(allowedPath('/api/fs/read-text'), true)
  for (const path of ['/api/fs/../env', '/api/%66s', '/api/fs\\private', '/private', '/api/unknown']) assert.equal(allowedPath(path), false)
  assert.equal(await validateMachineUrl('http://100.81.111.88:9141', 'tail0b6ccb.ts.net'), 'http://100.81.111.88:9141')
  for (const url of ['http://127.0.0.1:9141', 'http://192.168.1.1', 'http://evil.example', 'https://100.81.111.88', 'http://user:pass@100.81.111.88']) await assert.rejects(validateMachineUrl(url, 'tail0b6ccb.ts.net'))
})
