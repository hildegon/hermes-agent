import { useEffect, useMemo, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as NativeApp } from '@capacitor/app'
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner'
import { LogOut, Monitor, Plus, QrCode, RefreshCw, ArrowLeft, Laptop } from 'lucide-react'
import { Api, parsePairing, serverUrl, type Machine } from './api'
import { login, logout, watchAccount, type Account } from './auth'
import Workspace from './Workspace'

export default function App() {
  const [account, setAccount] = useState<Account | null>(null), [server, setServer] = useState(() => localStorage.getItem('mobile:server:v1') || import.meta.env.VITE_MOBILE_SERVER || '')
  const [machines, setMachines] = useState<Machine[]>([]), [selected, setSelected] = useState<Machine | null>(null)
  const [accessKey, setAccessKey] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false)
  const [pairCode, setPairCode] = useState(''), [pairing, setPairing] = useState<{ name: string; url: string } | null>(null), [pairOpen, setPairOpen] = useState(false)
  const api = useMemo(() => { try { return new Api(server) } catch { return null } }, [server])
  useEffect(() => {
    let disposed = false, stop: (() => void) | undefined
    void watchAccount(value => { if (!disposed) { setAccount(value); if (value) setServer(value.server); setMachines([]); setSelected(null); setLoaded(false) } }).then(value => { if (disposed) value(); else stop = value }).catch(error => setError(String(error)))
    return () => { disposed = true; stop?.() }
  }, [])
  async function run(action: () => Promise<void>) { setError(''); setBusy(true); try { await action() } catch (error) { setError((error as Error).message) } finally { setBusy(false) } }
  async function refresh() {
    if (!api) return
    const result = await api.request<{ machines: Machine[] }>('/v1/machines')
    setMachines(result.machines); setLoaded(true)
  }
  useEffect(() => {
    if (!api || !account) return
    const controller = new AbortController()
    setLoaded(false)
    void api.request<{ machines: Machine[] }>('/v1/machines', 'GET', undefined, controller.signal).then(result => { if (!controller.signal.aborted) { setMachines(result.machines); setLoaded(true) } }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [api, account])
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const listener = NativeApp.addListener('backButton', () => {
      if (pairOpen) { setPairOpen(false); setPairing(null) }
      else if (selected) setSelected(null)
      else void NativeApp.minimizeApp()
    })
    return () => { void listener.then(value => value.remove()) }
  }, [pairOpen, selected])
  async function preview(code: string) {
    if (!api) throw new Error('Configura la dirección del servidor.')
    const value = code.trim().startsWith('{') ? parsePairing(code, api.server).code : code.trim()
    if (!/^[A-Za-z0-9_-]{32}$/.test(value)) throw new Error('El código de vinculación no es válido.')
    setPairCode(value); setPairing(await api.request(`/v1/pairings/${value}`)); setPairOpen(true)
  }
  if (!account) return <main className="signin">
    <h1 className="signin-title"><Monitor size={28}/>Hermes Mobile</h1>
    <p>Tus agentes, estés donde estés.</p>
    <label>Servidor privado<input value={server} onChange={event => setServer(event.target.value)} placeholder="https://tu-servidor.ts.net" autoCapitalize="none" inputMode="url"/></label>
    <label>Clave de acceso<input type="password" value={accessKey} onChange={event => setAccessKey(event.target.value)} placeholder="La clave generada por tu servidor" autoCapitalize="none" autoComplete="current-password" spellCheck={false}/></label>
    <button className="primary" disabled={busy || !server.trim() || !accessKey.trim()} onClick={() => void run(async () => { const value = serverUrl(server); await login(value, accessKey.trim()); localStorage.setItem('mobile:server:v1', value); setServer(value); setAccessKey('') })}>{busy ? 'Conectando…' : 'Conectar'}</button>
    <p className="muted">Usa tu propio servidor y su clave de acceso. Conecta Tailscale para acceder desde fuera de casa.</p>
    {error ? <p role="alert" className="error">{error}</p> : null}
    <footer>Adaptación independiente de Hermes Agent · MIT</footer>
  </main>
  return <div className="app-shell">
    <header className="appbar"><button aria-label={selected ? 'Volver a mis PC' : 'Actualizar mis PC'} onClick={() => selected ? setSelected(null) : void run(refresh)}>{selected ? <ArrowLeft/> : <Monitor/>}</button>
      <div><strong>{selected?.name || 'Mis PC'}</strong><span>{selected ? 'Hermes remoto' : 'Hermes Mobile'}</span></div>
      <button aria-label="Cerrar sesión" onClick={() => void run(logout)}><LogOut/></button>
    </header>
    {error ? <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Cerrar error">Cerrar</button></div> : null}
    {selected && api ? <Workspace key={selected.id} api={api} machine={selected} onError={setError}/> : <main className="machines">
      <div className="section-heading"><div><h1>Tus máquinas</h1><p className="muted">Elige dónde quieres trabajar.</p></div><button disabled={busy} aria-label="Actualizar máquinas" onClick={() => void run(refresh)}><RefreshCw/></button></div>
      {machines.map(machine => <div className="machine-row" key={machine.id}><button className="machine-open" onClick={() => setSelected(machine)}><Laptop/><span><strong>{machine.name}</strong><small>{machine.url}</small></span><span className="open-label">Abrir</span></button><button className="quiet" onClick={() => void run(async () => { if (window.confirm(`¿Desvincular ${machine.name}? Sus agentes seguirán funcionando en el PC.`)) { await api!.request(`/v1/machines/${machine.id}`, 'DELETE'); await refresh() } })}>Desvincular</button></div>)}
      {!machines.length ? <div className="empty"><Monitor size={40}/><h2>{loaded ? 'Conecta tu primer PC' : error ? 'No se pudo cargar la lista' : 'Cargando tus PC…'}</h2><p>{loaded ? 'Abre el conector en tu PC y escanea su QR. Tus conversaciones seguirán allí.' : 'Comprueba que Tailscale y el servidor estén disponibles.'}</p></div> : null}
      <button className="primary" onClick={() => { setPairOpen(true); setPairing(null); setPairCode('') }}><Plus/>Vincular PC</button>
      {pairOpen ? <section className="pair-panel"><h2>Vincular una máquina</h2>
        {Capacitor.isNativePlatform() ? <button onClick={() => void run(async () => { const result = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.QR_CODE }); await preview(result.ScanResult) })}><QrCode/>Escanear QR</button> : null}
        <label>Código del conector<input value={pairCode} onChange={event => { setPairCode(event.target.value); setPairing(null) }} autoCapitalize="none"/></label>
        <button disabled={busy || !pairCode} onClick={() => void run(() => preview(pairCode))}>Revisar vinculación</button>
        {pairing ? <div><p>Vas a vincular <strong>{pairing.name}</strong>.</p><p className="muted">{pairing.url}</p><button className="primary" disabled={busy} onClick={() => void run(async () => { await api!.request(`/v1/pairings/${pairCode}/confirm`, 'POST'); setPairOpen(false); setPairing(null); await refresh() })}>Confirmar y vincular</button></div> : null}
        <button className="quiet" onClick={() => { setPairOpen(false); setPairing(null) }}>Cancelar</button>
      </section> : null}
    </main>}
  </div>
}
