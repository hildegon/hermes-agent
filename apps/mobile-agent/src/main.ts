import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import QRCode from 'qrcode'
import { createConnector } from './connector.ts'

const { values } = parseArgs({ options: {
  server: { type: 'string' }, name: { type: 'string' }, url: { type: 'string' }, host: { type: 'string', default: '127.0.0.1' },
  port: { type: 'string', default: '9141' }, 'hermes-port': { type: 'string', default: '9140' },
  hermes: { type: 'string', default: 'hermes' }, config: { type: 'string', default: join(homedir(), '.config/hermes-mobile/agent.json') }, pair: { type: 'boolean', default: false },
} })
const directory = join(values.config!, '..')
mkdirSync(directory, { recursive: true, mode: 0o700 })
interface Config { credential: string; server?: string; name?: string; url?: string }
const config: Config = existsSync(values.config!) ? JSON.parse(readFileSync(values.config!, 'utf8')) : { credential: randomBytes(32).toString('base64url') }
for (const key of ['server', 'name', 'url'] as const) if (values[key]) config[key] = values[key]
if (!/^[A-Za-z0-9_-]{43}$/.test(config.credential)) throw new Error('Invalid connector credential; use a new config file')
writeFileSync(values.config!, JSON.stringify(config), { mode: 0o600 }); chmodSync(values.config!, 0o600)
const port = Number(values.port), hermesPort = Number(values['hermes-port'])
if (!Number.isInteger(port) || !Number.isInteger(hermesPort) || port < 1024 || hermesPort < 1024 || port > 65535 || hermesPort > 65535 || port === hermesPort) throw new Error('Choose two different ports between 1024 and 65535')
const backend = `http://127.0.0.1:${hermesPort}`
// This connector owns its headless server; it never adopts an unrelated process on a busy port.
const probe = await fetch(`${backend}/api/status`, { signal: AbortSignal.timeout(1000) }).catch(() => null)
if (probe) throw new Error(`Port ${hermesPort} is occupied; choose another --hermes-port`)
const child = spawn(values.hermes!, ['serve', '--host', '127.0.0.1', '--port', String(hermesPort)], { stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true })
let stopped = false
child.on('error', error => { console.error(`Cannot start Hermes: ${error.message}`); process.exit(1) })
child.on('exit', code => { if (!stopped) { console.error(`Hermes exited (${code})`); process.exit(1) } })
async function backendToken(): Promise<string> {
  const response = await fetch(backend, { signal: AbortSignal.timeout(5000) })
  const html = await response.text(), match = html.match(/__HERMES_SESSION_TOKEN__\s*=\s*"([^"\\]+)"/)
  if (!response.ok || !match) throw new Error('Hermes did not provide a loopback authentication handshake')
  return match[1]
}
for (let attempt = 0; ; attempt++) {
  try { await backendToken(); break } catch {
    if (attempt >= 59) { child.kill(); throw new Error('Hermes did not become ready within 60 seconds') }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}
const app = await createConnector({ credential: config.credential, backend, backendToken })
try { await app.listen({ host: values.host, port }) } catch (error) { stopped = true; await app.close(); child.kill(); throw error }
console.log(`Hermes Mobile connector ready on ${values.host}:${port}`)
async function shutdown() { stopped = true; await app.close(); child.kill(); process.exit(0) }
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown)
if (values.pair) {
  try {
  if (!config.server || !config.name || !config.url) { throw new Error('Pairing requires --server, --name and --url') }
  const server = new URL(config.server)
  if ((server.protocol !== 'https:' && !(server.protocol === 'http:' && server.hostname === '127.0.0.1')) || server.username || server.password || server.pathname !== '/' || server.search || server.hash) throw new Error('Use an HTTPS Tailscale Serve URL for the central server')
  const response = await fetch(new URL('/v1/pairings', server), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: config.name, url: config.url, credential: config.credential }), signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Pairing rejected (${response.status})`)
  const pair = await response.json() as { code: string; expires: number }
  const payload = JSON.stringify({ version: 1, server: server.origin, code: pair.code })
  console.log(await QRCode.toString(payload, { type: 'terminal', small: true }))
  console.log(`Pairing code: ${pair.code}\nExpires: ${new Date(pair.expires).toLocaleTimeString()}`)
  } catch (error) { stopped = true; await app.close(); child.kill(); throw error }
}
