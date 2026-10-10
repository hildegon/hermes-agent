import { randomBytes, createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, chmodSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const filename = resolve(process.argv[2] ?? 'deploy/mobile/.env'), keyFile = `${filename}.access-key`
const previous = existsSync(filename) ? readFileSync(filename, 'utf8') : ''
if (/^MOBILE_ACCESS_KEY_HASH=[a-f0-9]{64}$/m.test(previous) || existsSync(keyFile)) throw new Error('Access key already configured; refusing to overwrite')
const key = randomBytes(32).toString('base64url')
const encryption = previous.match(/^MOBILE_ENCRYPTION_KEY=(.+)$/m)?.[1]
const lines = previous.split('\n').filter(line => line && !/^(FIREBASE_PROJECT_ID|MOBILE_OWNER_UID|MOBILE_ACCESS_KEY_HASH|MOBILE_ENCRYPTION_KEY)=/.test(line))
lines.push(`MOBILE_ACCESS_KEY_HASH=${createHash('sha256').update(key).digest('hex')}`)
lines.push(`MOBILE_ENCRYPTION_KEY=${encryption && Buffer.from(encryption, 'base64').length === 32 ? encryption : randomBytes(32).toString('base64')}`)
mkdirSync(dirname(filename), { recursive: true, mode: 0o700 })
writeFileSync(keyFile, key + '\n', { mode: 0o600, flag: 'wx' })
writeFileSync(`${filename}.tmp`, lines.join('\n') + '\n', { mode: 0o600, flag: 'wx' })
renameSync(`${filename}.tmp`, filename); chmodSync(filename, 0o600)
console.log(`Configuration: ${filename}\nPrivate access key: ${keyFile}\nCopy that key into the app; do not commit or share it.`)
