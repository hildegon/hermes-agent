import { useCallback, useEffect, useMemo, useState } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { ArrowLeft, Smartphone, Square, Play, RefreshCw } from 'lucide-react'
import { PhoneApi, PhoneControl, configurePhoneProvider, startPhoneRuntime, type PhoneLogin, type PhoneStatus, type LocalModelStatus } from './native-phone'
import Workspace from './Workspace'
const phases: Record<string,string> = { opening: 'Abriendo el entorno…', dependencies: 'Instalando dependencias…', linux: 'Preparando Linux…', python: 'Instalando Hermes…', starting: 'Arrancando Hermes…', ready: 'Instalación terminada', error: 'La instalación no terminó. Puedes reintentar.' }
export default function Phone({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<PhoneStatus | null>(null), [apps, setApps] = useState<{ package: string; name: string }[]>([])
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [setup, setSetup] = useState(true), [search, setSearch] = useState('')
  const [provider, setProvider] = useState('openai-codex'), [model, setModel] = useState('gpt-6-luna'), [key, setKey] = useState(''), [login, setLogin] = useState<PhoneLogin | null>(null), [signedIn, setSignedIn] = useState(false)
  const [localModel,setLocalModel] = useState<LocalModelStatus | null>(null)
  const api = useMemo(() => new PhoneApi(), [])
  const refresh = useCallback(async () => {
    const value = await PhoneControl.status(); setStatus(value)
    setLocalModel(await PhoneControl.localModelStatus())
    setApps((await PhoneControl.applications()).apps.sort((a,b) => a.name.localeCompare(b.name)))
    try { await PhoneControl.socket(); setReady(true) } catch { setReady(false) }
  }, [])
  useEffect(() => {
    void refresh().catch(error => setError(error.message))
    const listener = NativeApp.addListener('appStateChange', state => { if (state.isActive) void refresh().catch(error => setError(error.message)) })
    const timer = setInterval(() => { void refresh().catch(() => {}) }, 5000)
    return () => { clearInterval(timer); void listener.then(value => value.remove()) }
  }, [refresh])
  useEffect(() => {
    if (!ready) return
    void Promise.all([api.gateway<{ current: { provider: string; model: string } }>('this-phone','default','/api/providers/custom-endpoints'),api.gateway<{providers:{provider:string;entries:unknown[]}[]}>('this-phone','default','/api/credentials/pool')]).then(([config,pool]) => { if(config.current.provider) setProvider(config.current.provider==='hermes-phone-local' ? 'local' : config.current.provider); if(config.current.model) setModel(config.current.model); setSignedIn(config.current.provider==='hermes-phone-local' || pool.providers.some(item => item.provider===(config.current.provider || 'openai-codex') && item.entries.length>0)) }).catch(() => {})
  }, [api,ready])
  useEffect(() => {
    if(!login) return
    const timer=setInterval(() => { void api.gateway<{status:string;error_message?:string}>('this-phone','default',`/api/providers/oauth/openai-codex/poll/${encodeURIComponent(login.session_id)}`).then(result => {
      if(result.status==='approved'){setSignedIn(true);setLogin(null)}
      else if(['error','denied','expired'].includes(result.status)){setError(result.error_message || 'El inicio de sesión ha caducado. Vuelve a conectar tu cuenta.');setLogin(null)}
    }).catch(error => {setError(error.message);setLogin(null)}) }, 3000)
    return () => clearInterval(timer)
  },[api,login])
  async function run(action: () => Promise<void>) { setError(''); setBusy(true); try { await action(); await refresh() } catch(error) { setError((error as Error).message) } finally { setBusy(false) } }
  async function start() {
    setStarting(true)
    try { await startPhoneRuntime() } finally { setStarting(false) }
  }
  async function configure() {
    const value=await configurePhoneProvider(api,provider,model,key)
    localStorage.removeItem(`mobile:session:${api.server}:this-phone:default`)
    setKey('');setLogin(value);setSignedIn(value===null)
  }
  const installing=status && ['opening','dependencies','linux','python','starting'].includes(status.phase)
  return <div className="app-shell">
    <header className="appbar"><button aria-label="Volver" onClick={onBack}><ArrowLeft/></button><Smartphone/><div><strong>Este teléfono</strong><span>{status?.device || 'Android'}</span></div><button disabled={setup && (!ready || !signedIn || (provider==='local' && !localModel?.ready))} onClick={() => setSetup(value => !value)}>{setup ? 'Chat' : 'Preparación'}</button></header>
    {error ? <div className="error phone-error" role="alert"><span>{error}</span><button aria-label="Cerrar error" onClick={() => setError('')}>Cerrar</button></div> : null}
    {setup ? <main className="tool-page view phone-setup"><h1>Hermes en este teléfono</h1><p className="muted">Prepara el agente aquí, conecta tu cuenta de IA y elige las aplicaciones que puede manejar. No necesitas un PC ni Tailscale.</p>
      <div className="setting-row"><div><strong>Entorno de ejecución</strong><small>{status?.termux ? 'Termux instalado' : 'Necesario para ejecutar Hermes'}</small></div>{!status?.termux ? <button disabled={busy} onClick={() => void run(() => PhoneControl.installTermux())}>{busy ? 'Descargando…' : 'Instalar entorno'}</button> : null}</div>
      <div className="setting-row"><div><strong>Accesibilidad</strong><small>{status?.accessibility ? 'Servicio disponible' : 'Activa Hermes · Control del teléfono'}</small></div><button disabled={busy} onClick={() => void run(() => PhoneControl.permissions())}>Abrir permisos</button></div>
      {!status?.accessibility ? <p className="notice">Si Android bloquea el permiso, abre la ficha de Hermes Mobile, toca ⋮ y permite los ajustes restringidos.<button onClick={() => void run(() => PhoneControl.appSettings())}>Abrir ficha de la app</button></p> : null}
      <div className="setting-row"><div><strong>Instalación de Hermes</strong><small role="status">{installing ? phases[status.phase] : ready ? 'Hermes está listo' : phases[status?.phase || ''] || 'Prepara el agente automáticamente'}</small></div><button disabled={busy || installing || !status?.termux || !status?.accessibility || !status?.automaticSetup} onClick={() => void run(() => PhoneControl.prepareRuntime())}>{ready ? 'Reparar instalación' : 'Preparar Hermes'}</button></div>
      {!ready ? <p className="muted">La preparación abre una sesión nueva en Termux e instala el agente. Mantén el teléfono desbloqueado. Puedes volver aquí para seguir el progreso, sin escribir comandos.</p> : null}
      <div className="setting-row"><div><strong>Arranque</strong><small>{starting ? 'Esperando a que Hermes responda… Si se abre Termux, vuelve a esta app.' : ready ? 'Conexión local disponible' : 'Inicia el agente después de prepararlo'}</small></div><button disabled={busy || !status?.termux || ready} onClick={() => void run(start)}>{starting ? 'Arrancando…' : ready ? 'En ejecución' : 'Iniciar'}</button><button aria-label="Comprobar Hermes local" disabled={busy} onClick={() => void run(refresh)}><RefreshCw/></button></div>
      {status?.termux && !status.commandPermission ? <p className="notice">Al pulsar Iniciar, Hermes abrirá Termux y arrancará el agente automáticamente. Mantén el teléfono desbloqueado y vuelve aquí después. No necesitas buscar un permiso adicional en Ajustes.</p> : null}
      {ready ? <section className="phone-provider"><h2>Proveedor de IA</h2><p className="muted">Tu configuración actual se conserva. Puedes conectar una cuenta nueva desde aquí. Al cambiar de proveedor se abre una conversación nueva; las anteriores siguen guardadas.</p><label>Proveedor<select aria-label="Proveedor" value={provider} onChange={event => {setProvider(event.target.value);setSignedIn(false)}}><option value="openai-codex">Cuenta ChatGPT</option><option value="openai">OpenAI con clave de API</option><option value="local">Modelo local en el teléfono</option>{!['local','openai','openai-codex'].includes(provider) ? <option value={provider}>{provider}</option> : null}</select></label>{provider==='local' ? <section className="phone-provider"><h3>Qwen3 · 1,7B</h3><p className="muted">Descarga de 1,83 GB. La IA se ejecuta en el teléfono; después de descargarla no necesita internet para responder. Experimental: requiere 8 GB de RAM y puede consumir batería o calentarlo. Las tareas que consulten webs sí necesitan conexión.</p><p role="status">{localModel?.ready ? 'Modelo en ejecución' : ({opening:'Abriendo Termux…',dependencies:'Instalando el motor…',downloading:'Descargando el modelo…',verifying:'Verificando la descarga…',starting:'Cargando el modelo…',error:'No se completó la acción. Vuelve a Termux para ver el error y reintenta.',stopped:'Modelo detenido',ready:'Modelo instalado'} as Record<string,string>)[localModel?.phase || ''] || 'Modelo sin instalar'}</p><div className="setting-row"><button disabled={busy || ['opening','dependencies','downloading','verifying','starting'].includes(localModel?.phase || '') || localModel?.ready} onClick={()=>void run(()=>PhoneControl.localModel({action:'install'}))}>{localModel?.installed ? 'Verificar instalación' : 'Descargar modelo'}</button><button disabled={busy || !localModel?.installed || localModel?.ready || ['opening','dependencies','downloading','verifying','starting'].includes(localModel?.phase || '')} onClick={()=>void run(()=>PhoneControl.localModel({action:'start'}))}>Iniciar modelo</button><button disabled={busy || !localModel?.installed || ['opening','dependencies','downloading','verifying','starting'].includes(localModel?.phase || '')} onClick={()=>void run(()=>PhoneControl.localModel({action:'stop'}))}>Detener modelo</button></div><p className="muted">Las acciones abren Termux. Mantén el teléfono desbloqueado y vuelve aquí para comprobar el progreso. Contexto ampliado a 64K con caché comprimida. Su precisión puede ser limitada, especialmente en conversaciones largas.</p></section> : <label>Modelo<input value={model} onChange={event=>setModel(event.target.value)} autoCapitalize="none"/></label>}{provider==='openai' ? <label>Clave de API<input type="password" value={key} onChange={event=>setKey(event.target.value)} autoComplete="off" autoCapitalize="none"/></label> : null}<button disabled={busy || !['local','openai','openai-codex'].includes(provider)} onClick={() => void run(configure)}>{provider==='local' ? 'Usar modelo local' : provider==='openai-codex' ? 'Conectar cuenta ChatGPT' : 'Guardar configuración'}</button>{signedIn && (provider!=='local' || localModel?.ready) ? <p role="status">Credenciales configuradas.</p> : <p className="muted">Conecta tu proveedor para empezar a conversar.</p>}{login ? <div className="notice"><p>Introduce este código al iniciar sesión: <strong>{login.user_code}</strong></p><button onClick={() => void run(() => PhoneControl.copyLoginCode({code:login.user_code}))}>Copiar código</button><button onClick={() => void run(() => PhoneControl.openLogin({url:login.verification_url}))}>Abrir inicio de sesión</button><p>La app comprobará la conexión automáticamente.</p></div> : null}</section> : null}
      <div className="setting-row"><div><strong>Control del teléfono</strong><small>{status?.enabled ? 'Activo' : 'Detenido'}</small></div><button disabled={busy || !status?.accessibility} onClick={() => void run(() => PhoneControl.setEnabled({ enabled: !status?.enabled }))}>{status?.enabled ? <Square/> : <Play/>}{status?.enabled ? 'Detener' : 'Activar'}</button></div>
      <button className="primary" disabled={!ready || !signedIn || (provider==='local' && !localModel?.ready)} onClick={() => setSetup(false)}>Abrir chat local</button>
      <h2>Aplicaciones autorizadas</h2><p className="muted">Hermes solo puede leer y manejar las que selecciones. Los campos de contraseña se excluyen.</p>
      <label>Buscar aplicación<input value={search} onChange={event => setSearch(event.target.value)}/></label>
      {apps.filter(app => `${app.name} ${app.package}`.toLowerCase().includes(search.toLowerCase())).map(app => <label className="setting-row toggle" key={app.package}><span>{app.name}<small>{app.package}</small></span><input type="checkbox" disabled={busy} checked={status?.allowed.includes(app.package) || false} onChange={event => void run(() => PhoneControl.allowApps({ apps: event.target.checked ? [...(status?.allowed || []), app.package] : (status?.allowed || []).filter(pkg => pkg !== app.package) }))}/></label>)}
    </main> : ready ? <Workspace api={api} machine={{ id: 'this-phone', name: status?.device || 'Este teléfono', url: 'http://127.0.0.1:9140' }} onError={setError}/> : <div className="empty"><h2>Prepara Hermes para empezar</h2><p>Instala el entorno, prepara el agente y conecta tu proveedor de IA desde Preparación.</p><button onClick={() => setSetup(true)}>Abrir preparación</button></div>}
  </div>
}
