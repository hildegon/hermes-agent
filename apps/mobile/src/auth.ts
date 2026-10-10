export interface Account { server: string }
interface Session extends Account { key: string }
const storageKey = 'mobile:access:v1'
const listeners = new Set<(account: Account | null) => void>()
function saved(): Session | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null') as Session | null
    return value && typeof value.server === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.key) ? value : null
  } catch { return null }
}
export async function login(server: string, key: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Error('Introduce la clave de acceso generada por tu servidor.')
  const response = await fetch(`${server}/v1/machines`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(response.status === 401 ? 'La clave de acceso no es válida.' : 'No se puede conectar al servicio. Comprueba su dirección y configuración.')
  localStorage.setItem(storageKey, JSON.stringify({ server, key }))
  for (const callback of listeners) callback({ server })
}
export async function logout() {
  localStorage.removeItem(storageKey)
  for (const callback of listeners) callback(null)
}
export async function accessToken(server: string) {
  const session = saved()
  if (!session || session.server !== server) throw new Error('Conéctate a este servidor con su clave de acceso.')
  return session.key
}
export async function watchAccount(callback: (account: Account | null) => void) {
  listeners.add(callback)
  const session = saved()
  callback(session ? { server: session.server } : null)
  return () => { listeners.delete(callback) }
}
