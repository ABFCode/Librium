import { render } from 'vitest-browser-react'
import { describe, it, expect, vi } from 'vitest'
import { ReaderPreferencesModal } from '../components/ReaderPreferencesModal'

describe('ReaderPreferencesModal', () => {
  it('does not render when closed', async () => {
    const screen = await render(
      <ReaderPreferencesModal
        isOpen={false}
        onClose={() => {}}
        fontSize={16}
        setFontScale={() => {}}
        lineHeight={1.7}
        setLineHeight={() => {}}
        contentWidth={720}
        setContentWidth={() => {}}
        theme="night"
        setTheme={() => {}}
      />,
    )

    expect(screen.container.childElementCount).toBe(0)
  })

  it('closes on backdrop click but not on panel click', async () => {
    const onClose = vi.fn()
    const screen = await render(
      <ReaderPreferencesModal
        isOpen
        onClose={onClose}
        fontSize={16}
        setFontScale={() => {}}
        lineHeight={1.7}
        setLineHeight={() => {}}
        contentWidth={720}
        setContentWidth={() => {}}
        theme="night"
        setTheme={() => {}}
      />,
    )

    // Click inside the panel: stays open.
    await screen.getByText('Reader preferences').click()
    expect(onClose).not.toHaveBeenCalled()
    // Click the backdrop: closes.
    ;(screen.container.firstElementChild as HTMLElement).click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    await render(
      <ReaderPreferencesModal
        isOpen
        onClose={onClose}
        fontSize={16}
        setFontScale={() => {}}
        lineHeight={1.7}
        setLineHeight={() => {}}
        contentWidth={720}
        setContentWidth={() => {}}
        theme="night"
        setTheme={() => {}}
      />,
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('invokes the font size controls', async () => {
    const setFontScale = vi.fn()
    const screen = await render(
      <ReaderPreferencesModal
        isOpen
        onClose={() => {}}
        fontSize={16}
        setFontScale={setFontScale}
        lineHeight={1.7}
        setLineHeight={() => {}}
        contentWidth={720}
        setContentWidth={() => {}}
        theme="night"
        setTheme={() => {}}
      />,
    )

    await screen.getByText('A+').click()
    expect(setFontScale).toHaveBeenCalledTimes(1)
    const updater = setFontScale.mock.calls[0]?.[0]
    expect(typeof updater).toBe('function')
    expect(updater(2)).toBe(3)
    expect(updater(7)).toBe(8)
    expect(updater(8)).toBe(8)
  })
})
