import { z } from "zod";
import type { NormalizedScore, ScoreId } from "./score";

export const appStageSchema = z.enum([
  "lobby",
  "piano_practice",
  "piano_performance",
  "piano_qa",
  "orchestra_practice",
  "orchestra_performance",
  "orchestra_qa"
]);

export const performanceStatusSchema = z.enum([
  "idle",
  "countdown",
  "running",
  "stopped",
  "finished"
]);

export const scoreIdSchema = z.enum(["piano_only", "orchestre"]);
export const audioModeSchema = z.enum(["local_immediate", "server_aggregated"]);

export type AppStage = z.infer<typeof appStageSchema>;
export type PerformanceStatus = z.infer<typeof performanceStatusSchema>;
export type AudioMode = z.infer<typeof audioModeSchema>;

export type BaseMessage = {
  type: string;
  requestId?: string;
};

export type StudentPublicSession = {
  id: string;
  connectionId?: string;
  name: string;
  partId?: string;
  joinedAt: number;
  lastSeenAt: number;
  ready: boolean;
  isSpeaker: boolean;
  online: boolean;
};

export type PartPublicRoom = {
  partId: string;
  scoreId: ScoreId;
  displayName: string;
  soundPresetKey: string;
  students: string[];
  maxSize: number;
};

export type QAQuestion = {
  id: string;
  studentName: string;
  text: string;
  createdAt: number;
  answered: boolean;
};

export type IndividualNoteScore = {
  studentId: string;
  studentName: string;
  noteId: string;
  timingErrorMs: number;
  durationErrorMs: number;
  timingScore: number;
  holdScore: number;
  totalScore: number;
  label: "perfect" | "good" | "late" | "early" | "miss";
};

export type NoteJudgement = IndividualNoteScore & {
  partId: string;
  expectedMidi: number;
  actualMidi: number;
  judgedAtMs: number;
};

export type StudentScore = {
  studentId: string;
  studentName: string;
  score: number;
  judgedNotes: number;
};

export type GroupScore = {
  partId: string;
  displayName: string;
  score: number;
  judgedNotes: number;
  expectedNotes: number;
  activeStudents: number;
  incomplete: boolean;
  studentScores: StudentScore[];
};

export type PublicState = {
  stage: AppStage;
  performanceStatus: PerformanceStatus;
  currentScoreId?: ScoreId;
  startAtServerMs?: number;
  audioMode: AudioMode;
  groupSize: number;
  allowOverflow: boolean;
  scores: Record<ScoreId, NormalizedScore>;
  parts: PartPublicRoom[];
  students: StudentPublicSession[];
  questions: QAQuestion[];
  groupScores: GroupScore[];
  globalScore: number;
};

const baseFields = {
  requestId: z.string().optional()
};

export const clientMessageSchema = z.union([
  z.object({
    ...baseFields,
    type: z.literal("hello"),
    role: z.literal("student"),
    name: z.string().trim().min(1).max(80),
    sessionToken: z.string().optional()
  }),
  z.object({
    ...baseFields,
    type: z.literal("hello"),
    role: z.literal("admin"),
    password: z.string()
  }),
  z.object({
    ...baseFields,
    type: z.literal("join_part"),
    partId: z.string().min(1)
  }),
  z.object({
    ...baseFields,
    type: z.literal("leave_part")
  }),
  z.object({
    ...baseFields,
    type: z.literal("ready"),
    ready: z.boolean()
  }),
  z.object({
    ...baseFields,
    type: z.literal("clock_ping"),
    clientSentAtMs: z.number()
  }),
  z.object({
    ...baseFields,
    type: z.literal("input_down"),
    eventId: z.string().min(1),
    note: z.string().min(1),
    midi: z.number(),
    clientEventAtMs: z.number(),
    estimatedServerEventAtMs: z.number()
  }),
  z.object({
    ...baseFields,
    type: z.literal("input_up"),
    eventId: z.string().min(1),
    note: z.string().min(1),
    midi: z.number(),
    clientEventAtMs: z.number(),
    estimatedServerEventAtMs: z.number()
  }),
  z.object({
    ...baseFields,
    type: z.literal("admin_set_stage"),
    stage: appStageSchema
  }),
  z.object({
    ...baseFields,
    type: z.literal("admin_start_performance"),
    scoreId: scoreIdSchema,
    startDelayMs: z.number().int().min(0).max(10000),
    audioMode: audioModeSchema
  }),
  z.object({
    ...baseFields,
    type: z.literal("admin_stop")
  }),
  z.object({
    ...baseFields,
    type: z.literal("admin_set_overflow"),
    allowOverflow: z.boolean()
  }),
  z.object({
    ...baseFields,
    type: z.literal("admin_assign_student"),
    studentId: z.string().min(1),
    partId: z.string().min(1)
  }),
  z.object({
    ...baseFields,
    type: z.literal("qa_submit_question"),
    text: z.string().trim().min(1).max(500)
  }),
  z.object({
    ...baseFields,
    type: z.literal("admin_mark_question_answered"),
    questionId: z.string().min(1)
  }),
  z.object({
    ...baseFields,
    type: z.literal("admin_clear_questions")
  })
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | {
      type: "welcome";
      connectionId: string;
      role: "student" | "admin";
      state: PublicState;
      serverNowMs: number;
      sessionToken?: string;
    }
  | {
      type: "state";
      state: PublicState;
      serverNowMs: number;
    }
  | {
      type: "clock_pong";
      clientSentAtMs: number;
      serverReceivedAtMs: number;
      serverSentAtMs: number;
    }
  | {
      type: "performance_start";
      scoreId: ScoreId;
      startAtServerMs: number;
      audioMode: AudioMode;
    }
  | {
      type: "group_play_note";
      partId: string;
      noteId: string;
      midi: number;
      presetKey: string;
      durationMs: number;
      velocity: number;
      playAtServerMs: number;
    }
  | {
      type: "note_judgement";
      judgement: NoteJudgement;
    }
  | {
      type: "score_update";
      groupScores: GroupScore[];
      globalScore: number;
    }
  | {
      type: "error";
      message: string;
    };

export function parseClientMessage(value: unknown): ClientMessage {
  return clientMessageSchema.parse(value);
}
