import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { anchorScrollTop, findAnchor } from '../lib/readerAnchors'

// Real-layout tests for the anchor math behind progress saves, restore,
// bookmarks, and search jumps. Regression history: pixel offsets didn't
// survive font/width changes, and (blockIndex+1)-style off-by-ones showed
// fresh books as already started.

let container: HTMLDivElement

const buildChapter = (blockCount: number, blockHeight: number) => {
  container = document.createElement('div')
  container.style.cssText =
    'height: 300px; overflow: auto; position: relative;'
  for (let i = 0; i < blockCount; i++) {
    const p = document.createElement('p')
    p.dataset.chunkIndex = String(i)
    p.style.cssText = `height: ${blockHeight}px; margin: 0;`
    p.textContent = `block ${i}`
    container.appendChild(p)
  }
  document.body.appendChild(container)
}

afterEach(() => {
  container?.remove()
})

describe('findAnchor / anchorScrollTop', () => {
  beforeEach(() => buildChapter(20, 100))

  it('reads (0, 0) at the top of a chapter', () => {
    container.scrollTop = 0
    const anchor = findAnchor(container)
    expect(anchor.blockIndex).toBe(0)
    expect(anchor.fraction).toBe(0)
    expect(anchor.sectionFraction).toBe(0)
  })

  it('identifies the block and fraction under the viewport top', () => {
    // 40% into block 5.
    container.scrollTop = 5 * 100 + 40
    const anchor = findAnchor(container)
    expect(anchor.blockIndex).toBe(5)
    expect(anchor.fraction).toBeCloseTo(0.4, 5)
  })

  it('round-trips: anchorScrollTop restores exactly what findAnchor saved', () => {
    container.scrollTop = 731
    const anchor = findAnchor(container)
    const top = anchorScrollTop(container, anchor.blockIndex, anchor.fraction)
    expect(top).not.toBeNull()
    expect(Math.abs(top! - 731)).toBeLessThan(1)
  })

  it('round-trips across a layout change (the cross-device guarantee)', () => {
    container.scrollTop = 5 * 100 + 40
    const anchor = findAnchor(container)
    // Reflow: every block doubles in height (font-size change analogue).
    for (const node of Array.from(
      container.querySelectorAll('[data-chunk-index]'),
    )) {
      ;(node as HTMLElement).style.height = '200px'
    }
    const top = anchorScrollTop(container, anchor.blockIndex, anchor.fraction)
    // Same block, same 40% through it, in the new geometry.
    expect(top).toBeCloseTo(5 * 200 + 0.4 * 200, 5)
  })

  it('reports sectionFraction = 1 at the very end of the content', () => {
    container.scrollTop = container.scrollHeight - container.clientHeight
    const anchor = findAnchor(container)
    expect(anchor.sectionFraction).toBe(1)
  })

  it('reports proportional sectionFraction mid-chapter', () => {
    container.scrollTop = 10 * 100 // top of block 10 of 20
    const anchor = findAnchor(container)
    expect(anchor.sectionFraction).toBeCloseTo(0.5, 5)
  })

  it('returns null scroll target for a missing block', () => {
    expect(anchorScrollTop(container, 999, 0)).toBeNull()
  })

  it('clamps out-of-range fractions instead of overshooting', () => {
    const top = anchorScrollTop(container, 5, 7)
    expect(top).toBe(5 * 100 + 100)
  })
})
