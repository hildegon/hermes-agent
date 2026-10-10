import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { MessageSquare, Folder, Terminal, GitBranch, Settings, RefreshCw } from 'lucide-react'
import type { ProfileRow } from '../../shared/src/gateway-contract.generated'
import { AgentConnection, type Api, type Machine } from './api'
import Chat from './views/Chat'
import Files from './views/Files'
import Git from './views/Git'
import Configuration from './views/Configuration'
const TerminalView = lazy(() => import('./views/Terminal'))
export interface ViewProps { api: Api; machine: Machine; profile: string; connection: AgentConnection; cwd: string; onError: (message: string) => void; visible?: boolean; onNeedsInput?: (pending: boolean) => void }
const tabs = [{ id: 'chat', label: 'Chat', Icon: MessageSquare }, { id: 'files', label: 'Archivos', Icon: Folder }, { id: 'terminal', label: 'Terminal', Icon: Terminal }, { id: 'git', label: 'Git', Icon: GitBranch }, { id: 'settings', label: 'Ajustes', Icon: Settings }] as const
type Tab = typeof tabs[number]['id']
export default function Workspace({ api, machine, onError }: { api: Api; machine: Machine; onError: (message: string) => void }) {
  const [profile, setProfile] = useState('default'), [profiles, setProfiles] = useState<ProfileRow[]>([])
  return <><div className="profilebar"><label>Agente<select value={profile} onChange={event => { onError(''); setProfile(event.target.value) }}><option value="default">default</option>{profiles.filter(item => item.name !== 'default').map(item => <option key={item.name} value={item.name}>{item.display_name || item.name}</option>)}</select></label></div><AgentWorkspace key={profile} api={api} machine={machine} profile={profile} onError={onError} onProfiles={setProfiles}/></>
}
function AgentWorkspace({ api, machine, profile, onError, onProfiles }: { api: Api; machine: Machine; profile: string; onError: (message: string) => void; onProfiles: (profiles: ProfileRow[]) => void }) {
  const connection = useMemo(() => new AgentConnection(api, machine.id, profile), [api, machine.id, profile])
  const [state, setState] = useState('connecting'), [tab, setTab] = useState<Tab>('chat'), [cwd, setCwd] = useState(''), [opened, setOpened] = useState<Set<Tab>>(() => new Set(['chat'])), [needsInput, setNeedsInput] = useState(false)
  useEffect(() => {
    let disposed = false
    const off = connection.client.onState(setState)
    const ready = connection.client.onState(value => {
      if (value !== 'open') return
      void Promise.all([
        connection.client.request<{ profiles?: ProfileRow[] }>('profiles.list'),
        api.gateway<{ path?: string; cwd?: string }>(machine.id, profile, '/api/fs/default-cwd'),
      ]).then(([roster, directory]) => { if (!disposed) { onProfiles(roster.profiles ?? []); setCwd(directory.path || directory.cwd || '') } }).catch(error => { if (!disposed) onError(error.message) })
    })
    void connection.connect().catch(error => { if (!disposed) onError(error.message) })
    return () => { disposed = true; off(); ready(); connection.close() }
  }, [connection, api, machine.id, profile, onProfiles, onError])
  const props: ViewProps = { api, machine, profile, connection, cwd, onError, onNeedsInput: setNeedsInput }
  return <div className="workspace">
    <div className="connection-line" role="status"><span className={`status-dot ${state === 'open' ? 'online' : ''}`}/>{state === 'open' ? 'Conectado a tu PC' : state === 'connecting' ? 'Conectando…' : 'Conexión interrumpida'}{state !== 'open' ? <button aria-label="Reconectar" onClick={() => void connection.connect().catch(error => onError(error.message))}><RefreshCw size={16}/></button> : null}</div>
    <div className="workspace-body">
      {needsInput && tab !== 'chat' ? <button onClick={() => setTab('chat')}>Hermes necesita tu respuesta · Abrir chat</button> : null}
      <div hidden={tab !== 'chat'} className="view"><Chat {...props} visible={tab === 'chat'}/></div>
      {opened.has('files') ? <div hidden={tab !== 'files'} className="view"><Files {...props}/></div> : null}
      {opened.has('terminal') ? <div hidden={tab !== 'terminal'} className="view"><Suspense fallback={<p>Cargando terminal…</p>}><TerminalView {...props}/></Suspense></div> : null}
      {opened.has('git') ? <div hidden={tab !== 'git'} className="view"><Git {...props}/></div> : null}
      {opened.has('settings') ? <div hidden={tab !== 'settings'} className="view"><Configuration {...props}/></div> : null}
    </div>
    <nav className="bottom-nav" aria-label="Herramientas del agente">{tabs.map(({ id, label, Icon }) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => { setOpened(previous => new Set([...previous, id])); setTab(id) }}><Icon size={21}/><span>{label}</span></button>)}</nav>
  </div>
}
