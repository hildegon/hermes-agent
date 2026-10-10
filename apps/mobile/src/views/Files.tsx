import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { useEffect, useState } from 'react'
import { ArrowLeft, FileText, Folder, Download, Upload, Save } from 'lucide-react'
import type { ViewProps } from '../Workspace'
interface Entry { name: string; path: string; isDirectory: boolean }
interface Preview { path: string; text: string; binary: boolean; truncated: boolean }
export default function Files({ api, machine, profile, cwd, onError }: ViewProps) {
  const [path, setPath] = useState(cwd), [entries, setEntries] = useState<Entry[]>([]), [preview, setPreview] = useState<Preview | null>(null), [text, setText] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { if (!path && cwd) setPath(cwd) }, [cwd, path])
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    setEntries([]); setPreview(null)
    void api.gateway<{ entries: Entry[]; error?: string }>(machine.id, profile, `/api/fs/list?path=${encodeURIComponent(path)}`, 'GET', undefined, controller.signal).then(result => { if (result.error) throw new Error(result.error); setEntries(result.entries) }).catch(error => { if (!controller.signal.aborted) onError(error.message) })
    return () => controller.abort()
  }, [api, machine.id, profile, path, onError])
  async function act(action: () => Promise<void>) { setBusy(true); try { await action() } catch (error) { onError((error as Error).message) } finally { setBusy(false) } }
  async function read(entry: Entry) {
    if (entry.isDirectory) { setPath(entry.path); return }
    const value = await api.gateway<Preview>(machine.id, profile, `/api/fs/read-text?path=${encodeURIComponent(entry.path)}`)
    setPreview(value); setText(value.text)
  }
  async function download() {
    if (!preview) return
    const response = await api.response(api.gatewayPath(machine.id, profile, `/api/fs/download?path=${encodeURIComponent(preview.path)}`))
    const blob = await response.blob()
    if (Capacitor.isNativePlatform()) {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob) })
      const name = preview.path.split(/[\\/]/).pop() || 'archivo'
      const file = await Filesystem.writeFile({ path: `exports/${Date.now()}-${name}`, data, directory: Directory.Cache, recursive: true })
      // The recipient may read after the chooser resolves; keep the file in private OS cache.
      await Share.share({ title: name, files: [file.uri] })
      return
    }
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = preview.path.split(/[\\/]/).pop() || 'archivo'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function save() {
    if (!preview || preview.binary || preview.truncated) return
    const current = await api.gateway<Preview>(machine.id, profile, `/api/fs/read-text?path=${encodeURIComponent(preview.path)}`)
    if (current.text !== preview.text) throw new Error('El archivo cambió en el PC. Vuelve a abrirlo antes de guardar.')
    await api.gateway(machine.id, profile, '/api/fs/write-text', 'POST', { path: preview.path, content: text })
    setPreview({ ...preview, text })
  }
  return <section className="tool-page"><h2>Archivos</h2><form className="path-form" onSubmit={event => { event.preventDefault(); setPath(new FormData(event.currentTarget).get('path') as string) }}><label>Carpeta del PC<input name="path" key={path} defaultValue={path}/></label><button disabled={busy}>Abrir</button></form>
    {preview ? <><div className="actions"><button onClick={() => setPreview(null)}><ArrowLeft/>Carpeta</button><button disabled={busy} onClick={() => void act(download)}><Download/>Descargar</button><button disabled={busy || preview.binary || preview.truncated || text === preview.text} onClick={() => void act(save)}><Save/>Guardar</button></div><p className="file-path">{preview.path}</p>{preview.binary ? <p>Este archivo es binario. Descárgalo para abrirlo.</p> : <label>Contenido<textarea className="code-editor" value={text} readOnly={preview.truncated} onChange={event => setText(event.target.value)}/></label>}{preview.truncated ? <p className="notice">La vista está truncada; la edición está desactivada para conservar el archivo completo.</p> : null}</> : <><div className="file-list">{entries.map(entry => <button className="file-row" key={entry.path} disabled={busy} onClick={() => void act(() => read(entry))}>{entry.isDirectory ? <Folder/> : <FileText/>}<span>{entry.name}</span></button>)}</div><label className="upload-control"><Upload/>Subir archivo al PC<input type="file" disabled={busy || !path} onChange={event => { const file = event.target.files?.[0]; if (file) void act(async () => { if (file.size > 8 * 1024 * 1024) throw new Error('Máximo 8 MB por archivo.'); const data = new FormData(); data.append('file', file); data.append('path', `${path.replace(/[\\/]$/, '')}/${file.name}`); data.append('overwrite', 'false'); await api.response(api.gatewayPath(machine.id, profile, '/api/files/upload-stream'), 'POST', data); setPath(previous => previous); const result = await api.gateway<{ entries: Entry[] }>(machine.id, profile, `/api/fs/list?path=${encodeURIComponent(path)}`); setEntries(result.entries) }); event.target.value = '' }}/></label></>}
  </section>
}
