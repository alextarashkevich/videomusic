import { clearConfig, defaultConfig, saveConfig, type Config } from '../config'
import { CONTROLS, ROOT_OPTIONS, SCALE_OPTIONS, type Control } from './controls'

export type TuningPanel = {
  toggle: () => void
  dispose: () => void
}

/**
 * Live controls for every threshold the instrument is judged by.
 *
 * These numbers can only be found by feel, and rebuild-and-wave is far too slow a loop
 * to find them in. The config object is mutated in place and read fresh every frame, so
 * every change is audible immediately — and saved, so a tuning session survives a reload.
 */
export function createTuningPanel(config: Config): TuningPanel {
  const panel = document.createElement('aside')
  panel.id = 'tuning'
  panel.hidden = true

  const header = document.createElement('div')
  header.className = 'tuning-header'
  header.innerHTML = '<strong>Tuning</strong><span>press T</span>'
  panel.append(header)

  const body = document.createElement('div')
  body.className = 'tuning-body'
  panel.append(body)

  const refreshers: (() => void)[] = []
  let currentGroup = ''

  for (const control of CONTROLS) {
    if (control.group !== currentGroup) {
      currentGroup = control.group
      const heading = document.createElement('h2')
      heading.textContent = currentGroup
      body.append(heading)
    }
    refreshers.push(addSlider(body, config, control))
  }

  body.append(makeHeading('Scale'))
  refreshers.push(addRootSelect(body, config))
  refreshers.push(addScaleSelect(body, config))

  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'tuning-reset'
  reset.textContent = 'Reset to defaults'
  reset.addEventListener('click', () => {
    const fresh = structuredClone(defaultConfig)
    for (const key of Object.keys(config) as (keyof Config)[]) {
      Object.assign(config[key], fresh[key])
    }
    clearConfig()
    for (const refresh of refreshers) refresh()
  })
  body.append(reset)

  document.body.append(panel)

  function onKey(event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== 't') return
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
    panel.hidden = !panel.hidden
  }

  window.addEventListener('keydown', onKey)

  return {
    toggle: () => {
      panel.hidden = !panel.hidden
    },
    dispose: () => {
      window.removeEventListener('keydown', onKey)
      panel.remove()
    },
  }
}

function makeHeading(text: string): HTMLElement {
  const heading = document.createElement('h2')
  heading.textContent = text
  return heading
}

function addSlider(parent: HTMLElement, config: Config, control: Control): () => void {
  const row = document.createElement('label')
  row.className = 'tuning-row'
  row.title = control.hint

  const name = document.createElement('span')
  name.className = 'tuning-label'
  name.textContent = control.label

  const readout = document.createElement('span')
  readout.className = 'tuning-value'

  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(control.min)
  input.max = String(control.max)
  input.step = String(control.step)

  const show = (value: number) => {
    readout.textContent = control.format?.(value) ?? value.toFixed(precisionOf(control.step))
  }

  const refresh = () => {
    const value = control.get(config)
    input.value = String(value)
    show(value)
  }

  input.addEventListener('input', () => {
    const value = Number(input.value)
    control.set(config, value)
    show(value)
    saveConfig(config)
  })

  refresh()
  row.append(name, readout, input)
  parent.append(row)
  return refresh
}

function addRootSelect(parent: HTMLElement, config: Config): () => void {
  const row = document.createElement('label')
  row.className = 'tuning-row'
  row.title = 'Tonic the seven degrees are built on.'

  const name = document.createElement('span')
  name.className = 'tuning-label'
  name.textContent = 'Root'

  const select = document.createElement('select')
  for (const note of ROOT_OPTIONS) {
    const option = document.createElement('option')
    option.value = note
    option.textContent = note
    select.append(option)
  }

  select.addEventListener('change', () => {
    config.music.root = select.value
    saveConfig(config)
  })

  const refresh = () => {
    select.value = config.music.root
  }

  refresh()
  row.append(name, select)
  parent.append(row)
  return refresh
}

function addScaleSelect(parent: HTMLElement, config: Config): () => void {
  const row = document.createElement('label')
  row.className = 'tuning-row'
  row.title = 'Which seven notes the right hand picks from.'

  const name = document.createElement('span')
  name.className = 'tuning-label'
  name.textContent = 'Scale'

  const select = document.createElement('select')
  for (const scale of SCALE_OPTIONS) {
    const option = document.createElement('option')
    option.value = scale.name
    option.textContent = scale.name
    select.append(option)
  }

  select.addEventListener('change', () => {
    const chosen = SCALE_OPTIONS.find((scale) => scale.name === select.value)
    if (chosen !== undefined) {
      config.music.scale = [...chosen.steps]
      saveConfig(config)
    }
  })

  const refresh = () => {
    const match = SCALE_OPTIONS.find(
      (scale) => scale.steps.join(',') === config.music.scale.join(','),
    )
    select.value = match?.name ?? SCALE_OPTIONS[0]!.name
  }

  refresh()
  row.append(name, select)
  parent.append(row)
  return refresh
}

function precisionOf(step: number): number {
  const text = String(step)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}
