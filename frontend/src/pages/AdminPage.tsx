import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import type {
  ClientMessage,
  GroupScore,
  PartPublicRoom,
  PublicState,
  ScorePart,
  ServerMessage,
  StudentPublicSession
} from "@classe-orchestre/shared";
import { SURVEY_QUESTIONS } from "@classe-orchestre/shared";
import type { AudioEngine } from "../audio/AudioEngine";
import { GroupKeyboardsView } from "../components/GroupKeyboardsView";
import { HoldResetButton } from "../components/HoldResetButton";
import { PhaseAdvanceButton } from "../components/PhaseAdvanceButton";
import { QrCode } from "../components/QrCode";
import { SongProgressBar } from "../components/SongProgressBar";

type GroupPlayNote = Extract<ServerMessage, { type: "group_play_note" }> & {
  receivedAt: number;
  key: string;
};

type AdminPageProps = {
  state: PublicState;
  status: string;
  error?: string;
  send(message: ClientMessage): void;
  audioEngine: AudioEngine;
  audioReady: boolean;
  serverTimeOffsetMs: number;
  groupNotes: GroupPlayNote[];
  groupStops: string[];
  onUnlockAudio(): Promise<void>;
};

const QR_TARGET_URL = "https://jaffrain.xyz";
const HOTSPOT_NAME = "Iphone de Tom";
const HOTSPOT_PASSWORD = "244466666";

