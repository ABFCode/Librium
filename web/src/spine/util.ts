// Port of util.go + Go's `path` package helpers (POSIX, slash-separated).

/** Go path.Clean — lexical cleanup of a slash path. */
export function posixClean(p: string): string {
  if (p === '') return '.'
  const rooted = p[0] === '/'
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else if (!rooted) out.push('..')
    } else {
      out.push(seg)
    }
  }
  const res = (rooted ? '/' : '') + out.join('/')
  return res === '' ? '.' : res
}

/** Go path.Join — join non-empty parts then Clean. */
export function posixJoin(...parts: string[]): string {
  const joined = parts.filter((p) => p !== '').join('/')
  return joined === '' ? '' : posixClean(joined)
}

/** Go path.Dir. */
export function posixDir(p: string): string {
  const i = p.lastIndexOf('/')
  const dir = i < 0 ? '' : p.slice(0, i)
  return posixClean(dir === '' ? (i < 0 ? '.' : '/') : dir)
}

/** Go path.Ext. */
export function posixExt(p: string): string {
  for (let i = p.length - 1; i >= 0 && p[i] !== '/'; i--) {
    if (p[i] === '.') return p.slice(i)
  }
  return ''
}

/** Port of resolvePath(base, href) — resolves an href against a base dir, keeping any #fragment. */
export function resolvePath(base: string, href: string): string {
  if (href === '') return ''
  if (href.includes('://') || href.startsWith('data:') || href.startsWith('mailto:')) return href
  const hashIdx = href.indexOf('#')
  let ref = hashIdx === -1 ? href : href.slice(0, hashIdx)
  const frag = hashIdx === -1 ? '' : href.slice(hashIdx)
  ref = ref.replace(/^\//, '')
  if (base === '.' || base === '/') base = ''
  if (base === '') return ref === '' ? frag : posixClean(ref) + frag
  if (ref === '') return posixClean(base) + frag
  return posixClean(posixJoin(base, ref)) + frag
}

/** Splits "path#id" -> [path, id]. */
export function splitHrefAnchor(href: string): [string, string] {
  const i = href.indexOf('#')
  return i === -1 ? [href, ''] : [href.slice(0, i), href.slice(i + 1)]
}

export function anchorKey(href: string, id: string): string {
  return href === '' ? '#' + id : href + '#' + id
}

// Non-crypto stable id. Spine uses sha1; chunk IDs are opaque and not part of
// Librium's output contract, so a deterministic sync hash is sufficient here.
export function stableId(...parts: string[]): string {
  let h = 0x811c9dc5
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      h ^= p.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    h ^= 0
    h = Math.imul(h, 0x01000193)
  }
  return 'id_' + (h >>> 0).toString(16).padStart(8, '0')
}

const EXT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.xhtml': 'application/xhtml+xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.ncx': 'application/x-dtbncx+xml',
  '.opf': 'application/oebps-package+xml',
}

export function contentTypeFromHref(href: string): string {
  return EXT_TYPES[posixExt(href).toLowerCase()] ?? ''
}
