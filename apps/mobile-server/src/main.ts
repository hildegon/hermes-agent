import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { Store } from './store.ts'
import { createServer } from './server.ts'

const ownerUid = process.env.MOBILE_OWNER_UID, projectId = process.env.FIREBASE_PROJECT_ID
if (!ownerUid || !projectId) throw new Error('Set MOBILE_OWNER_UID and FIREBASE_PROJECT_ID before starting')
initializeApp({ projectId })
const database = process.env.MOBILE_DATABASE ?? './data/mobile.sqlite'
mkdirSync(dirname(database), { recursive: true, mode: 0o700 })
const store = new Store(database, process.env.MOBILE_ENCRYPTION_KEY ?? '')
const app = await createServer({ store, ownerUid, tailnetSuffix: process.env.MOBILE_TAILNET_SUFFIX ?? '',
  allowedOrigins: (process.env.MOBILE_ALLOWED_ORIGINS ?? 'http://localhost,https://localhost').split(','),
  verify: async token => {
    const decoded = await getAuth().verifyIdToken(token)
    if (decoded.firebase.sign_in_provider !== 'google.com') throw new Error('Google login required')
    return decoded.uid
  },
})
await app.listen({ host: process.env.MOBILE_HOST ?? '127.0.0.1', port: Number(process.env.MOBILE_PORT ?? 3000) })
console.log('Hermes Mobile server ready')
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, async () => { await app.close(); store.close(); process.exit(0) })
