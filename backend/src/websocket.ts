import {
  parseClientMessage,
  type AppPhase,
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
  publicRuntimeState,
  publicState,
  resetRuntimeState,
  type RuntimeState,
  type InputEventRecord,
  type StudentSession
} from "./state";
import {
  countCorrectPressers,
  judgementKey,
  recomputeScores
} from "./scoring/aggregate";
import { judgeNote, MISS_WINDOW_MS } from "./scoring/judge";
import { createId } from "./utils/ids";
import { safeJsonParse } from "./utils/safeJson";

const DISCONNECT_GRACE_MS = 30_000;
const JUDGE_DELAY_MS = 140;
const OUTPUT_DELAY_MS = 220;
const LIVE_PLAY_DELAY_MS = 30;
const LIVE_PLAY_DURATION_MS = 15000;
const LIVE_PLAY_VELOCITY = 0.7;
const DIRECT_PLAY_DURATION_MS = 700;
const DIRECT_PLAY_VELOCITY = 1.0;
const COUNTDOWN_MS = 3000;
const STATE_COALESCE_MS = 30;

type PerformanceMode = "voted" | "always";

type HonoLike = {
  get(path: string, ...handlers: any[]): unknown;
};

let stateBroadcastTimer: ReturnType<typeof setTimeout> | undefined;

function isPracticePhase(phase: AppPhase): boolean {
  return phase === "phase3_practice" || phase === "phase7_orchestra_practice";
}

function isPerformancePhase(phase: AppPhase): boolean {
  return phase === "phase4_performance" || phase === "phase8_orchestra_performance";
}

function isGroupPickPhase(phase: AppPhase): boolean {
  return phase === "phase2_groups" || phase === "phase6_orchestra_groups";
}

function isSurveyPhase(phase: AppPhase): boolean {
  return phase === "phase5_survey" || phase === "phase9_orchestra_survey";
}

function scoreIdForPhase(phase: AppPhase): ScoreId | undefined {
  if (
    phase === "phase2_groups" ||
    phase === "phase3_practice" ||
    phase === "phase4_performance" ||
    phase === "phase5_survey"
  ) {
    return "piano_only";
  }
  if (
    phase === "phase6_orchestra_groups" ||
    phase === "phase7_orchestra_practice" ||
    phase === "phase8_orchestra_performance" ||
    phase === "phase9_orchestra_survey"
  ) {
    return "orchestre";
  }
  return undefined;
}

