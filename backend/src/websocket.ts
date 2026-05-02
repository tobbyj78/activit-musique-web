import {
  parseClientMessage,
  type ClientMessage,
  type NoteJudgement,
  type ScheduledNote,
  type ScoreId,
  type ServerMessage
} from "@classe-orchestre/shared";
import { upgradeWebSocket } from "hono/bun";
import { ZodError } from "zod";
import { env } from "./env";
import {
  activeStudentsForPart,
  assignStudentToPart,
  clearPerformanceTimers,
  getPartForStudent,
  getStudentByConnectionId,
  getStudentById,
  publicState,
  removeStudentFromRooms,
  resolveScoreIdForStage,
  type RuntimeState,
  type InputEventRecord,
  type StudentSession
} from "./state";
import {
  aggregateGroupNoteScore,
  judgementKey,
  recomputeScores
} from "./scoring/aggregate";
import { judgeNote, MISS_WINDOW_MS } from "./scoring/judge";
import { createId } from "./utils/ids";
import { safeJsonParse } from "./utils/safeJson";

const DISCONNECT_GRACE_MS = 30_000;
const JUDGE_DELAY_MS = 140;
const OUTPUT_DELAY_MS = 220;

type HonoLike = {
  get(path: string, ...handlers: any[]): unknown;
};

export function registerWebSocket(app: HonoLike, state: RuntimeState): void {
  app.get(
    "/ws",
    upgradeWebSocket(() => {
      const connectionId = createId("conn");

      return {
        onOpen: (_event: Event, ws: { send(data: string): void }) => {
          state.connections.set(connectionId, {
            connectionId,
            ws,
            connectedAt: Date.now()
          });
        },
        onMessage: (event: { data: unknown }, ws: { send(data: string): void }) => {
          handleRawMessage(state, connectionId, event.data, ws);
        },
        onClose: () => {
          handleClose(state, connectionId);
        },
        onError: () => {
          handleClose(state, connectionId);
        }
      };
    })
  );
}

function handleRawMessage(
  state: RuntimeState,
  connectionId: string,
  payload: unknown,
  ws: { send(data: string): void }
): void {
  try {
    const message = parseClientMessage(safeJsonParse(payload));
    handleMessage(state, connectionId, message, ws);
  } catch (error) {
    if (error instanceof ZodError) {
      sendRaw(ws, {
        type: "error",
        message: error.issues[0]?.message ?? "Message invalide."
      });
      return;
    }

    sendRaw(ws, {
      type: "error",
      message: error instanceof Error ? error.message : "Message invalide."
    });
  }
}

function handleMessage(
  state: RuntimeState,
  connectionId: string,
  message: ClientMessage,
  ws: { send(data: string): void }
): void {
  if (message.type === "hello") {
    handleHello(state, connectionId, message, ws);
    return;
  }

  const connection = state.connections.get(connectionId);
  if (!connection?.role) {
    sendToConnection(state, connectionId, {
      type: "error",
      message: "Connexion non initialisee."
    });
    return;
  }

  switch (message.type) {
    case "clock_ping":
      sendToConnection(state, connectionId, {
        type: "clock_pong",
        clientSentAtMs: message.clientSentAtMs,
        serverReceivedAtMs: Date.now(),
        serverSentAtMs: Date.now()
      });
      break;
    case "join_part":
      withStudent(state, connectionId, (student) => {
        const result = assignStudentToPart(state, student, message.partId, {
          enforceCapacity: true
        });
        if (!result.ok) {
          sendToConnection(state, connectionId, {
            type: "error",
            message: result.message
          });
          return;
        }
        broadcastState(state);
      });
      break;
    case "leave_part":
      withStudent(state, connectionId, (student) => {
        removeStudentFromRooms(state, student.studentId);
        broadcastState(state);
      });
      break;
    case "ready":
      withStudent(state, connectionId, (student) => {
        student.ready = message.ready;
        student.lastSeenAt = Date.now();
        broadcastState(state);
      });
      break;
    case "input_down":
      withStudent(state, connectionId, (student) => {
        handleInputDown(state, student, message);
      });
      break;
    case "input_up":
      withStudent(state, connectionId, (student) => {
        handleInputUp(state, student, message);
      });
      break;
    case "qa_submit_question":
      withStudent(state, connectionId, (student) => {
        state.questions.unshift({
          id: createId("q"),
          studentName: student.name,
          text: message.text.trim(),
          createdAt: Date.now(),
          answered: false
        });
        broadcastState(state);
      });
      break;
    case "admin_set_stage":
      withAdmin(state, connectionId, () => {
        state.stage = message.stage;
        state.currentScoreId = resolveScoreIdForStage(message.stage) ?? state.currentScoreId;
        state.performanceStatus = "idle";
        state.startAtServerMs = undefined;
        clearPerformanceTimers(state);
        broadcastState(state);
      });
      break;
    case "admin_start_performance":
      withAdmin(state, connectionId, () => {
        startPerformance(state, message.scoreId, message.startDelayMs, message.audioMode);
      });
      break;
    case "admin_stop":
      withAdmin(state, connectionId, () => {
        clearPerformanceTimers(state);
        state.performanceStatus = "stopped";
        state.startAtServerMs = undefined;
        broadcastState(state);
      });
      break;
    case "admin_set_overflow":
      withAdmin(state, connectionId, () => {
        state.allowOverflow = message.allowOverflow;
        broadcastState(state);
      });
      break;
    case "admin_assign_student":
      withAdmin(state, connectionId, () => {
        const student = getStudentById(state, message.studentId);
        if (!student) {
          sendToConnection(state, connectionId, {
            type: "error",
            message: "Eleve introuvable."
          });
          return;
        }
        const result = assignStudentToPart(state, student, message.partId, {
          enforceCapacity: false
        });
        if (!result.ok) {
          sendToConnection(state, connectionId, {
            type: "error",
            message: result.message
          });
          return;
        }
        broadcastState(state);
      });
      break;
    case "admin_mark_question_answered":
      withAdmin(state, connectionId, () => {
        state.questions = state.questions.map((question) =>
          question.id === message.questionId
            ? { ...question, answered: true }
            : question
        );
        broadcastState(state);
      });
      break;
    case "admin_clear_questions":
      withAdmin(state, connectionId, () => {
        state.questions = [];
        broadcastState(state);
      });
      break;
  }
}