export function AdminPage({
  state,
  error,
  send,
  audioEngine,
  audioReady,
  serverTimeOffsetMs,
  groupNotes,
  groupStops,
  onUnlockAudio
}: AdminPageProps) {
  const playedNotesRef = useRef(new Set<string>());
  const stoppedNotesRef = useRef(new Set<string>());
  const [drillPartId, setDrillPartId] = useState<string | undefined>();

  useEffect(() => {
    if (!audioReady) return;
    for (const note of groupNotes) {
      if (playedNotesRef.current.has(note.key)) continue;
      playedNotesRef.current.add(note.key);
      audioEngine
        .schedule({
          presetKey: note.presetKey,
          midi: note.midi,
          durationMs: note.durationMs,
          velocity: note.velocity,
          playAtServerMs: note.playAtServerMs,
          serverTimeOffsetMs,
          sustainKey: note.eventId
        })
        .catch(() => undefined);
    }
  }, [audioEngine, audioReady, groupNotes, serverTimeOffsetMs]);

  useEffect(() => {
    if (!audioReady) return;
    for (const eventId of groupStops) {
      if (stoppedNotesRef.current.has(eventId)) continue;
      stoppedNotesRef.current.add(eventId);
      audioEngine.stopNote(eventId);
    }
  }, [audioEngine, audioReady, groupStops]);

  useEffect(() => {
    if (
      state.phase !== "phase3_practice" &&
      state.phase !== "phase7_orchestra_practice"
    ) {
      setDrillPartId(undefined);
    }
  }, [state.phase]);

  const advance = () => send({ type: "admin_advance_phase" });
  const reset = () => send({ type: "admin_reset" });

  const phase = state.phase;

  const pianoScore = state.scores.piano_only;
  const orchestreScore = state.scores.orchestre;

  const pianoParts = pianoScore?.parts ?? [];
  const orchestreParts = orchestreScore?.parts ?? [];

  const pianoRooms = state.parts.filter((room) => room.scoreId === "piano_only");
  const orchestreRooms = state.parts.filter((room) => room.scoreId === "orchestre");

  const drillPart =
    drillPartId &&
    (pianoParts.find((p) => p.id === drillPartId) ??
      orchestreParts.find((p) => p.id === drillPartId));
  const drillRoom = drillPartId
    ? state.parts.find((r) => r.partId === drillPartId)
    : undefined;

  return (
    <main className="admin-shell">
      {!audioReady ? (
        <button
          type="button"
          className="audio-unlock-overlay"
          onClick={onUnlockAudio}
        >
          Cliquer pour activer l'audio
        </button>
      ) : null}

      {error ? <div className="admin-error">{error}</div> : null}

      {phase === "phase1_lobby" ? (
        <Phase1View students={state.students} onAdvance={advance} />
      ) : null}

      {phase === "phase2_groups" ? (
        <GroupsView
          phase="phase2_groups"
          parts={pianoParts}
          rooms={pianoRooms}
          students={state.students}
          onAdvance={advance}
        />
      ) : null}

      {phase === "phase6_orchestra_groups" ? (
        <GroupsView
          phase="phase6_orchestra_groups"
          parts={orchestreParts}
          rooms={orchestreRooms}
          students={state.students}
          onAdvance={advance}
        />
      ) : null}

      {(phase === "phase3_practice" || phase === "phase7_orchestra_practice") &&
      drillPart &&
      drillRoom ? (
        <PracticeDrillView
          phase={phase}
          part={drillPart}
          room={drillRoom}
          students={state.students}
          activeKeysByStudent={state.activeKeysByStudent}
          muted={state.mutedGroups.includes(drillPart.id)}
          onClose={() => setDrillPartId(undefined)}
          onAdvance={advance}
        />
      ) : null}

      {phase === "phase3_practice" && !drillPart ? (
        <PracticeView
          phase="phase3_practice"
          parts={pianoParts}
          rooms={pianoRooms}
          students={state.students}
          mutedGroups={state.mutedGroups}
          maxStudentsPerGroup={8}
          onToggleMute={(partId) => send({ type: "admin_toggle_group_mute", partId })}
          onSelectGroup={setDrillPartId}
          onAdvance={advance}
        />
      ) : null}

      {phase === "phase7_orchestra_practice" && !drillPart ? (
        <PracticeView
          phase="phase7_orchestra_practice"
          parts={orchestreParts}
          rooms={orchestreRooms}
          students={state.students}
          mutedGroups={state.mutedGroups}
          maxStudentsPerGroup={8}
          onToggleMute={(partId) => send({ type: "admin_toggle_group_mute", partId })}
          onSelectGroup={setDrillPartId}
          onAdvance={advance}
        />
      ) : null}

      {phase === "phase4_performance" ? (
        <PerformanceView
          phase="phase4_performance"
          score={pianoScore}
          parts={pianoParts}
          rooms={pianoRooms}
          state={state}
          serverTimeOffsetMs={serverTimeOffsetMs}
          onAdvance={advance}
        />
      ) : null}

      {phase === "phase8_orchestra_performance" ? (
        <PerformanceView
          phase="phase8_orchestra_performance"
          score={orchestreScore}
          parts={orchestreParts}
          rooms={orchestreRooms}
          state={state}
          serverTimeOffsetMs={serverTimeOffsetMs}
          onAdvance={advance}
        />
      ) : null}

      {phase === "phase5_survey" || phase === "phase9_orchestra_survey" ? (
        <SurveyView phase={phase} surveyResults={state.surveyResults} onAdvance={advance} />
      ) : null}

      {phase !== "phase1_lobby" ? (
        <div className="admin-reset-anchor">
          <HoldResetButton onConfirm={reset} />
        </div>
      ) : null}
    </main>
  );
}