export function registerWebSocket(app: HonoLike, state: RuntimeState): void {
  app.get(
    "/ws",
    upgradeWebSocket(() => {
      const connectionId = createId("conn");

      return {
        onOpen: (_event: Event, ws: { send(data: string): void; close?(): void }) => {
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
      message: "Connexion non initialisée."
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
        if (!isGroupPickPhase(state.phase)) {
          sendToConnection(state, connectionId, {
            type: "error",
            message: "Choix de groupe indisponible."
          });
          return;
        }
        const expectedScoreId = scoreIdForPhase(state.phase);
        const room = state.parts.get(message.partId);
        if (!room || room.scoreId !== expectedScoreId) {
          sendToConnection(state, connectionId, {
            type: "error",
            message: "Groupe invalide pour cette phase."
          });
          return;
        }
        const result = assignStudentToPart(state, student, message.partId);
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
        if (!isGroupPickPhase(state.phase)) {
          return;
        }
        student.partId = undefined;
        for (const room of state.parts.values()) {
          room.students = room.students.filter((id) => id !== student.studentId);
        }
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
    case "student_submit_answer":
      withStudent(state, connectionId, (student) => {
        if (!isSurveyPhase(state.phase)) {
          return;
        }
        let answers = state.surveyAnswers.get(student.studentId);
        if (!answers) {
          answers = new Map();
          state.surveyAnswers.set(student.studentId, answers);
        }
        if (!answers.has(message.questionId)) {
          answers.set(message.questionId, message.answerId);
          broadcastState(state);
        }
      });
      break;
    case "admin_advance_phase":
      withAdmin(state, connectionId, () => {
        advancePhase(state);
      });
      break;
    case "admin_reset":
      withAdmin(state, connectionId, () => {
        forceReset(state);
      });
      break;
    case "admin_toggle_group_mute":
      withAdmin(state, connectionId, () => {
        if (state.mutedGroups.has(message.partId)) {
          state.mutedGroups.delete(message.partId);
        } else {
          state.mutedGroups.add(message.partId);
        }
        broadcastState(state);
      });
      break;
    case "admin_set_aggregation_algorithm":
      withAdmin(state, connectionId, () => {
        if (state.phase !== "phase1_lobby") {
          return;
        }
        state.aggregationAlgorithm = message.algorithm;
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
  if (!state.connections.has(connectionId)) {
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

  if (!restoredSession && state.phase !== "phase1_lobby") {
    sendToConnection(state, connectionId, {
      type: "error",
      message: "Une partie est en cours. Les nouveaux joueurs ne peuvent rejoindre qu'au début."
    });
    return;
  }

  const sessionToken = restoredSession?.sessionToken ?? createId("session");
  const student: StudentSession =
    restoredSession ??
    {
      studentId: createId("student"),
      connectionId,
      sessionToken,
      name: message.name.trim(),
      joinedAt: now,
      lastSeenAt: now
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
      for (const room of state.parts.values()) {
        room.students = room.students.filter((id) => id !== student.studentId);
      }
      state.students.delete(sessionToken);
      state.activeKeysByStudent.delete(student.studentId);
      state.surveyAnswers.delete(student.studentId);
      changed = true;
    }
  }

  if (changed) {
    broadcastState(state);
  }
}

function clearStudentGroupAssignments(state: RuntimeState): void {
  for (const room of state.parts.values()) {
    room.students = [];
  }
  for (const student of state.students.values()) {
    student.partId = undefined;
  }
}

function advancePhase(state: RuntimeState): void {
  switch (state.phase) {
    case "phase1_lobby":
      state.phase = "phase2_groups";
      broadcastState(state);
      break;
    case "phase2_groups":
      state.phase = "phase3_practice";
      state.activeKeysByStudent.clear();
      broadcastState(state);
      break;
    case "phase3_practice":
      state.phase = "phase4_performance";
      state.activeKeysByStudent.clear();
      startPerformance(state, "piano_only", COUNTDOWN_MS, "voted");
      break;
    case "phase4_performance":
      clearPerformanceTimers(state);
      state.performanceStatus = "finished";
      state.phase = "phase5_survey";
      state.surveyAnswers.clear();
      broadcastState(state);
      break;
    case "phase5_survey":
      // Move into the orchestra arc: regroup students and reset audio state.
      clearPerformanceTimers(state);
      clearStudentGroupAssignments(state);
      state.activeKeysByStudent.clear();
      state.mutedGroups.clear();
      state.inputs.clear();
      state.judgements.clear();
      state.groupScores.clear();
      state.globalScore = 0;
      state.performanceStartAtServerMs = undefined;
      state.currentScoreId = undefined;
      state.performanceStatus = "idle";
      state.phase = "phase6_orchestra_groups";
      broadcastState(state);
      break;
    case "phase6_orchestra_groups":
      state.phase = "phase7_orchestra_practice";
      state.activeKeysByStudent.clear();
      broadcastState(state);
      break;
    case "phase7_orchestra_practice":
      state.phase = "phase8_orchestra_performance";
      state.activeKeysByStudent.clear();
      startPerformance(state, "orchestre", COUNTDOWN_MS, "always");
      break;
    case "phase8_orchestra_performance":
      clearPerformanceTimers(state);
      state.performanceStatus = "finished";
      state.phase = "phase9_orchestra_survey";
      state.surveyAnswers.clear();
      broadcastState(state);
      break;
    case "phase9_orchestra_survey":
      forceReset(state);
      break;
  }
}

function forceReset(state: RuntimeState): void {
  for (const connection of Array.from(state.connections.values())) {
    if (connection.role === "student") {
      sendToConnection(state, connection.connectionId, {
        type: "error",
        message: "__RESET__"
      });
      try {
        connection.ws.close?.();
      } catch {
        // ignore
      }
      state.connections.delete(connection.connectionId);
    }
  }

  resetRuntimeState(state);
  broadcastState(state);
}

function startPerformance(
  state: RuntimeState,
  scoreId: ScoreId,
  startDelayMs: number,
  mode: PerformanceMode
): void {
  clearPerformanceTimers(state);
  state.performanceStatus = "countdown";
  state.currentScoreId = scoreId;
  state.performanceStartAtServerMs = Date.now() + startDelayMs;
  state.inputs.clear();
  state.judgements.clear();
  state.groupScores.clear();
  state.globalScore = 0;

  broadcastToAll(state, {
    type: "performance_start",
    scoreId,
    startAtServerMs: state.performanceStartAtServerMs
  });
  broadcastState(state);

  state.performanceTimers.push(
    setTimeout(() => {
      state.performanceStatus = "running";
      broadcastState(state);
    }, startDelayMs)
  );

  scheduleAggregatedPlayback(state, scoreId, state.performanceStartAtServerMs, mode);

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
  startAtServerMs: number,
  mode: PerformanceMode
): void {
  if (mode === "voted" && state.aggregationAlgorithm === "direct") {
    return;
  }

  const score = state.scores[scoreId];
  for (const part of score.parts) {
    for (const note of part.notes) {
      const expectedAtServerMs = startAtServerMs + note.timestampMs;
      const judgeAtMs = expectedAtServerMs + JUDGE_DELAY_MS;
      const delay = Math.max(0, judgeAtMs - Date.now());

      state.performanceTimers.push(
        setTimeout(() => {
          if (
            state.performanceStatus !== "running" &&
            state.performanceStatus !== "countdown"
          ) {
            return;
          }
          if (state.mutedGroups.has(part.id)) {
            return;
          }

          const baseVelocity = Math.min(0.95, note.velocity);
          let velocity: number;

          if (mode === "voted") {
            const algorithm = state.aggregationAlgorithm;
            const count = countCorrectPressers(state, part.id, note, expectedAtServerMs);
            if (algorithm === "democratic") {
              if (count < 1) return;
              velocity = baseVelocity;
            } else if (algorithm === "majority") {
              const groupSize = activeStudentsForPart(state, part.id).length;
              const threshold = Math.ceil(Math.max(1, groupSize) / 2);
              if (count < threshold) return;
              velocity = baseVelocity;
            } else if (algorithm === "doublure") {
              velocity = Math.min(baseVelocity, 0.4 + 0.15 * count);
            } else {
              return;
            }
          } else {
            velocity = baseVelocity;
          }

          broadcastToAdmins(state, {
            type: "group_play_note",
            partId: part.id,
            noteId: note.id,
            midi: note.midi,
            presetKey: part.soundPresetKey,
            durationMs: Math.max(120, note.durationMs),
            velocity,
            playAtServerMs: expectedAtServerMs + OUTPUT_DELAY_MS,
            source: "scheduled"
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
  if (!room) {
    return;
  }

  if (isPracticePhase(state.phase)) {
    let pressed = state.activeKeysByStudent.get(student.studentId);
    if (!pressed) {
      pressed = new Set();
      state.activeKeysByStudent.set(student.studentId, pressed);
    }
    pressed.add(message.midi);

    const score = state.scores[room.scoreId];
    const part = score?.parts.find((candidate) => candidate.id === room.partId);
    if (part && !state.mutedGroups.has(part.id)) {
      broadcastToAdmins(state, {
        type: "group_play_note",
        partId: part.id,
        noteId: `live:${message.eventId}`,
        eventId: message.eventId,
        midi: message.midi,
        presetKey: part.soundPresetKey,
        durationMs: LIVE_PLAY_DURATION_MS,
        velocity: LIVE_PLAY_VELOCITY,
        playAtServerMs: Date.now() + LIVE_PLAY_DELAY_MS,
        source: "live"
      });
    }
    broadcastStateSoon(state);
    return;
  }

  if (
    !isPerformancePhase(state.phase) ||
    !state.performanceStartAtServerMs ||
    !state.currentScoreId
  ) {
    return;
  }

  const score = state.scores[state.currentScoreId];
  const part = score.parts.find((candidate) => candidate.id === room.partId);
  if (!part) {
    return;
  }

  if (
    state.phase === "phase4_performance" &&
    state.aggregationAlgorithm === "direct" &&
    !state.mutedGroups.has(part.id)
  ) {
    broadcastToAdmins(state, {
      type: "group_play_note",
      partId: part.id,
      noteId: `live:${message.eventId}`,
      eventId: message.eventId,
      midi: message.midi,
      presetKey: part.soundPresetKey,
      durationMs: DIRECT_PLAY_DURATION_MS,
      velocity: DIRECT_PLAY_VELOCITY,
      playAtServerMs: Date.now() + LIVE_PLAY_DELAY_MS,
      source: "live"
    });
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
    state.performanceStartAtServerMs
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
    expectedAtServerMs: state.performanceStartAtServerMs + expected.timestampMs,
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
  if (isPracticePhase(state.phase)) {
    const pressed = state.activeKeysByStudent.get(student.studentId);
    if (pressed) {
      pressed.delete(message.midi);
      if (pressed.size === 0) {
        state.activeKeysByStudent.delete(student.studentId);
      }
    }
    broadcastToAdmins(state, { type: "group_stop_note", eventId: message.eventId });
    broadcastStateSoon(state);
    return;
  }

  if (
    !isPerformancePhase(state.phase) ||
    !state.performanceStartAtServerMs ||
    !state.currentScoreId
  ) {
    return;
  }

  const event = state.inputs.get(message.eventId);
  if (!event || event.studentId !== student.studentId) {
    return;
  }

  if (
    state.phase === "phase4_performance" &&
    state.aggregationAlgorithm === "direct"
  ) {
    broadcastToAdmins(state, { type: "group_stop_note", eventId: message.eventId });
  }

  event.serverUpAtMs = message.estimatedServerEventAtMs;
  const score = state.scores[state.currentScoreId];
  const part = score.parts.find((candidate) => candidate.id === event.partId);
  const expected = part?.notes.find((note) => note.id === event.matchedNoteId);
  if (!part || !expected) {
    return;
  }

  const judgement = judgeNote({
    studentId: student.studentId,
    studentName: student.name,
    partId: part.id,
    expected,
    expectedAtServerMs: state.performanceStartAtServerMs + expected.timestampMs,
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
      message: "Session élève introuvable."
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
      message: "Accès admin requis."
    });
    return;
  }

  fn();
}

function broadcastState(state: RuntimeState): void {
  if (stateBroadcastTimer !== undefined) {
    clearTimeout(stateBroadcastTimer);
    stateBroadcastTimer = undefined;
  }
  broadcastToAll(state, {
    type: "state",
    state: publicRuntimeState(state),
    serverNowMs: Date.now()
  });
}

function broadcastStateSoon(state: RuntimeState): void {
  if (stateBroadcastTimer !== undefined) {
    return;
  }
  stateBroadcastTimer = setTimeout(() => {
    stateBroadcastTimer = undefined;
    broadcastToAll(state, {
      type: "state",
      state: publicRuntimeState(state),
      serverNowMs: Date.now()
    });
  }, STATE_COALESCE_MS);
}

function broadcastToAdmins(state: RuntimeState, message: ServerMessage): void {
  const payload = JSON.stringify(message);
  for (const connection of state.connections.values()) {
    if (connection.role === "admin") {
      sendSerialized(connection.ws, payload);
    }
  }
}

function broadcastToAll(state: RuntimeState, message: ServerMessage): void {
  const payload = JSON.stringify(message);
  for (const connection of state.connections.values()) {
    if (connection.role) {
      sendSerialized(connection.ws, payload);
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
  sendSerialized(ws, JSON.stringify(message));
}

function sendSerialized(ws: { send(data: string): void }, payload: string): void {
  try {
    ws.send(payload);
  } catch {
    // The close handler will clean up dead connections.
  }
}
