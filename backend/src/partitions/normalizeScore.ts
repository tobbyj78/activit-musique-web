import {
  isBlackMidi,
  midiToNoteName,
  noteNameToMidi,
  type NormalizedScore,
  type PianoLane,
  type ScheduledNote,
  type ScoreId,
  type ScorePart
} from "@classe-orchestre/shared";

const OPTIMAL_RANGES: Record<string, { minMidi: number; maxMidi: number }> = {
  "piano_only:groupe_1": { minMidi: 64, maxMidi: 75 },
  "piano_only:groupe_2": { minMidi: 63, maxMidi: 74 },
  "piano_only:groupe_3": { minMidi: 63, maxMidi: 74 },
  "piano_only:groupe_4": { minMidi: 50, maxMidi: 61 },
  "orchestre:Flute":       { minMidi: 83, maxMidi: 94 },
  "orchestre:Oboe":        { minMidi: 71, maxMidi: 82 },
  "orchestre:Clarinet":    { minMidi: 59, maxMidi: 70 },
  "orchestre:Bassoon":     { minMidi: 48, maxMidi: 59 },
  "orchestre:Horn":        { minMidi: 57, maxMidi: 68 },
  "orchestre:Trumpet":     { minMidi: 55, maxMidi: 66 },
  "orchestre:Timpani":     { minMidi: 43, maxMidi: 54 },
  "orchestre:Violins_I":   { minMidi: 68, maxMidi: 79 },
  "orchestre:Violins_II":  { minMidi: 61, maxMidi: 72 },
  "orchestre:Violas":      { minMidi: 48, maxMidi: 59 },
  "orchestre:Violoncellos": { minMidi: 38, maxMidi: 49 },
  "orchestre:Contrabasses": { minMidi: 30, maxMidi: 41 }
};

export const SOURCE_NAME_TO_PRESET_KEY: Record<string, string> = {
  Flute: "flute",
  Oboe: "oboe",
  Clarinet: "clarinet",
  Bassoon: "bassoon",
  Horn: "horn",
  "French Horn": "horn",
  Trumpet: "trumpet",
  Trombone: "trombone",
  Timpani: "timpani",
  Violin: "violinI",
  Violin_I: "violinI",
  Violins_I: "violinI",
  "Violin I": "violinI",
  Violin_II: "violinII",
  Violins_II: "violinII",
  "Violin II": "violinII",
  Viola: "viola",
  Violas: "viola",
  Cello: "cello",
  Violoncello: "cello",
  Violoncellos: "cello",
  Contrabass: "contrabass",
  Contrabasses: "contrabass"
};

const SOURCE_NAME_TO_DISPLAY: Record<string, string> = {
  Flute: "Flûte",
  Oboe: "Hautbois",
  Clarinet: "Clarinette",
  Bassoon: "Basson",
  Horn: "Cor",
  Trumpet: "Trompette",
  Trombone: "Trombone",
  Timpani: "Timbales",
  Violins_I: "Violons I",
  Violins_II: "Violons II",
  Violas: "Altos",
  Violoncellos: "Violoncelles",
  Contrabasses: "Contrebasses"
};

type RawNote = {
  note: string;
  timestamp_ms: number;
  duration_ms: number;
  velocity?: number;
};

type RawPart = {
  difficulty?: string;
  note_count?: number;
  notes?: RawNote[];
};

type RawScore = {
  meta?: {
    piece?: string;
    duration_ms?: number;
  };
  instruments?: Record<string, RawPart>;
};

export function normalizeScore(id: ScoreId, raw: RawScore): NormalizedScore {
  const sourceParts = raw.instruments ?? {};
  const parts = Object.entries(sourceParts).map(([sourceName, rawPart]) =>
    normalizePart(id, sourceName, rawPart)
  );

  const computedDuration = Math.max(
    0,
    ...parts.flatMap((part) =>
      part.notes.map((note) => note.timestampMs + Math.max(0, note.durationMs))
    )
  );

  return {
    id,
    title: raw.meta?.piece ?? (id === "piano_only" ? "Piano seul" : "Orchestre"),
    parts,
    durationMs: raw.meta?.duration_ms ?? computedDuration
  };
}

function normalizePart(
  scoreId: ScoreId,
  sourceName: string,
  rawPart: RawPart
): ScorePart {
  const rawNotes = rawPart.notes ?? [];
  const midiValues = rawNotes
    .map((note) => noteNameToMidi(note.note))
    .filter((value): value is number => Number.isFinite(value));
  const uniqueMidis = Array.from(new Set(midiValues)).sort((a, b) => a - b);

  const partId = `${scoreId}:${sourceName}`;
  const optRange = OPTIMAL_RANGES[partId];
  const lanes = optRange
    ? buildChromaticLanes(optRange.minMidi, optRange.maxMidi)
    : buildChromaticLanes(uniqueMidis[0] ?? 60, uniqueMidis.at(-1) ?? 60);
  const laneByMidi = new Map(lanes.map((lane, index) => [lane.midi, index]));

  const notes: ScheduledNote[] = rawNotes.map((rawNote, index) => {
    const midi = noteNameToMidi(rawNote.note);
    const outOfRange = optRange !== undefined && (midi < optRange.minMidi || midi > optRange.maxMidi);

    return {
      id: `${scoreId}:${sourceName}:${index}`,
      partId,
      note: rawNote.note,
      midi,
      timestampMs: Math.max(0, Number(rawNote.timestamp_ms) || 0),
      durationMs: Math.max(0, Number(rawNote.duration_ms) || 0),
      velocity: clampVelocity(rawNote.velocity ?? 0.6),
      laneIndex: outOfRange ? 0 : (laneByMidi.get(midi) ?? 0),
      ...(outOfRange ? { autoPlay: true } : {})
    };
  });

  return {
    id: partId,
    displayName: displayNameFor(scoreId, sourceName),
    sourceName,
    soundPresetKey:
      scoreId === "piano_only"
        ? "piano"
        : SOURCE_NAME_TO_PRESET_KEY[sourceName] ?? "piano",
    difficulty: rawPart.difficulty,
    noteCount: rawPart.note_count ?? notes.length,
    notes,
    range: {
      minMidi: uniqueMidis[0] ?? 60,
      maxMidi: uniqueMidis.at(-1) ?? 60,
      uniqueMidis
    },
    lanes
  };
}

function buildChromaticLanes(minMidi: number, maxMidi: number): PianoLane[] {
  if (maxMidi < minMidi) return [];
  return Array.from({ length: maxMidi - minMidi + 1 }, (_, i) => minMidi + i).map((midi) => ({
    midi,
    label: midiToNoteName(midi),
    isBlackKey: isBlackMidi(midi)
  }));
}

function displayNameFor(scoreId: ScoreId, sourceName: string): string {
  if (scoreId === "piano_only") {
    const groupMatch = sourceName.match(/^groupe_(\d+)$/i);
    if (groupMatch) {
      return `Groupe ${groupMatch[1]}`;
    }
  }
  return SOURCE_NAME_TO_DISPLAY[sourceName] ?? sourceName.replaceAll("_", " ");
}

function clampVelocity(value: number): number {
  return Math.min(1, Math.max(0, Number(value) || 0));
}
