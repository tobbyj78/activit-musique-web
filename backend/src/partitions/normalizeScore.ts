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

const USE_ONLY_NOTES_PRESENT_IN_PART = true;

export const SOURCE_NAME_TO_PRESET_KEY: Record<string, string> = {
  Piano: "piano",
  "Acoustic Grand Piano": "piano",
  Flute: "flute",
  Violin: "violin",
  Violin_I: "violin",
  Violin_II: "violin",
  Violins_I: "violin",
  Violins_II: "violin",
  Viola: "viola",
  Violas: "viola",
  Cello: "cello",
  Violoncello: "cello",
  Violoncellos: "cello",
  Contrabass: "contrabass",
  Contrabasses: "contrabass",
  Trumpet: "trumpet",
  Trombone: "trombone",
  Horn: "frenchHorn",
  "French Horn": "frenchHorn",
  Oboe: "oboe",
  Clarinet: "clarinet",
  Bassoon: "bassoon",
  Timpani: "timpani"
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
} & Record<string, unknown>;

export function normalizeScore(id: ScoreId, raw: RawScore): NormalizedScore {
  const sourceParts = getSourceParts(id, raw);
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

function getSourceParts(id: ScoreId, raw: RawScore): Record<string, RawPart> {
  if (raw.instruments && typeof raw.instruments === "object") {
    return raw.instruments;
  }

  if (id === "orchestre") {
    return Object.fromEntries(
      Object.entries(raw).filter(
        ([key, value]) => key !== "meta" && isRawPart(value)
      )
    ) as Record<string, RawPart>;
  }

  return {};
}

function normalizePart(
  scoreId: ScoreId,
  sourceName: string,
  rawPart: RawPart
): ScorePart {
  const rawNotes = rawPart.notes ?? [];
  const midiValues = rawNotes.map((note) => noteNameToMidi(note.note));
  const uniqueMidis = Array.from(new Set(midiValues)).sort((a, b) => a - b);
  const lanes = buildLanes(uniqueMidis);
  const laneByMidi = new Map(lanes.map((lane, index) => [lane.midi, index]));

  const partId = sourceName;
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
    displayName: displayNameFor(sourceName),
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

function buildLanes(uniqueMidis: number[]): PianoLane[] {
  const midis = USE_ONLY_NOTES_PRESENT_IN_PART ? uniqueMidis : chromaticRange(uniqueMidis);

  return midis.map((midi) => ({
    midi,
    label: midiToNoteName(midi),
    isBlackKey: isBlackMidi(midi)
  }));
}

function chromaticRange(uniqueMidis: number[]): number[] {
  const min = uniqueMidis[0] ?? 60;
  const max = uniqueMidis.at(-1) ?? 72;
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

function displayNameFor(sourceName: string): string {
  const groupMatch = sourceName.match(/^groupe_(\d+)$/i);
  if (groupMatch) {
    return `Groupe ${groupMatch[1]}`;
  }

  return sourceName
    .replaceAll("_", " ")
    .replace(/\bI\b/g, "I")
    .replace(/\bIi\b/g, "II");
}

function clampVelocity(value: number): number {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function isRawPart(value: unknown): value is RawPart {
  return Boolean(
    value &&
      typeof value === "object" &&
      "notes" in value &&
      Array.isArray((value as RawPart).notes)
  );
}
