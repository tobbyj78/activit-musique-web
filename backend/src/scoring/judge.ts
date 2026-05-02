import type {
  IndividualNoteScore,
  NoteJudgement,
  ScheduledNote
} from "@classe-orchestre/shared";

export const PERFECT_WINDOW_MS = 60;
export const GOOD_WINDOW_MS = 120;
export const MISS_WINDOW_MS = 220;
export const MIN_HOLD_NOTE_MS = 250;

export function judgeNote(args: {
  studentId: string;
  studentName: string;
  partId: string;
  expected: ScheduledNote;
  expectedAtServerMs: number;
  actualMidi: number;
  downAtServerMs: number;
  upAtServerMs?: number;
  judgedAtMs: number;
}): NoteJudgement {
  const timingErrorMs = args.downAtServerMs - args.expectedAtServerMs;
  const midiMatches = args.actualMidi === args.expected.midi;
  const timingScore = midiMatches ? timingScoreFor(timingErrorMs) : 0;
  const durationErrorMs =
    args.upAtServerMs === undefined
      ? 0
      : args.upAtServerMs - args.downAtServerMs - args.expected.durationMs;
  const holdScore = midiMatches
    ? holdScoreFor(args.expected.durationMs, args.downAtServerMs, args.upAtServerMs)
    : 0;
  const totalScore = midiMatches ? timingScore * 0.75 + holdScore * 0.25 : 0;

  const base: IndividualNoteScore = {
    studentId: args.studentId,
    studentName: args.studentName,
    noteId: args.expected.id,
    timingErrorMs,
    durationErrorMs,
    timingScore,
    holdScore,
    totalScore,
    label: labelFor(timingErrorMs, timingScore)
  };

  return {
    ...base,
    partId: args.partId,
    expectedMidi: args.expected.midi,
    actualMidi: args.actualMidi,
    judgedAtMs: args.judgedAtMs
  };
}

function timingScoreFor(timingErrorMs: number): number {
  const absTiming = Math.abs(timingErrorMs);

  if (absTiming <= PERFECT_WINDOW_MS) {
    return 1;
  }

  if (absTiming <= GOOD_WINDOW_MS) {
    return 0.75;
  }

  if (absTiming <= MISS_WINDOW_MS) {
    return 0.35;
  }

  return 0;
}

function holdScoreFor(
  expectedDurationMs: number,
  downAtServerMs: number,
  upAtServerMs?: number
): number {
  if (upAtServerMs === undefined || expectedDurationMs < MIN_HOLD_NOTE_MS) {
    return 1;
  }

  const actualDuration = Math.max(0, upAtServerMs - downAtServerMs);
  const tolerance = Math.max(120, expectedDurationMs * 0.35);

  return Math.max(0, 1 - Math.abs(actualDuration - expectedDurationMs) / tolerance);
}

function labelFor(
  timingErrorMs: number,
  timingScore: number
): IndividualNoteScore["label"] {
  if (timingScore === 0) {
    return "miss";
  }

  if (timingScore === 1) {
    return "perfect";
  }

  if (timingScore === 0.75) {
    return "good";
  }

  return timingErrorMs < 0 ? "early" : "late";
}
