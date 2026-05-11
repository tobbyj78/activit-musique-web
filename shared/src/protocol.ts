import { z } from "zod";
import type { NormalizedScore, ScoreId } from "./score";
import type { SurveyResults } from "./survey";

export const appPhaseSchema = z.enum([
  "phase1_lobby",
  "phase2_groups",
  "phase3_practice",
  "phase4_performance",
  "phase5_survey",
  "phase6_orchestra_groups",
  "phase7_orchestra_practice",
  "phase8_orchestra_performance",
  "phase9_orchestra_survey"
]);

export const performanceStatusSchema = z.enum([
  "idle",
  "countdown",
  "running",
  "stopped",
  "finished"
]);

export const scoreIdSchema = z.enum(["piano_only", "orchestre"]);

export const aggregationAlgorithmSchema = z.enum([
  "democratic",
  "majority",
  "doublure",
  "direct",
  "quorum",
  "cohesion",
  "burst"
]);

export type AppPhase = z.infer<typeof appPhaseSchema>;
export type PerformanceStatus = z.infer<typeof performanceStatusSchema>;
export type AggregationAlgorithm = z.infer<typeof aggregationAlgorithmSchema>;

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
  studentScores: StudentScore[];
};

export type PublicState = {
  phase: AppPhase;
  performanceStatus: PerformanceStatus;
  performanceStartAtServerMs?: number;
  currentScoreId?: ScoreId;
  scores: Record<ScoreId, NormalizedScore>;
  parts: PartPublicRoom[];
  students: StudentPublicSession[];
  mutedGroups: string[];
  activeKeysByStudent: Record<string, number[]>;
  surveyResults: SurveyResults;
  groupScores: GroupScore[];
  globalScore: number;
  aggregationAlgorithm: AggregationAlgorithm;
  wrongNoteVelocity: number;
};

export type PublicRuntimeState = Omit<PublicState, "scores">;

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
    type: z.literal("admin_advance_phase")
  }),
  z.object({
    ...baseFields,
    type: z.literal("admin_reset")
  }),
  z.object({
    ...baseFields,
    type: z.literal("admin_toggle_group_mute"),
    partId: z.string().min(1)
  }),
  z.object({
    ...baseFields,
    type: z.literal("admin_set_aggregation_algorithm"),
    algorithm: aggregationAlgorithmSchema
  }),
  z.object({
    ...baseFields,
    type: z.literal("admin_set_wrong_note_velocity"),
    velocity: z.number().min(0).max(1)
  }),
  z.object({
    ...baseFields,
    type: z.literal("student_submit_answer"),
    questionId: z.string().min(1),
    answerId: z.string().min(1)
  })
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type GroupPlayNoteSource = "live" | "scheduled";

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
      state: PublicRuntimeState;
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
    }
  | {
      type: "group_play_note";
      partId: string;
      noteId: string;
      eventId?: string;
      midi: number;
      presetKey: string;
      durationMs: number;
      velocity: number;
      playAtServerMs: number;
      source: GroupPlayNoteSource;
    }
  | {
      type: "group_stop_note";
      eventId: string;
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
