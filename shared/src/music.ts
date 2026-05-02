const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11
};

const SEMITONE_TO_NOTE = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B"
] as const;

const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

export function noteNameToMidi(note: string): number {
  const match = note.trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!match) {
    throw new Error(`Invalid note name: ${note}`);
  }

  const [, letter, accidental, octaveText] = match;
  const normalizedNote = `${letter.toUpperCase()}${accidental}`;
  const semitone = NOTE_TO_SEMITONE[normalizedNote];
  if (semitone === undefined) {
    throw new Error(`Invalid note name: ${note}`);
  }

  const octave = Number(octaveText);
  return (octave + 1) * 12 + semitone;
}

export function midiToNoteName(midi: number): string {
  if (!Number.isFinite(midi)) {
    throw new Error(`Invalid midi value: ${midi}`);
  }

  const rounded = Math.round(midi);
  const semitone = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return `${SEMITONE_TO_NOTE[semitone]}${octave}`;
}

export function isBlackMidi(midi: number): boolean {
  const semitone = ((Math.round(midi) % 12) + 12) % 12;
  return BLACK_SEMITONES.has(semitone);
}
