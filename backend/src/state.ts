import type {
  AppPhase,
  GroupScore,
  NormalizedScore,
  NoteJudgement,
  PartPublicRoom,
  PerformanceStatus,
  PublicState,
  ScoreId,
  StudentPublicSession,
  SurveyResults
} from "@classe-orchestre/shared";
import { SURVEY_QUESTIONS } from "@classe-orchestre/shared";

export type StudentSession = {
  studentId: string;
  connectionId?: string;
  sessionToken: string;
  name: string;
  partId?: string;
  joinedAt: number;
  lastSeenAt: number;
};

export type PartRoom = {
  partId: string;
  scoreId: ScoreId;
  displayName: string;
  soundPresetKey: string;
  students: string[];
  maxSize: number;
};

export type ServerConnection = {
  connectionId: string;
  ws: {
    send(data: string): void;
    close?(): void;
  };
  role?: "student" | "admin";
  sessionToken?: string;
  connectedAt: number;
};

export type InputEventRecord = {
  eventId: string;
  studentId: string;
  partId: string;
  note: string;
  midi: number;
  clientDownAtMs: number;
  serverDownAtMs: number;
  serverUpAtMs?: number;
  matchedNoteId?: string;
};

export type RuntimeState = {
  phase: AppPhase;
  performanceStatus: PerformanceStatus;
  performanceStartAtServerMs?: number;
  currentScoreId?: ScoreId;

  students: Map<string, StudentSession>;
  connections: Map<string, ServerConnection>;
  parts: Map<string, PartRoom>;

  scores: Record<ScoreId, NormalizedScore>;

  inputs: Map<string, InputEventRecord>;
  judgements: Map<string, NoteJudgement>;
  groupScores: Map<string, GroupScore>;
  globalScore: number;

  mutedGroups: Set<string>;
  activeKeysByStudent: Map<string, Set<number>>;
  surveyAnswers: Map<string, Map<string, string>>;

  performanceTimers: ReturnType<typeof setTimeout>[];
};

export function createRuntimeState(
  scores: Record<ScoreId, NormalizedScore>,
  groupSize: number
): RuntimeState {
  const parts = new Map<string, PartRoom>();

  for (const score of Object.values(scores)) {
    for (const part of score.parts) {
      parts.set(part.id, {
        partId: part.id,
        scoreId: score.id,
        displayName: part.displayName,
        soundPresetKey: part.soundPresetKey,
        students: [],
        maxSize: groupSize
      });
    }
  }

  return {
    phase: "phase1_lobby",
    performanceStatus: "idle",
    students: new Map(),
    connections: new Map(),
    parts,
    scores,
    inputs: new Map(),
    judgements: new Map(),
    groupScores: new Map(),
    globalScore: 0,
    mutedGroups: new Set(),
    activeKeysByStudent: new Map(),
    surveyAnswers: new Map(),
    performanceTimers: []
  };
}

export function resetRuntimeState(state: RuntimeState): void {
  for (const timer of state.performanceTimers) {
    clearTimeout(timer);
  }
  state.performanceTimers = [];

  state.phase = "phase1_lobby";
  state.performanceStatus = "idle";
  state.performanceStartAtServerMs = undefined;
  state.currentScoreId = undefined;
  state.students.clear();
  for (const room of state.parts.values()) {
    room.students = [];
  }
  state.inputs.clear();
  state.judgements.clear();
  state.groupScores.clear();
  state.globalScore = 0;
  state.mutedGroups.clear();
  state.activeKeysByStudent.clear();
  state.surveyAnswers.clear();
}

