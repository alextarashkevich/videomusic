// The build scripts are plain Node ESM so they can run before anything is compiled. This is
// here purely so the test comparing those lists against the engine's typechecks.
export const SAMPLE_SETS: { folder: string; sources: { instrument: string; notes: string[] }[] }[]
