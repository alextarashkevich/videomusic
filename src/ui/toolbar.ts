export type ToolbarButton = {
  label: string
  /** Physical key that does the same thing, shown on the button. */
  key?: string
  title?: string
  onClick: () => void
  /** Called after every click so the label can reflect new state. */
  label2?: () => string
}

export type Toolbar = {
  /** Re-reads every dynamic label. */
  refresh: () => void
  setVisible: (visible: boolean) => void
  dispose: () => void
}

/**
 * Visible controls for everything the keyboard shortcuts do.
 *
 * The shortcuts are not enough on their own: they are hard to discover, and on a
 * non-Latin keyboard layout they used to do nothing at all, because the handler compared
 * against the character produced rather than the key pressed.
 */
/** `parent` puts the bar somewhere other than the bottom of the screen — the settings panel
 *  hosts one, so the buttons and the sliders share a scroll. */
export function createToolbar(buttons: readonly ToolbarButton[], parent?: HTMLElement): Toolbar {
  const bar = document.createElement('nav')
  if (parent === undefined) bar.id = 'toolbar'
  else bar.className = 'toolbar-inline'

  const refreshers: (() => void)[] = []

  for (const button of buttons) {
    const element = document.createElement('button')
    element.type = 'button'
    if (button.title !== undefined) element.title = button.title

    const text = document.createElement('span')
    const paint = () => {
      text.textContent = button.label2?.() ?? button.label
    }

    element.append(text)
    if (button.key !== undefined) {
      const hint = document.createElement('kbd')
      hint.textContent = button.key
      element.append(hint)
    }

    element.addEventListener('click', () => {
      button.onClick()
      for (const refresh of refreshers) refresh()
    })

    paint()
    refreshers.push(paint)
    bar.append(element)
  }

  ;(parent ?? document.body).append(bar)

  return {
    refresh: () => {
      for (const refresh of refreshers) refresh()
    },
    setVisible: (visible) => {
      bar.hidden = !visible
    },
    dispose: () => bar.remove(),
  }
}
