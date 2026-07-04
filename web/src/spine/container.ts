// Port of container.go + the zip layer (Go's zip.Reader/indexZipFiles/openZipPath),
// backed by fflate.
import { unzipSync, strFromU8 } from 'fflate'
import { posixClean } from './util'
import { parseXml } from './dom'
import { ErrMissingContainer, ErrNoRootfile } from './errors'

/** In-memory EPUB archive with clean-path lookup (mirrors Go's indexZipFiles). */
export class Archive {
  private byClean = new Map<string, Uint8Array>()
  readonly names: string[] = []

  constructor(bytes: Uint8Array) {
    const raw = unzipSync(bytes)
    for (const name of Object.keys(raw)) {
      if (name.endsWith('/')) continue // directory entries
      this.names.push(name)
      this.byClean.set(this.key(name), raw[name])
    }
  }

  private key(p: string): string {
    return posixClean(p.replace(/^\//, ''))
  }

  has(p: string): boolean {
    return this.byClean.has(this.key(p))
  }

  bytes(p: string): Uint8Array | undefined {
    return this.byClean.get(this.key(p))
  }

  text(p: string): string | undefined {
    const b = this.bytes(p)
    return b ? strFromU8(b) : undefined
  }
}

const CONTAINER_PATH = 'META-INF/container.xml'

/** Port of parseContainer — returns cleaned OPF rootfile paths. */
export function parseContainer(archive: Archive): string[] {
  const xml = archive.text(CONTAINER_PATH)
  if (xml === undefined) throw ErrMissingContainer
  const doc = parseXml(xml)
  const rootfiles = [...doc.getElementsByTagName('rootfile')]
  const paths: string[] = []
  for (const rf of rootfiles) {
    const full = rf.getAttribute('full-path')
    if (!full) continue
    paths.push(posixClean(full.replace(/^\//, '')))
  }
  if (paths.length === 0) throw ErrNoRootfile
  return paths
}

/** Port of findOPFs — scan the archive for *.opf (fallback path). */
export function findOpfs(archive: Archive): string[] {
  return archive.names.filter((n) => n.toLowerCase().endsWith('.opf'))
}
