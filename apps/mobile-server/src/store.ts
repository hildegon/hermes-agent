import { DatabaseSync } from 'node:sqlite'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'

export interface Machine { id: string; owner: string; name: string; url: string; credential: string }
export class Store {
  readonly db: DatabaseSync
  private readonly key: Buffer
  constructor(filename: string, key: string) {
    this.key = Buffer.from(key, 'base64')
    if (this.key.length !== 32) throw new Error('MOBILE_ENCRYPTION_KEY must encode 32 random bytes')
    this.db = new DatabaseSync(filename)
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS machines(id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, credential TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pairings(code TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, credential TEXT NOT NULL, expires INTEGER NOT NULL, machine TEXT);
      CREATE TABLE IF NOT EXISTS tickets(code TEXT PRIMARY KEY, owner TEXT NOT NULL, machine TEXT NOT NULL, path TEXT NOT NULL, expires INTEGER NOT NULL);`)
  }
  seal(value: string): string {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
  }
  open(value: string): string {
    const bytes = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12))
    decipher.setAuthTag(bytes.subarray(12, 28))
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
  }
  prune(now = Date.now()): void {
    this.db.prepare('DELETE FROM pairings WHERE expires <= ?').run(now)
    this.db.prepare('DELETE FROM tickets WHERE expires <= ?').run(now)
  }
  pairing(name: string, url: string, credential: string, now = Date.now()) {
    this.prune(now)
    const code = randomBytes(24).toString('base64url'), expires = now + 300_000
    this.db.prepare('INSERT INTO pairings VALUES(?,?,?,?,?,NULL)').run(hash(code), name, url, this.seal(credential), expires)
    return { code, expires }
  }
  preview(code: string, now = Date.now()): { name: string; url: string } | undefined {
    return this.db.prepare('SELECT name,url FROM pairings WHERE code=? AND expires>? AND machine IS NULL').get(hash(code), now) as { name: string; url: string } | undefined
  }
  confirm(code: string, owner: string, now = Date.now()): Machine | undefined {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const row = this.db.prepare('SELECT * FROM pairings WHERE code=? AND expires>? AND machine IS NULL').get(hash(code), now) as { name: string; url: string; credential: string } | undefined
      if (!row) { this.db.exec('ROLLBACK'); return }
      const id = randomUUID()
      this.db.prepare('INSERT INTO machines VALUES(?,?,?,?,?)').run(id, owner, row.name, row.url, row.credential)
      this.db.prepare('UPDATE pairings SET machine=?,credential=? WHERE code=?').run(id, '', hash(code))
      this.db.exec('COMMIT')
      return this.machine(id, owner)
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  pairingStatus(code: string, now = Date.now()): { machine: string | null } | undefined {
    return this.db.prepare('SELECT machine FROM pairings WHERE code=? AND expires>?').get(hash(code), now) as { machine: string | null } | undefined
  }
  list(owner: string): Omit<Machine, 'credential' | 'owner'>[] {
    return this.db.prepare('SELECT id,name,url FROM machines WHERE owner=? ORDER BY name').all(owner) as Omit<Machine, 'credential' | 'owner'>[]
  }
  machine(id: string, owner: string): Machine | undefined {
    const row = this.db.prepare('SELECT * FROM machines WHERE id=? AND owner=?').get(id, owner) as Machine | undefined
    return row ? { ...row, credential: this.open(row.credential) } : undefined
  }
  revoke(id: string, owner: string): void {
    this.db.prepare('DELETE FROM machines WHERE id=? AND owner=?').run(id, owner)
    this.db.prepare('DELETE FROM tickets WHERE machine=? AND owner=?').run(id, owner)
  }
  ticket(owner: string, machine: string, path: string, now = Date.now()): string {
    this.prune(now)
    const code = randomBytes(24).toString('base64url')
    this.db.prepare('INSERT INTO tickets VALUES(?,?,?,?,?)').run(hash(code), owner, machine, path, now + 30_000)
    return code
  }
  consumeTicket(code: string, machine: string, path: string, now = Date.now()): string | undefined {
    const row = this.db.prepare('DELETE FROM tickets WHERE code=? AND machine=? AND path=? AND expires>? RETURNING owner').get(hash(code), machine, path, now) as { owner: string } | undefined
    return row?.owner
  }
  close() { this.db.close() }
}
function hash(value: string) { return createHash('sha256').update(value).digest('hex') }
