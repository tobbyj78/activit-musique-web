import type {
  AppStage,
  AudioMode,
  GroupScore,
  NormalizedScore,
  NoteJudgement,
  PartPublicRoom,
  PerformanceStatus,
  PublicState,
  QAQuestion,
  ScoreId,
  StudentPublicSession
} from "@classe-orchestre/shared";

export type StudentSession = {
  studentId: string;
  connectionId?: string;
  sessionToken: string;
  name: string;
  partId?: string;
  joinedAt: number;
  lastSeenAt: number;
  ready: boolean;
  isSpeaker: boolean;
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
  stage: AppStage;
  performanceStatus: PerformanceStatus;
  currentScoreId?: ScoreId;
  startAtServerMs?: number;
  audioMode: AudioMode;
  allowOverflow: boolean;

  students: Map<string, StudentSession>;
  connections: Map<string, ServerConnection>;
  parts: Map<string, PartRoom>;

  scores: Record<ScoreId, NormalizedScore>;

  inputs: Map<string, InputEventRecord>;
  judgements: Map<string, NoteJudgement>;
  groupScores: Map<string, GroupScore>;
  globalScore: number;
  questions: QAQuestion[];
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
    stage: "lobby",
    performanceStatus: "idle",
    currentScoreId: "piano_only",
    audioMode: "local_immediate",
    allowOverflow: false,
    students: new Map(),
    connections: new Map(),
    parts,
    scores,
    inputs: new Map(),
    judgements: new Map(),
    groupScores: new Map(),
    globalScore: 0,
    questions: [],
    performanceTimers: []
  };
}

export function resolveScoreIdForStage(stage: AppStage): ScoreId | undefined {
  if (stage.startsWith("piano_")) {
    return "piano_only";
  }

  if (stage.startsWith("orchestra_")) {
    return "orchestre";
  }

  return undefined;
}

export function publicState(state: RuntimeState): PublicState {
  return {
    stage: state.stage,
    performanceStatus: state.performanceStatus,
    currentScoreId: state.currentScoreId,
    startAtServerMs: state.startAtServerMs,
    audioMode: state.audioMode,
    groupSize: Math.max(1, firstPartMaxSize(state)),
    allowOverflow: state.allowOverflow,
    scores: state.scores,
    parts: Array.from(state.parts.values()).map(toPublicPartRoom),
    students: Array.from(state.students.values()).map((student) =>
      toPublicStudentSession(state, student)
    ),
    questions: state.questions,
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
  partId: string,
  options: { enforceCapacity: boolean }
): { ok: true } | { ok: false; message: string } {
  const room = state.parts.get(partId);
  if (!room) {
    return { ok: false, message: "Groupe introuvable." };
  }

  if (
    options.enforceCapacity &&
    !state.allowOverflow &&
    room.students.length >= room.maxSize &&
    !room.students.includes(student.studentId)
  ) {
    return { ok: false, message: "Ce groupe est complet." };
  }

  removeStudentFromRooms(state, student.studentId);
  room.students.push(student.studentId);
  student.partId = partId;
  student.ready = false;
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
    student.ready = false;
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
    ready: student.ready,
    isSpeaker: student.isSpeaker,
    online
  };
}

function firstPartMaxSize(state: RuntimeState): number {
  return Array.from(state.parts.values())[0]?.maxSize ?? 4;
}