export function publicState(state: RuntimeState): PublicState {
  return {
    phase: state.phase,
    performanceStatus: state.performanceStatus,
    performanceStartAtServerMs: state.performanceStartAtServerMs,
    currentScoreId: state.currentScoreId,
    scores: state.scores,
    parts: Array.from(state.parts.values()).map(toPublicPartRoom),
    students: Array.from(state.students.values()).map((student) =>
      toPublicStudentSession(state, student)
    ),
    mutedGroups: Array.from(state.mutedGroups),
    activeKeysByStudent: Object.fromEntries(
      Array.from(state.activeKeysByStudent.entries()).map(([studentId, midis]) => [
        studentId,
        Array.from(midis)
      ])
    ),
    surveyResults: computeSurveyResults(state),
    groupScores: Array.from(state.groupScores.values()),
    globalScore: state.globalScore
  };
}

export function getStudentByConnectionId(
  state: RuntimeState,
  connectionId: string
): StudentSession | undefined {
  return Array.from(state.students.values()).find(
    (student) => student.connectionId === connectionId
  );
}

export function getStudentById(
  state: RuntimeState,
  studentId: string
): StudentSession | undefined {
  return Array.from(state.students.values()).find(
    (student) => student.studentId === studentId
  );
}

export function getPartForStudent(
  state: RuntimeState,
  student: StudentSession
): PartRoom | undefined {
  if (!student.partId) {
    return undefined;
  }

  return state.parts.get(student.partId);
}

export function assignStudentToPart(
  state: RuntimeState,
  student: StudentSession,
  partId: string
): { ok: true } | { ok: false; message: string } {
  const room = state.parts.get(partId);
  if (!room) {
    return { ok: false, message: "Groupe introuvable." };
  }

  if (
    room.students.length >= room.maxSize &&
    !room.students.includes(student.studentId)
  ) {
    return { ok: false, message: "Ce groupe est complet." };
  }

  removeStudentFromRooms(state, student.studentId);
  room.students.push(student.studentId);
  student.partId = partId;
  student.lastSeenAt = Date.now();

  return { ok: true };
}

export function removeStudentFromRooms(state: RuntimeState, studentId: string): void {
  for (const room of state.parts.values()) {
    room.students = room.students.filter((id) => id !== studentId);
  }

  const student = getStudentById(state, studentId);
  if (student) {
    student.partId = undefined;
  }
}

export function activeStudentsForPart(
  state: RuntimeState,
  partId: string
): StudentSession[] {
  const room = state.parts.get(partId);
  if (!room) {
    return [];
  }

  return room.students
    .map((studentId) => getStudentById(state, studentId))
    .filter((student): student is StudentSession => Boolean(student));
}

export function clearPerformanceTimers(state: RuntimeState): void {
  for (const timer of state.performanceTimers) {
    clearTimeout(timer);
  }
  state.performanceTimers = [];
}

function toPublicPartRoom(room: PartRoom): PartPublicRoom {
  return {
    partId: room.partId,
    scoreId: room.scoreId,
    displayName: room.displayName,
    soundPresetKey: room.soundPresetKey,
    students: room.students,
    maxSize: room.maxSize
  };
}

function toPublicStudentSession(
  state: RuntimeState,
  student: StudentSession
): StudentPublicSession {
  const online = Boolean(
    student.connectionId && state.connections.has(student.connectionId)
  );

  return {
    id: student.studentId,
    connectionId: student.connectionId,
    name: student.name,
    partId: student.partId,
    joinedAt: student.joinedAt,
    lastSeenAt: student.lastSeenAt,
    online
  };
}

function computeSurveyResults(state: RuntimeState): SurveyResults {
  const results: SurveyResults = {};
  for (const question of SURVEY_QUESTIONS) {
    const counts: Record<string, number> = {};
    for (const answer of question.answers) {
      counts[answer.id] = 0;
    }
    results[question.id] = counts;
  }

  for (const studentAnswers of state.surveyAnswers.values()) {
    for (const [questionId, answerId] of studentAnswers.entries()) {
      const counts = results[questionId];
      if (counts && answerId in counts) {
        counts[answerId] += 1;
      }
    }
  }

  return results;
}
