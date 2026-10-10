import { createHash, timingSafeEqual } from 'node:crypto'

export function accessKeyVerifier(hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Run deploy/mobile/init.mjs to configure MOBILE_ACCESS_KEY_HASH')
  const expected = Buffer.from(hash, 'hex')
  return async (key: string) => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(key) || !timingSafeEqual(createHash('sha256').update(key).digest(), expected)) throw new Error('Invalid access key')
    return 'local-owner'
  }
}
