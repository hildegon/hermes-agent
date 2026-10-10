import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { accessKeyVerifier } from '../src/auth.ts'
import { Store } from '../src/store.ts'
import { createServer } from '../src/server.ts'

test('self-hosted access key protects machines; initialization preserves encryption and refuses overwrite', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hermes-local-auth-')), env = join(dir, 'server.env')
  const encryption = randomBytes(32).toString('base64')
  writeFileSync(env, `MOBILE_ENCRYPTION_KEY=${encryption}\nMOBILE_PORT=3000\n`)
  const init = new URL('../../../deploy/mobile/init.mjs', import.meta.url)
  const store = new Store(':memory:', encryption)
  let app: Awaited<ReturnType<typeof createServer>> | undefined
  try {
    execFileSync(process.execPath, [init.pathname, env])
    const key = readFileSync(`${env}.access-key`, 'utf8').trim(), config = readFileSync(env, 'utf8')
    assert.ok(config.includes(`MOBILE_ENCRYPTION_KEY=${encryption}`)); assert.ok(!config.includes(key))
    assert.equal(statSync(env).mode & 0o777, 0o600); assert.equal(statSync(`${env}.access-key`).mode & 0o777, 0o600)
    assert.throws(() => execFileSync(process.execPath, [init.pathname, env], { stdio: 'pipe' }))
    assert.equal(readFileSync(`${env}.access-key`, 'utf8').trim(), key)
    const hash = createHash('sha256').update(key).digest('hex')
    assert.throws(() => accessKeyVerifier(''))
    app = await createServer({ store, ownerUid: 'local-owner', verify: accessKeyVerifier(hash), tailnetSuffix: '', allowedOrigins: [] })
    assert.equal((await app.inject('/v1/machines')).statusCode, 401)
    assert.equal((await app.inject({ url: '/v1/machines', headers: { authorization: `Bearer ${randomBytes(32).toString('base64url')}` } })).statusCode, 401)
    const pair = store.pairing('Mac', 'http://100.73.102.62:9141', 'x'.repeat(43))
    const headers = { authorization: `Bearer ${key}` }
    assert.equal((await app.inject({ method: 'POST', url: `/v1/pairings/${pair.code}/confirm`, headers })).statusCode, 200)
    const machines = await app.inject({ url: '/v1/machines', headers })
    assert.equal(machines.statusCode, 200); assert.equal(machines.json().machines[0].name, 'Mac')
    assert.equal((await app.inject('/health')).statusCode, 200)
  } finally { await app?.close(); store.close(); rmSync(dir, { recursive: true, force: true }) }
})
