import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'
import * as pty from 'node-pty'
import type WebSocket from 'ws'

interface TerminalSession { process: pty.IPty; buffer: string; peers: Set<WebSocket>; expires: NodeJS.Timeout | null }
export class Terminals {
  private sessions = new Map<string, TerminalSession>()
  attach(socket: WebSocket, id: string | undefined, cwd: string | undefined): void {
    if (id && !/^[a-f0-9-]{36}$/.test(id)) { socket.close(1008, 'Invalid terminal ID'); return }
    let terminal = id ? this.sessions.get(id) : undefined
    if (id && !terminal) { socket.close(1008, 'Terminal expired; open a new terminal'); return }
    if (!terminal) {
      if (this.sessions.size >= 8) { socket.close(1008, 'Close an existing terminal first'); return }
      const directory = cwd || homedir()
      if (!isAbsolute(directory) || !existsSync(directory) || !statSync(directory).isDirectory()) { socket.close(1008, 'Directory unavailable'); return }
      id = randomUUID()
      const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && !key.startsWith('MOBILE_') && !key.startsWith('FIREBASE_'))) as Record<string, string>
      const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/sh'
      const child = pty.spawn(shell, process.platform === 'win32' ? ['-NoLogo'] : ['-l'], { name: 'xterm-256color', cols: 80, rows: 24, cwd: directory, env })
      terminal = { process: child, buffer: '', peers: new Set(), expires: null }
      this.sessions.set(id, terminal)
      const owned = terminal, key = id
      child.onData(text => {
        owned.buffer = (owned.buffer + text).slice(-65536)
        for (const peer of owned.peers) {
          if (peer.bufferedAmount > 1024 * 1024) peer.close(1013, 'Terminal output too fast')
          else if (peer.readyState === 1) peer.send(JSON.stringify({ type: 'output', text }))
        }
      })
      child.onExit(({ exitCode }) => {
        for (const peer of owned.peers) { if (peer.readyState === 1) peer.send(JSON.stringify({ type: 'exit', exitCode })); peer.close(1000) }
        if (owned.expires) clearTimeout(owned.expires)
        this.sessions.delete(key)
      })
    }
    const owned = terminal, key = id!
    if (owned.expires) clearTimeout(owned.expires)
    owned.expires = null; owned.peers.add(socket)
    socket.send(JSON.stringify({ type: 'ready', id: key, replay: owned.buffer }))
    socket.on('message', raw => {
      try {
        const data = JSON.parse(raw.toString())
        if (data.type === 'input' && typeof data.text === 'string' && data.text.length <= 65536) owned.process.write(data.text)
        else if (data.type === 'resize' && Number.isInteger(data.cols) && Number.isInteger(data.rows) && data.cols >= 10 && data.cols <= 400 && data.rows >= 2 && data.rows <= 200) owned.process.resize(data.cols, data.rows)
        else if (data.type === 'close') owned.process.kill()
        else socket.close(1008, 'Invalid terminal message')
      } catch { socket.close(1008, 'Invalid terminal message') }
    })
    socket.on('close', () => {
      owned.peers.delete(socket)
      // shortcut: detached terminals expire after 15 minutes; add durable sessions if longer disconnects are needed.
      if (!owned.peers.size && this.sessions.has(key)) owned.expires = setTimeout(() => owned.process.kill(), 15 * 60_000)
    })
  }
  close() { for (const terminal of this.sessions.values()) { if (terminal.expires) clearTimeout(terminal.expires); terminal.process.kill() }; this.sessions.clear() }
}
