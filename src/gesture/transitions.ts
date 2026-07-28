/**
 * Measuring how long a chord change takes to arrive.
 *
 * Diagnostics only. Nothing here touches the sound, and nothing reads it except the readout.
 *
 * **What it is for.** Changing chord usually means moving both hands, and two hands do not
 * arrive together — for the tenth of a second between them the instrument is being shown a
 * shape nobody meant, and it plays it. Going from C to A minor, the chord hand can reach коза
 * while the other thumb is still out, and A *major* sounds on the way past.
 *
 * There are several ways to stop that, and they cost different amounts of latency. Choosing
 * between them on the basis of how long the gap actually is beats choosing on the basis of
 * how long it feels — a gap of 80 ms and a gap of 400 ms have different answers, and one of
 * them needs no fix at all.
 *
 * **What counts as a transition.** Every change to any part of the chord opens one; it closes
 * once nothing has changed for `SETTLE_MS`. The number that matters is the *span*: how long
 * from the first component moving to the last one landing. A span of zero means both hands
 * were read on the same frame and nothing wrong was ever played.
 */
import type { PerformanceState } from '../types'

/** How long the chord must sit still before the move is treated as finished. Longer than any
 *  plausible hand-to-hand gap, shorter than the gap between two chords actually played. */
const SETTLE_MS = 400

/** The parts of the state that make a chord. Tilt and volume are continuous and change on
 *  every frame; they are not part of what gets committed. */
export type ChordParts = {
  gate: boolean
  degree: number | null
  quality: string
  density: number
}

export type PartName = 'gate' | 'degree' | 'quality' | 'density'

export function partsOf(state: PerformanceState): ChordParts {
  return {
    gate: state.gate,
    degree: state.degree,
    quality: state.quality,
    density: state.density,
  }
}

export function spell(parts: ChordParts): string {
  if (!parts.gate) return 'muted'
  if (parts.degree === null) return '—'
  return `${parts.degree}${parts.quality === 'minor' ? 'm' : ''}/${parts.density}`
}

function changedParts(before: ChordParts, after: ChordParts): PartName[] {
  const names: PartName[] = ['gate', 'degree', 'quality', 'density']
  return names.filter((name) => before[name] !== after[name])
}

export type Transition = {
  from: string
  to: string
  /** Milliseconds from the first part moving to the last one landing. Zero when the whole
   *  chord changed on one frame, which is the case that needs no fixing. */
  spanMs: number
  /** Which parts moved, in the order they moved. */
  order: PartName[]
  /** Chords sounded on the way that were neither the one before nor the one after. Each of
   *  these was struck. */
  through: string[]
  /**
   * True when it came back to where it started.
   *
   * A different animal from a chord change, and mixing the two would poison the number this
   * exists to produce. A move that ends where it began is not two hands failing to agree —
   * it is one hand being read as something it was not, briefly. Both are worth knowing about
   * and they have different fixes: hand-to-hand lag wants the strike delayed, recognition
   * flicker wants more stability frames. So they are counted apart.
   */
  wobble: boolean
}

export type TransitionLog = {
  /** Feed every *fresh* frame. `nowMs` is any monotonic clock. */
  push: (state: PerformanceState, nowMs: number) => void
  /** Closes a transition still in progress, so the last one is not lost on read. */
  flush: (nowMs: number) => void
  readonly transitions: readonly Transition[]
  /** One line for the readout. */
  summary: () => string
  /** The full table, for the console. */
  report: () => string
  reset: () => void
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0
  const at = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))
  return sorted[at]!
}

export function createTransitionLog(): TransitionLog {
  const transitions: Transition[] = []

  let settled: ChordParts | null = null
  let open: {
    from: ChordParts
    startedAt: number
    lastChangeAt: number
    order: PartName[]
    through: string[]
    latest: ChordParts
  } | null = null

  function close(): void {
    if (open === null) return

    const to = spell(open.latest)
    const from = spell(open.from)
    transitions.push({
      from,
      to,
      spanMs: Math.round(open.lastChangeAt - open.startedAt),
      order: open.order,
      // The chord it ended on is not something it passed *through*. The one it started from
      // is, though — on a wobble that is the whole event.
      through: open.through.filter((chord) => chord !== to),
      wobble: from === to,
    })

    settled = open.latest
    open = null
  }

  return {
    transitions,

    push(state, nowMs) {
      const parts = partsOf(state)

      if (settled === null) {
        settled = parts
        return
      }

      const reference = open?.latest ?? settled
      const moved = changedParts(reference, parts)

      if (moved.length === 0) {
        // Nothing moving. Once it has been still long enough, the move is over.
        if (open !== null && nowMs - open.lastChangeAt >= SETTLE_MS) close()
        return
      }

      if (open === null) {
        open = {
          from: settled,
          startedAt: nowMs,
          lastChangeAt: nowMs,
          order: [...moved],
          through: [],
          latest: parts,
        }
        return
      }

      open.lastChangeAt = nowMs
      for (const name of moved) if (!open.order.includes(name)) open.order.push(name)
      open.through.push(spell(open.latest))
      open.latest = parts
    },

    flush(nowMs) {
      if (open !== null && nowMs - open.lastChangeAt >= SETTLE_MS) close()
    },

    summary() {
      const changes = transitions.filter((t) => !t.wobble)
      const wobbles = transitions.length - changes.length
      if (changes.length === 0) {
        return wobbles === 0 ? 'changes  none yet' : `changes    0   wobbles ${wobbles}`
      }

      const spans = changes.map((t) => t.spanMs).sort((a, b) => a - b)
      const wrong = changes.filter((t) => t.through.length > 0).length

      return (
        `changes ${String(changes.length).padStart(3)}   ` +
        `span med ${String(percentile(spans, 0.5)).padStart(3)}  ` +
        `p90 ${String(percentile(spans, 0.9)).padStart(3)} ms   ` +
        `wrong chord ${Math.round((wrong / changes.length) * 100)}%   ` +
        `wobbles ${wobbles}`
      )
    },

    report() {
      const lines = [
        'Chord transitions — how long both hands take to agree.',
        '',
        this.summary(),
        '',
        '  span is first part moving → last part landing. Zero means both hands were read on',
        '  the same frame and nothing unintended was played.',
        '  wobble = came back to where it started; that is recognition flicker, not hand lag.',
        '',
        'from      to        span  moved                     passed through',
      ]

      for (const t of transitions) {
        lines.push(
          `${t.from.padEnd(9)} ${t.to.padEnd(9)} ${String(t.spanMs).padStart(4)}  ` +
            `${(t.wobble ? `${t.order.join('→')} (wobble)` : t.order.join('→')).padEnd(25)} ` +
            `${t.through.join(' ') || '—'}`,
        )
      }

      return lines.join('\n')
    },

    reset() {
      transitions.length = 0
      settled = null
      open = null
    },
  }
}
