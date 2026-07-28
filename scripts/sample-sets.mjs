// Which recorded instruments exist and which notes of each are downloaded.
//
// Shared between the download script and the audio engine so the two cannot drift apart.
// src/audio/sampleSets.ts re-states the note lists in TypeScript and a test compares them —
// drift does not fail loudly, it fails as a note missing from the middle of a chord.
//
// Samples come from nbrosowsky/tonejs-instruments (CC-BY 3.0), which is the sample set
// Tone.js's own instrument demos use. Like the hand landmarker model, the files are
// committed to this repo: the deployed site has no runtime dependency on anyone else's
// hosting, and the exact bytes we listened to are the bytes that ship.
//
// `s` stands for sharp in the filenames, the convention the source uses; the engine turns
// each back into a real note name for the Sampler's map.
//
// **Why these notes and no more.** The instrument's chords live between MIDI 36 and 67 —
// see registerFor in audio/voicing.ts — so these cover that and nothing else. A sample per
// semitone would be several times the download for a difference nobody would name. The
// Sampler fills the gaps by pitching the nearest recording, and the spacing is chosen so
// that never exceeds three semitones, which is where a stretched instrument starts to sound
// like a stretched recording rather than like itself.
//
// The bottom of that range is the bass voice, which sits a full octave under the chord —
// see chordIntervals. Before it existed these sets stopped at F#2, and adding it is what
// the low notes here are for.
//
// **Why some presets have no entry here.** Clean synth and Glass stay oscillators. They are
// synthetic sounds by name and by intent, and a recording of one is a contradiction; Clean
// synth also has to make sound before anything has downloaded.

/** @type {{ folder: string, sources: { instrument: string, notes: string[] }[] }[]} */
export const SAMPLE_SETS = [
  {
    // A pipe organ holds a note dead flat for as long as the key is down, which is exactly
    // what the sustained presets want and exactly what a sine oscillator fails to imitate.
    folder: 'organ',
    sources: [{ instrument: 'organ', notes: ['C2', 'Fs2', 'C3', 'Fs3', 'C4', 'Fs4', 'C5'] }],
  },
  {
    // Reed organ: warm, slightly reedy, and the one recording here that truly sustains
    // rather than decaying. See SUSTAIN_SECONDS — it is also the one that stops abruptly.
    folder: 'pad',
    sources: [{ instrument: 'harmonium', notes: ['C2', 'Fs2', 'C3', 'Fs3', 'C4', 'Ds4', 'G4'] }],
  },
  {
    // Two instruments, split by register, because that is what a string section is: a double
    // bass under the bottom voice and violins over the top. One instrument stretched across
    // the whole range would have to be pitched two octaves in one direction or the other,
    // and a violin dropped that far stops sounding like a violin.
    //
    // **The changeover sits at C4, not lower.** It was at F#3, which put the fifth of a
    // plain C major triad on a violin while its root and third were still on a double bass —
    // so the top note of the commonest chord in the instrument stuck out of its own chord.
    // Up here the whole triad is one instrument and the violins only enter on the upper
    // voices, which is where a section actually splits.
    folder: 'strings',
    sources: [
      { instrument: 'contrabass', notes: ['C2', 'E2', 'Gs2', 'Cs3', 'E3', 'Gs3', 'B3'] },
      { instrument: 'violin', notes: ['C4', 'E4', 'G4'] },
    ],
  },
]
