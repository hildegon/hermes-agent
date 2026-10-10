import { useCallback, useEffect, useMemo, useState } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { ArrowLeft, Smartphone, Square, Play, RefreshCw } from 'lucide-react'
import { PhoneApi, PhoneControl, type PhoneStatus } from './native-phone'
import Workspace from './Workspace'
export default function Phone({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<PhoneStatus | null>(null), [apps, setApps] = useState<{ package: string; name: string }[]>([])
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [setup, setSetup] = useState(true), [search, setSearch] = useState('')
  const api = useMemo(() => new PhoneApi(), [])
  const refresh = useCallback(async () => {
    const value = await PhoneControl.status(); setStatus(value)
    setApps((await PhoneControl.applications()).apps.sort((a,b) => a.name.localeCompare(b.name)))
    try { await PhoneControl.socket(); setReady(true) } catch { setReady(false) }
  }, [])
  useEffect(() => { void refresh().catch(error => setError(error.message)); const listener = NativeApp.addListener('appStateChange', state => { if (state.isActive) void refresh().catch(error => setError(error.message)) }); return () => { void listener.then(value => value.remove()) } }, [refresh])
  async function run(action: () => Promise<void>) { setError(''); setBusy(true); try { await action(); await refresh() } catch(error) { setError((error as Error).message) } finally { setBusy(false) } }
  return <div className="app-shell">
    <header className="appbar"><button aria-label="Volver" onClick={onBack}><ArrowLeft/></button><Smartphone/><div><strong>Este teléfono</strong><span>{status?.device || 'Android'}</span></div><button onClick={() => setSetup(value => !value)}>{setup ? 'Chat' : 'Control'}</button></header>
    {error ? <p className="error" role="alert">{error}<button aria-label="Cerrar error" onClick={() => setError('')}>Cerrar</button></p> : null}
    {setup ? <main className="tool-page view"><h1>Hermes en este teléfono</h1><p className="muted">El agente se ejecuta aquí. Puede manejar las aplicaciones que autorices mientras el teléfono está desbloqueado.</p>
      <div className="setting-row"><div><strong>Accesibilidad</strong><small>{status?.accessibility ? 'Servicio disponible' : 'Permiso pendiente'}</small></div><button disabled={busy} onClick={() => void run(() => PhoneControl.permissions())}>Abrir permisos</button></div>
      <div className="setting-row"><div><strong>Control del teléfono</strong><small>{status?.enabled ? 'Activo' : 'Detenido'}</small></div><button disabled={busy || !status?.accessibility} onClick={() => void run(() => PhoneControl.setEnabled({ enabled: !status?.enabled }))}>{status?.enabled ? <Square/> : <Play/>}{status?.enabled ? 'Detener' : 'Activar'}</button></div>
      <div className="setting-row"><div><strong>Hermes local</strong><small>{ready ? 'Listo para conversar' : status?.termux ? 'Prepara el runtime en Termux y después inícialo' : 'Instala Termux y prepara el runtime local'}</small></div><button disabled={busy || !status?.termux} onClick={() => void run(() => PhoneControl.startRuntime())}>Iniciar</button><button aria-label="Comprobar Hermes local" disabled={busy} onClick={() => void run(refresh)}><RefreshCw/></button></div>
      <p className="notice">La instalación inicial se realiza en Termux con la guía del proyecto. Tu proveedor de IA debe estar configurado allí. No necesitas Tailscale para controlar este teléfono.</p>
      <button className="primary" disabled={!ready} onClick={() => setSetup(false)}>Abrir chat local</button>
      <h2>Aplicaciones autorizadas</h2><p className="muted">Autoriza solo las que quieras que Hermes pueda leer y manejar. Los campos de contraseña se excluyen.</p>
      <label>Buscar aplicación<input value={search} onChange={event => setSearch(event.target.value)}/></label>
      {apps.filter(app => `${app.name} ${app.package}`.toLowerCase().includes(search.toLowerCase())).map(app => <label className="setting-row toggle" key={app.package}><span>{app.name}<small>{app.package}</small></span><input type="checkbox" disabled={busy} checked={status?.allowed.includes(app.package) || false} onChange={event => void run(() => PhoneControl.allowApps({ apps: event.target.checked ? [...(status?.allowed || []), app.package] : (status?.allowed || []).filter(pkg => pkg !== app.package) }))}/></label>)}
    </main> : ready ? <Workspace api={api} machine={{ id: 'this-phone', name: status?.device || 'Este teléfono', url: 'http://127.0.0.1:9140' }} onError={setError}/> : <div className="empty"><h2>Hermes local no está listo</h2><p>Abre Control para preparar e iniciar el agente.</p><button onClick={() => setSetup(true)}>Abrir control</button></div>}
  </div>
}
