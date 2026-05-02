import type { GroupScore, ScoreId, ScheduledNote } from "@classe-orchestre/shared";
import type { RuntimeState, StudentSession } from "../state";
import { activeStudentsForPart } from "../state";
import { MISS_WINDOW_MS } from "./judge";

export function recomputeScores(
  state: RuntimeState,
  scoreId: ScoreId,
  nowMs: number
): { groupScores: GroupScore[]; globalScore: number } {
  const score = state.scores[scoreId];
  const groupScores = score.parts.map((part) => {
    const students = activeStudentsForPart(state, part.id);
    const expectedNotes = expectedNotesForState(state, part.notes, nowMs);
    const denominator = Math.max(1, expectedNotes.length * Math.max(1, students.length));
    let total = 0;

    for (const note of expectedNotes) {
      for (const student of students) {
        total +=
          state.judgements.get(judgementKey(student.studentId, note.id))?.totalScore ??
          0;
      }
    }

    const studentScores = students.map((student) =>
      scoreForStudent(state, student, expectedNotes)
    );

    return {
      partId: part.id,
      displayName: part.displayName,
      score: total / denominator,
      judgedNotes: countJudgements(state, students, expectedNotes),
      expectedNotes: expectedNotes.length,
      activeStudents: students.length,
      incomplete: students.length > 0 && students.length < firstRoomMaxSize(state),
      studentScores
    };
  });

  const scoredGroups = groupScores.filter(
    (groupScore) => groupScore.activeStudents > 0 && groupScore.expectedNotes > 0
  );
  const globalScore =
    scoredGroups.length === 0
      ? 0
      : scoredGroups.reduce((sum, groupScore) => sum + groupScore.score, 0) /
        scoredGroups.length;

  state.groupScores = new Map(groupScores.map((groupScore) => [groupScore.partId, groupScore]));
  state.globalScore = globalScore;

  return { groupScores, globalScore };
}

export function aggregateGroupNoteScore(
  state: RuntimeState,
  partId: string,
  noteId: string
): { score: number; activeStudents: number } {
  const students = activeStudentsForPart(state, partId);
  if (students.length === 0) {
    return { score: 0, activeStudents: 0 };
  }

  const total = students.reduce(
    (sum, student) =>
      sum + (state.judgements.get(judgementKey(student.studentId, noteId))?.totalScore ?? 0),
    0
  );

  return {
    score: total / students.length,
    activeStudents: students.length
  };
}

export function judgementKey(studentId: string, noteId: string): string {
  return `${studentId}:${noteId}`;
}

function expectedNotesForState(
  state: RuntimeState,
  notes: ScheduledNote[],
  nowMs: number
): ScheduledNote[] {
  if (!state.startAtServerMs) {
    return notes.filter((note) =>
      Array.from(state.judgements.values()).some((judgement) => judgement.noteId === note.id)
    );
  }

  const elapsedMs = Math.max(0, nowMs - state.startAtServerMs);
  const cutoffMs =
    state.performanceStatus === "finished" || state.performanceStatus === "stopped"
      ? elapsedMs
      : Math.max(0, elapsedMs - MISS_WINDOW_MS);

  return notes.filter((note) => note.timestampMs <= cutoffMs);
}

function scoreForStudent(
  state: RuntimeState,
  student: StudentSession,
  expectedNotes: ScheduledNote[]
) {
  if (expectedNotes.length === 0) {
    return {
      studentId: student.studentId,
      studentName: student.name,
      score: 0,
      judgedNotes: 0
    };
  }

  const judged = expectedNotes
    .map((note) => state.judgements.get(judgementKey(student.studentId, note.id)))
    .filter(Boolean);
  const score =
    expectedNotes.reduce(
      (sum, note) =>
        sum + (state.judgements.get(judgementKey(student.studentId, note.id))?.totalScore ?? 0),
      0
    ) / expectedNotes.length;

  return {
    studentId: student.studentId,
    studentName: student.name,
    score,
    judgedNotes: judged.length
  };
}

function countJudgements(
  state: RuntimeState,
  students: StudentSession[],
  expectedNotes: ScheduledNote[]
): number {
  let count = 0;
  for (const student of students) {
    for (const note of expectedNotes) {
      if (state.judgements.has(judgementKey(student.studentId, note.id))) {
        count += 1;
      }
    }
  }
  return count;
}

function firstRoomMaxSize(state: RuntimeState): number {
  return Array.from(state.parts.values())[0]?.maxSize ?? 4;
}
