import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { chmodSync, existsSync } from 'node:fs'

// node-pty ships its macOS helper without the executable bit in the npm tarball.
if (process.platform === 'darwin') {
  const root = dirname(createRequire(import.meta.url).resolve('node-pty/package.json'))
  for (const directory of [`prebuilds/darwin-${process.arch}`, 'build/Release']) {
    const helper = join(root, directory, 'spawn-helper')
    if (existsSync(helper)) chmodSync(helper, 0o755)
  }
}