function handleHello(
  state: RuntimeState,
  connectionId: string,
  message: Extract<ClientMessage, { type: "hello" }>,
  ws: { send(data: string): void }
): void {
  const connection = state.connections.get(connectionId);
  if (!connection) {
    state.connections.set(connectionId, {
      connectionId,
      ws,
      connectedAt: Date.now()
    });
  }

  if (
    (message.role === "admin" && message.password === env.adminPassword) ||
    (message.role === "student" && message.name === env.adminPassword)
  ) {
    const existing = state.connections.get(connectionId);
    if (existing) {
      existing.role = "admin";
    }

    sendToConnection(state, connectionId, {
      type: "welcome",
      connectionId,
      role: "admin",
      state: publicState(state),
      serverNowMs: Date.now()
    });
    broadcastState(state);
    return;
  }

  if (message.role === "admin") {
    sendToConnection(state, connectionId, {
      type: "error",
      message: "Mot de passe admin invalide."
    });
    return;
  }

  const now = Date.now();
  const restoredSession = message.sessionToken
    ? state.students.get(message.sessionToken)
    : undefined;
  const sessionToken = restoredSession?.sessionToken ?? createId("session");
  const student: StudentSession =
    restoredSession ??
    {
      studentId: createId("student"),
      connectionId,
      sessionToken,
      name: message.name.trim(),
      joinedAt: now,
      lastSeenAt: now,
      ready: false,
      isSpeaker: true
    };

  student.connectionId = connectionId;
  student.name = message.name.trim();
  student.lastSeenAt = now;
  state.students.set(sessionToken, student);

  const existing = state.connections.get(connectionId);
  if (existing) {
    existing.role = "student";
    existing.sessionToken = sessionToken;
  }

  sendToConnection(state, connectionId, {
    type: "welcome",
    connectionId,
    role: "student",
    sessionToken,
    state: publicState(state),
    serverNowMs: Date.now()
  });
  broadcastState(state);
}

function handleClose(state: RuntimeState, connectionId: string): void {
  const connection = state.connections.get(connectionId);
  const student = getStudentByConnectionId(state, connectionId);
  if (student) {
    student.connectionId = undefined;
    student.lastSeenAt = Date.now();
  }

  if (connection) {
    state.connections.delete(connectionId);
  }

  broadcastState(state);
  setTimeout(() => {
    cleanupDisconnectedStudents(state);
  }, DISCONNECT_GRACE_MS);
}

function cleanupDisconnectedStudents(state: RuntimeState): void {
  const now = Date.now();
  let changed = false;

  for (const [sessionToken, student] of state.students.entries()) {
    const online = Boolean(
      student.connectionId && state.connections.has(student.connectionId)
    );
    if (!online && now - student.lastSeenAt > DISCONNECT_GRACE_MS) {
      removeStudentFromRooms(state, student.studentId);
      state.students.delete(sessionToken);
      changed = true;
    }
  }

  if (changed) {
    broadcastState(state);
  }
}

