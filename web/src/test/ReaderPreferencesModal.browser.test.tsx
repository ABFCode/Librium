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
        fontFamily="sans"
        setFontFamily={() => {}}
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
        fontFamily="sans"
        setFontFamily={() => {}}
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
        fontFamily="sans"
        setFontFamily={() => {}}
      />,
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('maps the font size slider to fontScale half-steps', async () => {
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
        fontFamily="sans"
        setFontFamily={() => {}}
      />,
    )

    const slider = screen.container.querySelector(
      'input[type="range"]',
    ) as HTMLInputElement
    expect(slider).toBeTruthy()
    expect(slider.min).toBe('12')
    expect(slider.max).toBe('36')
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!
    setValue.call(slider, '23')
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    expect(setFontScale).toHaveBeenCalledWith((23 - 16) / 2)
  })
})