function Phase1View({
  students,
  onAdvance
}: {
  students: StudentPublicSession[];
  onAdvance(): void;
}) {
  const onlineStudents = students.filter((student) => student.online);

  return (
    <section className="phase phase-1">
      <div className="phase1-qr">
        <QrCode value={QR_TARGET_URL} size={440} />
        <div className="phase1-hotspot">
          <span className="phase1-hotspot-label">Wifi</span>
          <div className="phase1-hotspot-row">
            <span className="phase1-hotspot-key">ID</span>
            <span className="phase1-hotspot-name">{HOTSPOT_NAME}</span>
          </div>
          <div className="phase1-hotspot-row">
            <span className="phase1-hotspot-key">MDP</span>
            <span className="phase1-hotspot-pass">{HOTSPOT_PASSWORD}</span>
          </div>
        </div>
      </div>
      <div className="phase1-cta">
        <PhaseAdvanceButton
          phase="phase1_lobby"
          onAdvance={onAdvance}
          size="huge"
          disabled={onlineStudents.length === 0}
        />
      </div>
      <div className="phase1-counter">
        <span className="phase1-count">{onlineStudents.length}</span>
        <span className="phase1-count-label">
          {onlineStudents.length <= 1 ? "élève connecté" : "élèves connectés"}
        </span>
        {onlineStudents.length > 0 ? (
          <ul className="phase1-name-list">
            {onlineStudents.map((student) => (
              <li key={student.id}>{student.name}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function GroupsView({
  phase,
  parts,
  rooms,
  students,
  onAdvance
}: {
  phase: PublicState["phase"];
  parts: ScorePart[];
  rooms: PartPublicRoom[];
  students: StudentPublicSession[];
  onAdvance(): void;
}) {
  const allowedPartIds = new Set(parts.map((p) => p.id));
  const unassigned = students.filter(
    (student) =>
      student.online &&
      (!student.partId || !allowedPartIds.has(student.partId))
  );

  const isOrchestra = phase === "phase6_orchestra_groups";

  return (
    <section className={`phase ${isOrchestra ? "phase-6" : "phase-2"}`}>
      <header className="phase-header">
        <PhaseAdvanceButton phase={phase} onAdvance={onAdvance} />
      </header>
      <div className={isOrchestra ? "phase6-grid" : "phase2-grid"}>
        {parts.map((part) => {
          const room = rooms.find((r) => r.partId === part.id);
          const members = students.filter(
            (student) => room?.students.includes(student.id) && student.online
          );
          return (
            <div key={part.id} className={isOrchestra ? "phase6-square" : "phase2-square"}>
              <h3>{part.displayName}</h3>
              <p className={isOrchestra ? "phase6-count" : "phase2-count"}>
                {members.length}
              </p>
              <ul>
                {members.map((s) => (
                  <li key={s.id}>{s.name}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="phase2-unassigned">
        <h4>Sans groupe ({unassigned.length})</h4>
        <ul>
          {unassigned.length === 0 ? (
            <li className="muted">Tous les élèves ont rejoint un groupe.</li>
          ) : (
            unassigned.map((s) => <li key={s.id}>{s.name}</li>)
          )}
        </ul>
      </div>
    </section>
  );
}

function PracticeView({
  phase,
  parts,
  rooms,
  students,
  mutedGroups,
  maxStudentsPerGroup,
  onToggleMute,
  onSelectGroup,
  onAdvance
}: {
  phase: PublicState["phase"];
  parts: ScorePart[];
  rooms: PartPublicRoom[];
  students: StudentPublicSession[];
  mutedGroups: string[];
  maxStudentsPerGroup: number;
  onToggleMute(partId: string): void;
  onSelectGroup(partId: string): void;
  onAdvance(): void;
}) {
  const isOrchestra = phase === "phase7_orchestra_practice";
  return (
    <section className={`phase ${isOrchestra ? "phase-7" : "phase-3"}`}>
      <header className="phase-header">
        <PhaseAdvanceButton phase={phase} onAdvance={onAdvance} />
      </header>
      <div className={isOrchestra ? "phase7-grid" : "phase3-grid"}>
        {parts.map((part) => {
          const room = rooms.find((r) => r.partId === part.id);
          const members = students.filter(
            (student) => room?.students.includes(student.id) && student.online
          );
          const muted = mutedGroups.includes(part.id);
          return (
            <div
              key={part.id}
              className={`phase3-square${muted ? " is-muted" : ""}`}
            >
              <header>
                <h3>{part.displayName}</h3>
                <button
                  type="button"
                  className="mute-toggle"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleMute(part.id);
                  }}
                  title={muted ? "Réactiver" : "Mute"}
                >
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              </header>
              <button
                type="button"
                className="phase3-square-body"
                onClick={() => onSelectGroup(part.id)}
              >
                <p className="phase3-count">
                  {members.length} / {maxStudentsPerGroup}
                </p>
                <ul>
                  {members.length === 0 ? (
                    <li className="muted">Aucun élève</li>
                  ) : (
                    members.map((s) => <li key={s.id}>{s.name}</li>)
                  )}
                </ul>
                <span className="phase3-cta">Voir les claviers</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PracticeDrillView({
  phase,
  part,
  room,
  students,
  activeKeysByStudent,
  muted,
  onClose,
  onAdvance
}: {
  phase: PublicState["phase"];
  part: ScorePart;
  room: PartPublicRoom;
  students: StudentPublicSession[];
  activeKeysByStudent: Record<string, number[]>;
  muted: boolean;
  onClose(): void;
  onAdvance(): void;
}) {
  return (
    <section className="phase phase-3-drill">
      <header className="phase-header">
        <PhaseAdvanceButton phase={phase} onAdvance={onAdvance} />
      </header>
      <GroupKeyboardsView
        part={part}
        room={room}
        students={students}
        activeKeysByStudent={activeKeysByStudent}
        muted={muted}
        onClose={onClose}
      />
    </section>
  );
}

function PerformanceView({
  phase,
  score,
  parts,
  rooms,
  state,
  serverTimeOffsetMs,
  onAdvance
}: {
  phase: PublicState["phase"];
  score: PublicState["scores"]["piano_only"] | undefined;
  parts: ScorePart[];
  rooms: PartPublicRoom[];
  state: PublicState;
  serverTimeOffsetMs: number;
  onAdvance(): void;
}) {
  const groupScoresByPart = useMemo(() => {
    const map = new Map<string, GroupScore>();
    for (const groupScore of state.groupScores) {
      map.set(groupScore.partId, groupScore);
    }
    return map;
  }, [state.groupScores]);

  const isOrchestra = phase === "phase8_orchestra_performance";
  return (
    <section className={`phase ${isOrchestra ? "phase-8" : "phase-4"}`}>
      <header className="phase-header">
        <PhaseAdvanceButton phase={phase} onAdvance={onAdvance} />
      </header>
      <div className="phase4-progress">
        {state.performanceStartAtServerMs ? (
          <SongProgressBar
            startAtServerMs={state.performanceStartAtServerMs}
            durationMs={score?.durationMs ?? 0}
            serverTimeOffsetMs={serverTimeOffsetMs}
          />
        ) : (
          <div className="song-progress empty">
            <span className="song-progress-label">Préparation…</span>
          </div>
        )}
      </div>
      <div className={isOrchestra ? "phase8-grid" : "phase4-grid"}>
        {parts.map((part) => {
          const room = rooms.find((r) => r.partId === part.id);
          const groupScore = groupScoresByPart.get(part.id);
          const studentScoreById = new Map(
            (groupScore?.studentScores ?? []).map((s) => [s.studentId, s])
          );
          const members = state.students.filter(
            (student) => room?.students.includes(student.id) && student.online
          );
          return (
            <div key={part.id} className={isOrchestra ? "phase8-square" : "phase4-square"}>
              <h3>{part.displayName}</h3>
              <ul>
                {members.length === 0 ? (
                  <li className="muted">Aucun élève</li>
                ) : (
                  members.map((s) => {
                    const studentScore = studentScoreById.get(s.id)?.score ?? 0;
                    return (
                      <li key={s.id}>
                        <span className="phase4-name">{s.name}</span>
                        <span className="phase4-score">
                          {Math.round(studentScore * 100)}%
                        </span>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SurveyView({
  phase,
  surveyResults,
  onAdvance
}: {
  phase: PublicState["phase"];
  surveyResults: PublicState["surveyResults"];
  onAdvance(): void;
}) {
  return (
    <section className="phase phase-5">
      <header className="phase-header">
        <PhaseAdvanceButton phase={phase} onAdvance={onAdvance} />
      </header>
      <div className="survey-results">
        {SURVEY_QUESTIONS.map((question, index) => {
          const counts = surveyResults[question.id] ?? {};
          const total =
            Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
          return (
            <div key={question.id} className="survey-row">
              <h4>
                <span className="survey-num">{index + 1}.</span> {question.label}
              </h4>
              <div className="survey-bars">
                {question.answers.map((answer) => {
                  const count = counts[answer.id] ?? 0;
                  const ratio = count / total;
                  return (
                    <div key={answer.id} className="survey-bar">
                      <span className="survey-bar-label">{answer.label}</span>
                      <div className="survey-bar-track">
                        <div
                          className="survey-bar-fill"
                          style={{ width: `${(ratio * 100).toFixed(1)}%` }}
                        />
                      </div>
                      <span className="survey-bar-count">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
