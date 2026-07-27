import { PRESETS } from '../audio/presets'
import { clearConfig, defaultConfig, saveConfig, type Config } from '../config'
import { CONTROLS, ROOT_OPTIONS, SCALE_OPTIONS, type Control } from './controls'

export type TuningPanel = {
  toggle: () => void
  readonly open: boolean
  /** Fires whenever the panel opens or closes, so whatever shares the right-hand side
   *  of the screen can get out of the way. */
  onToggle: (listener: (open: boolean) => void) => void
  /** Re-reads every control from the config. Needed because some settings are also set
   *  from outside the panel — calibration writes several of them — and a slider showing a
   *  stale number is worse than no slider. */
  refresh: () => void
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

  body.append(makeHeading('Sound'))
  refreshers.push(addPresetSelect(body, config))

  body.append(makeHeading('Hands'))
  refreshers.push(
    addToggle(
      body,
      'Swap hands',
      'Which physical hand chooses chords. Flip this if the wrong hand is playing notes — which way round the tracker reports handedness is not the same on every browser and camera.',
      config,
      (c) => c.vision.swapHands,
      (c, value) => {
        c.vision.swapHands = value
      },
    ),
  )
  refreshers.push(
    addToggle(
      body,
      'Depth-aware shape',
      'Reads hand shape from the tracker\u2019s 3D output instead of the flat image, so turning your hand away from the camera cannot shorten a finger into reading as folded. The depth estimate is noisier than the rest, so turn it off if recognition gets jumpier rather than steadier.',
      config,
      (c) => c.vision.use3d,
      (c, value) => {
        c.vision.use3d = value
      },
    ),
  )

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

  const listeners: ((open: boolean) => void)[] = []

  function setOpen(open: boolean): void {
    panel.hidden = !open
    for (const listener of listeners) listener(open)
  }

  // No keyboard handler here on purpose. main.ts owns every shortcut; a listener here as
  // well meant the T key toggled the panel twice in one press and it appeared to do
  // nothing at all.
  return {
    get open() {
      return !panel.hidden
    },
    toggle: () => setOpen(panel.hidden),
    onToggle: (listener) => listeners.push(listener),
    refresh: () => {
      for (const refresh of refreshers) refresh()
    },
    dispose: () => panel.remove(),
  }
}

function makeHeading(text: string): HTMLElement {
  const heading = document.createElement('h2')
  heading.textContent = text
  return heading
}

function addPresetSelect(parent: HTMLElement, config: Config): () => void {
  const row = document.createElement('label')
  row.className = 'tuning-row'

  const name = document.createElement('span')
  name.className = 'tuning-label'
  name.textContent = 'Synth'

  const select = document.createElement('select')
  for (const preset of PRESETS) {
    const option = document.createElement('option')
    option.value = preset.name
    option.textContent = preset.name
    option.title = preset.hint
    select.append(option)
  }

  const hint = document.createElement('span')
  hint.className = 'tuning-hint'

  const showHint = () => {
    hint.textContent = PRESETS.find((p) => p.name === select.value)?.hint ?? ''
  }

  select.addEventListener('change', () => {
    // main.ts watches this and tells the engine — the panel stays free of audio.
    config.sound.preset = select.value
    showHint()
    saveConfig(config)
  })

  const refresh = () => {
    select.value = config.sound.preset
    showHint()
  }

  refresh()
  row.append(name, select, hint)
  parent.append(row)
  return refresh
}

function addToggle(
  parent: HTMLElement,
  label: string,
  hint: string,
  config: Config,
  get: (config: Config) => boolean,
  set: (config: Config, value: boolean) => void,
): () => void {
  const row = document.createElement('label')
  row.className = 'tuning-row'
  row.title = hint

  const name = document.createElement('span')
  name.className = 'tuning-label'
  name.textContent = label

  const input = document.createElement('input')
  input.type = 'checkbox'

  input.addEventListener('change', () => {
    set(config, input.checked)
    saveConfig(config)
  })

  const refresh = () => {
    input.checked = get(config)
  }

  refresh()
  row.append(name, input)
  parent.append(row)
  return refresh
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
