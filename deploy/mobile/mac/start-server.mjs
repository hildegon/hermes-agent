import { createServer } from 'node:http'

if (process.env.FIREBASE_PROJECT_ID && process.env.MOBILE_OWNER_UID) {
  await import('../../../apps/mobile-server/src/main.ts')
} else {
  // Keep the installed service observable while refusing all access until Google is configured.
  const server = createServer((_request, response) => {
    response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end(JSON.stringify({ ok: false, error: 'Firebase configuration required', configured: false }))
  })
  server.listen(Number(process.env.MOBILE_PORT ?? 3000), '127.0.0.1', () => console.log('Hermes Mobile installed; Firebase configuration required'))
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => process.exit(0)))
}
