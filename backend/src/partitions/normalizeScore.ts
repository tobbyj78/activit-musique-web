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
  const lanes = buildChromaticLanes(uniqueMidis);
  const laneByMidi = new Map(lanes.map((lane, index) => [lane.midi, index]));

  const partId = `${scoreId}:${sourceName}`;
  const notes: ScheduledNote[] = rawNotes.map((rawNote, index) => {
    const midi = noteNameToMidi(rawNote.note);

    return {
      id: `${scoreId}:${sourceName}:${index}`,
      partId,
      note: rawNote.note,
      midi,
      timestampMs: Math.max(0, Number(rawNote.timestamp_ms) || 0),
      durationMs: Math.max(0, Number(rawNote.duration_ms) || 0),
      velocity: clampVelocity(rawNote.velocity ?? 0.6),
      laneIndex: laneByMidi.get(midi) ?? 0
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

function buildChromaticLanes(uniqueMidis: number[]): PianoLane[] {
  if (uniqueMidis.length === 0) {
    return [];
  }
  const min = uniqueMidis[0];
  const max = uniqueMidis.at(-1)!;
  const midis = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  return midis.map((midi) => ({
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
