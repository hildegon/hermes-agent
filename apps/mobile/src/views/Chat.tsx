import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { ArrowUp, Paperclip, Plus, Square } from 'lucide-react'
import type { ApprovalPendingResult, PendingApproval, SessionCreateResult, SessionResumeResult, SessionListRow, SessionListResult, SessionHistoryResult, TranscriptMessage, FileAttachResult } from '../../../shared/src/gateway-contract.generated'
import type { ServerRequest } from '@hermes/shared/json-rpc-channel'
import type { ViewProps } from '../Workspace'

export default function Chat({ api, machine, profile, connection, cwd, onError, visible = true, onNeedsInput }: ViewProps) {
  const [sessions, setSessions] = useState<SessionListRow[]>([]), [session, setSession] = useState(''), [messages, setMessages] = useState<TranscriptMessage[]>([])
  const [stream, setStream] = useState(''), [draft, setDraft] = useState(() => localStorage.getItem(`mobile:draft:${api.server}:${machine.id}:${profile}`) || '')
  const [running, setRunning] = useState(false), [loading, setLoading] = useState(false), [connected, setConnected] = useState(false)
  const [approvals, setApprovals] = useState<PendingApproval[]>([]), [requests, setRequests] = useState<ServerRequest[]>([]), [activity, setActivity] = useState<string[]>([])
  const resuming = useRef(false), replayedRequests = useRef<ServerRequest[]>([])
  const active = useRef(''), generation = useRef(0), fileInput = useRef<HTMLInputElement>(null), transcript = useRef<HTMLDivElement>(null), follow = useRef(true)
  const key = `mobile:session:${api.server}:${machine.id}:${profile}`
  const draftKey = `mobile:draft:${api.server}:${machine.id}:${profile}`
  async function report(action: () => Promise<void>) { try { await action() } catch (error) { onError((error as Error).message) } }
  async function list() { const result = await connection.client.request<SessionListResult>('session.list', { profile }); setSessions(result.sessions) }
  async function pending(id: string) {
    const result = await connection.client.request<ApprovalPendingResult>('approval.pending', { session_id: id, profile })
    if (active.current !== id) return
    setApprovals(result.approvals)

  }
  async function open(stored: string) {
    const version = ++generation.current; setLoading(true); resuming.current = true; replayedRequests.current = []
    try {
      const result = await connection.client.request<SessionResumeResult>('session.resume', { session_id: stored, profile, close_on_disconnect: false, source: 'mobile' })
      if (version !== generation.current) return
      active.current = result.session_id; setSession(result.session_id); setMessages(result.messages); setStream(result.inflight?.assistant || '')
      setRunning(Boolean(result.running || result.inflight?.streaming)); setRequests(replayedRequests.current.filter(request => request.params.session_id === result.session_id && request.method !== 'approval')); setActivity([])
      localStorage.setItem(key, result.stored_session_id || stored)
      await pending(result.session_id)
    } finally { if (version === generation.current) { resuming.current = false; setLoading(false) } }
  }
  async function newChat() {
    const result = await connection.client.request<SessionCreateResult>('session.create', { profile, source: 'mobile', close_on_disconnect: false, idempotency_key: crypto.randomUUID(), ...(cwd ? { cwd } : {}) })
    ++generation.current; active.current = result.session_id; setSession(result.session_id); setMessages(result.messages); setStream(''); setRunning(false); setApprovals([]); setRequests([]); setActivity([])
    localStorage.setItem(key, result.stored_session_id)
  }
  async function sync(id: string) {
    const barrier = connection.client.sessionReplayBarrier(id)
    if (barrier && !await barrier) return
    const result = await connection.client.request<SessionHistoryResult>('session.history', { session_id: id, profile })
    if (active.current === id) { setMessages(result.messages); setStream('') }
    await list()
  }
  useEffect(() => {
    let disposed = false
    const offState = connection.client.onState(state => {
      setConnected(state === 'open')
      if (state === 'open') void report(async () => {
        const result = await connection.client.request<SessionListResult>('session.list', { profile })
        if (disposed) return
        setSessions(result.sessions)
        const stored = localStorage.getItem(key)
        if (stored) await open(stored)
      })
    })
    const offEvents = connection.client.onAny(event => {
      if (event.session_id !== active.current) return
      const payload = (event.payload || {}) as Record<string, unknown>
      if (event.type === 'message.delta') { setRunning(true); setStream(previous => previous + (typeof payload.text === 'string' ? payload.text : '')) }
      if (event.type === 'message.complete') { setRunning(false); void report(() => sync(active.current)) }
      if (event.type === 'tool.start') setActivity(previous => [...previous.slice(-19), String(payload.name || 'Herramienta en ejecución')])
      if (event.type === 'approval.cancelled') void report(() => pending(active.current))
      if (event.type === 'request.cancel') setRequests(previous => previous.filter(item => item.id !== String(payload.request_id)))
    })
    const offRequests = connection.client.onRequest(request => {
      if (resuming.current && request.replayed) { replayedRequests.current.push(request); return true }
      if (request.params.session_id !== active.current) return false
      if (request.method === 'approval') { void report(() => pending(active.current)); return true }
      setRequests(previous => [...previous.filter(item => item.id !== request.id), request])
      return true
    })
    return () => { disposed = true; ++generation.current; offState(); offEvents(); offRequests() }
  }, [connection, key, profile])
  useEffect(() => { onNeedsInput?.(approvals.length > 0 || requests.length > 0) }, [approvals.length, requests.length, onNeedsInput])
  useEffect(() => {
    if (!visible || !session) return
    void report(async () => { await Promise.all(approvals.filter(item => item.request_id).map(item => connection.client.request('approval.received', { session_id: session, profile, request_id: item.request_id }))) })
  }, [visible, session, approvals, connection, profile])
  useEffect(() => { localStorage.setItem(draftKey, draft) }, [draftKey, draft])
  useEffect(() => { if (follow.current) transcript.current?.scrollTo({ top: transcript.current.scrollHeight }) }, [stream, messages, approvals])
  async function submit() {
    if (!draft.trim() || !connected) return
    setLoading(true)
    try {
      if (!active.current) await newChat()
      const text = draft
      // Never replay an ambiguous submit; keep the draft until Hermes acknowledges it.
      setStream(''); setRunning(true)
      await connection.client.request('prompt.submit', { session_id: active.current, profile, text, surface: 'mobile' })
      setMessages(previous => [...previous, { role: 'user', text }]); setDraft('')
    } finally { setLoading(false) }
  }
  async function attach(file: File) {
    if (file.size > 8 * 1024 * 1024) throw new Error('El adjunto debe pesar menos de 8 MB.')
    if (!active.current) await newChat()
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('No se pudo leer el archivo.')); reader.readAsDataURL(file) })
    const result = await connection.client.request<FileAttachResult>('file.attach', { session_id: active.current, profile, data_url: data, name: file.name })
    setDraft(previous => `${previous}${previous ? '\n' : ''}${result.ref_text}`)
  }
  return <section className="chat">
    <div className="chat-toolbar"><select aria-label="Conversación" value={localStorage.getItem(key) || ''} disabled={!connected || loading} onChange={event => void report(() => open(event.target.value))}><option value="">Nueva conversación</option>{sessions.map(item => <option key={item.id} value={item.id}>{item.title || item.preview || 'Conversación'}</option>)}</select><button aria-label="Nueva conversación" disabled={!connected || loading} onClick={() => void report(newChat)}><Plus/></button></div>
    <div className="transcript" ref={transcript} onScroll={event => { const node = event.currentTarget; follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80 }}>
      {!messages.length && !stream ? <div className="empty"><h2>¿En qué trabajamos?</h2><p>Las tareas se ejecutan en {machine.name}, con el agente {profile}.</p></div> : null}
      {messages.filter(message => message.display_kind !== 'hidden').map((message, index) => message.role === 'tool' ? <details key={message.row_id || index} className="tool-row"><summary>{message.name || 'Resultado de herramienta'}</summary><pre>{typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)}</pre></details> : <article className={`message ${message.role}`} key={message.row_id || index}><span className="speaker">{message.role === 'user' ? 'Tú' : 'Hermes'}</span><ReactMarkdown>{message.text || (typeof message.content === 'string' ? message.content : '')}</ReactMarkdown></article>)}
      {stream ? <article className="message assistant"><span className="speaker">Hermes</span><ReactMarkdown>{stream}</ReactMarkdown></article> : null}
      {activity.length ? <details className="activity"><summary>Actividad · {activity.length}</summary>{activity.map((item, index) => <p key={index}>{item}</p>)}</details> : null}
      {approvals.map(item => <section className="approval" key={item.request_id || item.command}><h3>Hermes necesita tu aprobación</h3><p>{item.description}</p><pre>{item.command}</pre><div className="actions">{(item.choices || ['once', 'deny']).map(choice => <button key={choice} onClick={() => void report(async () => { await connection.client.request('approval.respond', { session_id: session, profile, request_id: item.request_id, choice }); await pending(session) })}>{({ once: 'Permitir una vez', session: 'Permitir en este chat', always: 'Permitir siempre', deny: 'Rechazar' } as Record<string, string>)[choice] || choice}</button>)}</div></section>)}
      {requests.map(request => <RequestCard key={request.id} request={request} onDone={() => setRequests(previous => previous.filter(item => item.id !== request.id))}/>)}
    </div>
    <form className="composer" onSubmit={event => { event.preventDefault(); void report(submit) }}><textarea aria-label="Mensaje para Hermes" placeholder={`Escribe a ${profile}…`} rows={2} value={draft} onChange={event => setDraft(event.target.value)}/><div className="composer-actions"><input ref={fileInput} type="file" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void report(() => attach(file)); event.target.value = '' }}/><button type="button" disabled={!connected || loading} aria-label="Adjuntar archivo" onClick={() => fileInput.current?.click()}><Paperclip/></button><span className="muted">{running ? 'Hermes está trabajando' : profile}</span>{running ? <button type="button" aria-label="Detener tarea" onClick={() => void report(async () => { await connection.client.request('session.interrupt', { session_id: session, profile }); setRunning(false); await sync(session) })}><Square/></button> : <button type="submit" className="primary icon-button" aria-label="Enviar mensaje" disabled={!connected || loading || !draft.trim()}><ArrowUp/></button>}</div></form>
  </section>
}
function RequestCard({ request, onDone }: { request: ServerRequest; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const questions = Array.isArray(request.params.questions) ? request.params.questions as { qid?: string; question?: string; choices?: string[] }[] : []
  const secret = ['sudo', 'secret', 'vault.code', 'vault.unlock_prompt', 'display.install.sudo'].includes(request.method)
  const supported = secret || request.method === 'clarify'
  return <section className="approval"><h3>Respuesta pendiente</h3><p>{String(request.params.prompt || request.params.command || request.method)}</p>
    {request.method === 'clarify' ? questions.map((question, index) => { const id = question.qid || `q${index}`; return <label key={id}>{question.question}<input value={answers[id] || ''} onChange={event => setAnswers(previous => ({ ...previous, [id]: event.target.value }))}/>{question.choices?.map(option => <button key={option} onClick={() => setAnswers(previous => ({ ...previous, [id]: option }))}>{option}</button>)}</label> }) : supported ? <label>Respuesta<input type={secret ? 'password' : 'text'} autoComplete="off" value={answers.value || ''} onChange={event => setAnswers({ value: event.target.value })}/></label> : <p>Esta petición requiere la app de escritorio: {request.method}.</p>}
    <div className="actions">{supported ? <button disabled={request.method === 'clarify' ? questions.some((q, i) => !answers[q.qid || `q${i}`]?.trim()) : !answers.value} onClick={() => { request.respond(request.method === 'clarify' ? { answers } : { value: answers.value }); onDone() }}>Responder</button> : null}<button onClick={() => { request.fail(-32000, 'User declined'); onDone() }}>Cancelar</button></div>
  </section>
}