function startPerformance(
  state: RuntimeState,
  scoreId: ScoreId,
  startDelayMs: number,
  audioMode: "local_immediate" | "server_aggregated"
): void {
  clearPerformanceTimers(state);
  state.stage =
    scoreId === "piano_only" ? "piano_performance" : "orchestra_performance";
  state.currentScoreId = scoreId;
  state.performanceStatus = "countdown";
  state.audioMode = audioMode;
  state.startAtServerMs = Date.now() + startDelayMs;
  state.inputs.clear();
  state.judgements.clear();
  state.groupScores.clear();
  state.globalScore = 0;

  broadcastToAll(state, {
    type: "performance_start",
    scoreId,
    startAtServerMs: state.startAtServerMs,
    audioMode
  });
  broadcastState(state);

  state.performanceTimers.push(
    setTimeout(() => {
      state.performanceStatus = "running";
      broadcastState(state);
    }, startDelayMs)
  );

  if (audioMode === "server_aggregated") {
    scheduleAggregatedPlayback(state, scoreId, state.startAtServerMs);
  }

  const score = state.scores[scoreId];
  state.performanceTimers.push(
    setTimeout(() => {
      state.performanceStatus = "finished";
      emitScoreUpdate(state, scoreId);
      broadcastState(state);
    }, Math.max(0, startDelayMs + score.durationMs + 1000))
  );
}

function scheduleAggregatedPlayback(
  state: RuntimeState,
  scoreId: ScoreId,
  startAtServerMs: number
): void {
  const score = state.scores[scoreId];
  for (const part of score.parts) {
    for (const note of part.notes) {
      const judgeAtMs = startAtServerMs + note.timestampMs + JUDGE_DELAY_MS;
      const delay = Math.max(0, judgeAtMs - Date.now());

      state.performanceTimers.push(
        setTimeout(() => {
          if (
            state.performanceStatus !== "running" &&
            state.performanceStatus !== "countdown"
          ) {
            return;
          }

          const aggregate = aggregateGroupNoteScore(state, part.id, note.id);
          const activeStudents = Math.max(1, aggregate.activeStudents);
          const velocity = Math.min(
            0.7,
            Math.max(0, (note.velocity * aggregate.score) / activeStudents)
          );

          broadcastToPart(state, part.id, {
            type: "group_play_note",
            partId: part.id,
            noteId: note.id,
            midi: note.midi,
            presetKey: part.soundPresetKey,
            durationMs: Math.max(120, note.durationMs),
            velocity,
            playAtServerMs: startAtServerMs + note.timestampMs + OUTPUT_DELAY_MS
          });
        }, delay)
      );
    }
  }
}

function handleInputDown(
  state: RuntimeState,
  student: StudentSession,
  message: Extract<ClientMessage, { type: "input_down" }>
): void {
  const room = getPartForStudent(state, student);
  const scoreId = state.currentScoreId;
  if (!room || !scoreId || !state.startAtServerMs) {
    return;
  }

  const part = state.scores[scoreId].parts.find((candidate) => candidate.id === room.partId);
  if (!part) {
    return;
  }

  const event: InputEventRecord = {
    eventId: message.eventId,
    studentId: student.studentId,
    partId: part.id,
    note: message.note,
    midi: message.midi,
    clientDownAtMs: message.clientEventAtMs,
    serverDownAtMs: message.estimatedServerEventAtMs
  };
  state.inputs.set(message.eventId, event);

  const expected = findExpectedNote(
    state,
    student.studentId,
    part.notes,
    message.midi,
    message.estimatedServerEventAtMs,
    state.startAtServerMs
  );
  if (!expected) {
    return;
  }

  event.matchedNoteId = expected.id;
  const judgement = judgeNote({
    studentId: student.studentId,
    studentName: student.name,
    partId: part.id,
    expected,
    expectedAtServerMs: state.startAtServerMs + expected.timestampMs,
    actualMidi: message.midi,
    downAtServerMs: message.estimatedServerEventAtMs,
    judgedAtMs: Date.now()
  });
  emitJudgement(state, student, judgement);
}

