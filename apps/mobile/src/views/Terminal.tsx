import { useEffect, useRef, useState } from 'react'
import { Terminal as Xterm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { ViewProps } from '../Workspace'
export default function Terminal({ api, machine, profile, cwd, onError }: ViewProps) {
  const key = `mobile:terminal:${api.server}:${machine.id}:${profile}`
  const host = useRef<HTMLDivElement>(null), socket = useRef<WebSocket | null>(null), terminalId = useRef<string | undefined>(localStorage.getItem(key) || undefined)
  const [generation, setGeneration] = useState(0), [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!host.current) return
    let disposed = false
    const dark = matchMedia('(prefers-color-scheme: dark)').matches
    const terminal = new Xterm({ fontSize: 13, fontFamily: 'monospace', cursorBlink: true, theme: dark ? { background: '#17171a', foreground: '#f2f2f5' } : { background: '#fcfcfc', foreground: '#17171a' } })
    const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(host.current)
    const observer = new ResizeObserver(() => { if (host.current?.clientWidth) { fit.fit(); if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows })) } })
    observer.observe(host.current)
    const input = terminal.onData(text => { if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'input', text })) })
    const query = new URLSearchParams({ profile, ...(terminalId.current ? { terminal: terminalId.current } : cwd ? { cwd } : {}) })
    void api.socketUrl(machine.id, `/mobile/terminal?${query}`).then(url => {
      if (disposed) return
      const ws = new WebSocket(url); socket.current = ws
      ws.onmessage = event => {
        let data: { type: string; id?: string; replay?: string; text?: string; exitCode?: number }
        try { data = JSON.parse(event.data) as { type: string; id?: string; replay?: string; text?: string; exitCode?: number } } catch { onError('Respuesta de terminal no válida.'); return }
        if (data.type === 'ready') { terminalId.current = data.id; if (data.id) localStorage.setItem(key, data.id); terminal.write(data.replay || ''); setConnected(true); fit.fit(); ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows })) }
        if (data.type === 'output') terminal.write(data.text || '')
        if (data.type === 'exit') { terminal.writeln(`\r\nProceso terminado (${data.exitCode}).`); terminalId.current = undefined; localStorage.removeItem(key) }
      }
      ws.onclose = event => { if (!disposed) { setConnected(false); if (event.code !== 1000) onError(event.reason || 'Terminal desconectado. Puedes reconectarlo.'); if (event.code === 1008) { terminalId.current = undefined; localStorage.removeItem(key) } } }
      ws.onerror = () => { if (!disposed) onError('No se pudo conectar el terminal del PC.') }
    }).catch(error => { if (!disposed) onError(error.message) })
    return () => { disposed = true; observer.disconnect(); input.dispose(); socket.current?.close(); socket.current = null; terminal.dispose() }
  }, [api, machine.id, profile, generation, onError])
  function write(text: string) { if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'input', text })) }
  return <section className="terminal-view"><div className="terminal-toolbar"><h2>Terminal</h2><button onClick={() => { setConnected(false); setGeneration(value => value + 1) }}>{connected ? 'Reconectar' : 'Conectar'}</button><button disabled={!connected} onClick={() => { if (window.confirm('¿Cerrar el proceso de este terminal?')) socket.current?.send(JSON.stringify({ type: 'close' })) }}>Cerrar proceso</button></div><div ref={host} className="terminal-host"/><div className="terminal-keys"><button disabled={!connected} onClick={() => write('\x1b')}>Esc</button><button disabled={!connected} onClick={() => write('\t')}>Tab</button><button disabled={!connected} onClick={() => write('\x03')}>Ctrl+C</button><button disabled={!connected} onClick={() => write('\x1b[A')}>Anterior</button><button disabled={!connected} onClick={() => write('\r')}>Enter</button></div></section>
}
