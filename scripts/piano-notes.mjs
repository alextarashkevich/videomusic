// Which piano samples exist, shared between the download script and the audio engine so
// the two cannot drift apart. src/audio/pianoSampler.ts re-states this list in TypeScript
// and a test compares them.
//
// One every minor third. The Sampler pitches each one up to fill the gaps, and a third is
// close enough that the stretching is inaudible — a sample per semitone would be six times
// the download for a difference nobody would name.
//
// `s` stands for sharp in the filenames because Salamander names them that way; the engine
// turns each back into a real note name for the Sampler's map.
export const PIANO_NOTES = [
  'C1', 'Ds1', 'Fs1', 'A1',
  'C2', 'Ds2', 'Fs2', 'A2',
  'C3', 'Ds3', 'Fs3', 'A3',
  'C4', 'Ds4', 'Fs4', 'A4',
  'C5', 'Ds5', 'Fs5', 'A5',
  'C6', 'Ds6', 'Fs6', 'A6',
  'C7',
]
