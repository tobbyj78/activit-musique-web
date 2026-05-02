export type ScoreId = "piano_only" | "orchestre";

export type NormalizedScore = {
  id: ScoreId;
  title: string;
  parts: ScorePart[];
  durationMs: number;
};

export type ScorePart = {
  id: string;
  displayName: string;
  sourceName: string;
  soundPresetKey: string;
  difficulty?: string;
  noteCount: number;
  notes: ScheduledNote[];
  range: {
    minMidi: number;
    maxMidi: number;
    uniqueMidis: number[];
  };
  lanes: PianoLane[];
};

export type ScheduledNote = {
  id: string;
  partId: string;
  note: string;
  midi: number;
  timestampMs: number;
  durationMs: number;
  velocity: number;
  laneIndex: number;
};

export type PianoLane = {
  midi: number;
  label: string;
  isBlackKey: boolean;
};
