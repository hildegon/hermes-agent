import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { accessKeyVerifier } from './auth.ts'
import { Store } from './store.ts'
import { createServer } from './server.ts'

const verify = accessKeyVerifier(process.env.MOBILE_ACCESS_KEY_HASH ?? '')
const ownerUid = 'local-owner'
const database = process.env.MOBILE_DATABASE ?? './data/mobile.sqlite'
mkdirSync(dirname(database), { recursive: true, mode: 0o700 })
const store = new Store(database, process.env.MOBILE_ENCRYPTION_KEY ?? '')
const app = await createServer({ store, ownerUid, tailnetSuffix: process.env.MOBILE_TAILNET_SUFFIX ?? '',
  allowedOrigins: (process.env.MOBILE_ALLOWED_ORIGINS ?? 'http://localhost,https://localhost').split(','),
  verify,
})
await app.listen({ host: process.env.MOBILE_HOST ?? '127.0.0.1', port: Number(process.env.MOBILE_PORT ?? 3000) })
console.log('Hermes Mobile server ready')
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, async () => { await app.close(); store.close(); process.exit(0) })