function handleInputUp(
  state: RuntimeState,
  student: StudentSession,
  message: Extract<ClientMessage, { type: "input_up" }>
): void {
  const scoreId = state.currentScoreId;
  if (!scoreId || !state.startAtServerMs) {
    return;
  }

  const event = state.inputs.get(message.eventId);
  if (!event || event.studentId !== student.studentId) {
    return;
  }

  event.serverUpAtMs = message.estimatedServerEventAtMs;
  const part = state.scores[scoreId].parts.find(
    (candidate) => candidate.id === event.partId
  );
  const expected = part?.notes.find((note) => note.id === event.matchedNoteId);
  if (!part || !expected) {
    return;
  }

  const judgement = judgeNote({
    studentId: student.studentId,
    studentName: student.name,
    partId: part.id,
    expected,
    expectedAtServerMs: state.startAtServerMs + expected.timestampMs,
    actualMidi: event.midi,
    downAtServerMs: event.serverDownAtMs,
    upAtServerMs: message.estimatedServerEventAtMs,
    judgedAtMs: Date.now()
  });
  emitJudgement(state, student, judgement);
}

function findExpectedNote(
  state: RuntimeState,
  studentId: string,
  notes: ScheduledNote[],
  midi: number,
  eventAtServerMs: number,
  startAtServerMs: number
): ScheduledNote | undefined {
  const unusedNotes = notes.filter(
    (note) => !state.judgements.has(judgementKey(studentId, note.id))
  );
  const nearestCorrect = nearestNote(unusedNotes, midi, eventAtServerMs, startAtServerMs);
  if (nearestCorrect) {
    return nearestCorrect;
  }

  return nearestNote(unusedNotes, undefined, eventAtServerMs, startAtServerMs);
}

function nearestNote(
  notes: ScheduledNote[],
  midi: number | undefined,
  eventAtServerMs: number,
  startAtServerMs: number
): ScheduledNote | undefined {
  let best: { note: ScheduledNote; distance: number } | undefined;

  for (const note of notes) {
    if (midi !== undefined && note.midi !== midi) {
      continue;
    }

    const expectedAt = startAtServerMs + note.timestampMs;
    const distance = Math.abs(eventAtServerMs - expectedAt);
    if (distance > MISS_WINDOW_MS) {
      continue;
    }

    if (!best || distance < best.distance) {
      best = { note, distance };
    }
  }

  return best?.note;
}

function emitJudgement(
  state: RuntimeState,
  student: StudentSession,
  judgement: NoteJudgement
): void {
  state.judgements.set(judgementKey(student.studentId, judgement.noteId), judgement);
  if (student.connectionId) {
    sendToConnection(state, student.connectionId, {
      type: "note_judgement",
      judgement
    });
  }

  if (state.currentScoreId) {
    emitScoreUpdate(state, state.currentScoreId);
  }
}

function emitScoreUpdate(state: RuntimeState, scoreId: ScoreId): void {
  const { groupScores, globalScore } = recomputeScores(state, scoreId, Date.now());
  broadcastToAdmins(state, {
    type: "score_update",
    groupScores,
    globalScore
  });
}

function withStudent(
  state: RuntimeState,
  connectionId: string,
  fn: (student: StudentSession) => void
): void {
  const student = getStudentByConnectionId(state, connectionId);
  if (!student) {
    sendToConnection(state, connectionId, {
      type: "error",
      message: "Session eleve introuvable."
    });
    return;
  }

  student.lastSeenAt = Date.now();
  fn(student);
}

function withAdmin(
  state: RuntimeState,
  connectionId: string,
  fn: () => void
): void {
  const connection = state.connections.get(connectionId);
  if (connection?.role !== "admin") {
    sendToConnection(state, connectionId, {
      type: "error",
      message: "Acces admin requis."
    });
    return;
  }

  fn();
}

function broadcastState(state: RuntimeState): void {
  broadcastToAll(state, {
    type: "state",
    state: publicState(state),
    serverNowMs: Date.now()
  });
}

function broadcastToPart(
  state: RuntimeState,
  partId: string,
  message: ServerMessage
): void {
  const students = activeStudentsForPart(state, partId);
  for (const student of students) {
    if (student.connectionId) {
      sendToConnection(state, student.connectionId, message);
    }
  }
}

function broadcastToAdmins(state: RuntimeState, message: ServerMessage): void {
  for (const connection of state.connections.values()) {
    if (connection.role === "admin") {
      sendToConnection(state, connection.connectionId, message);
    }
  }
}

function broadcastToAll(state: RuntimeState, message: ServerMessage): void {
  for (const connection of state.connections.values()) {
    if (connection.role) {
      sendToConnection(state, connection.connectionId, message);
    }
  }
}

function sendToConnection(
  state: RuntimeState,
  connectionId: string,
  message: ServerMessage
): void {
  const connection = state.connections.get(connectionId);
  if (!connection) {
    return;
  }

  sendRaw(connection.ws, message);
}

function sendRaw(ws: { send(data: string): void }, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // The close handler will clean up dead connections.
  }
}
