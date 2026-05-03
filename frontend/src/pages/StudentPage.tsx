import { useMemo, useRef } from "react";
import type {
  ClientMessage,
  PublicState,
  ScoreId
} from "@classe-orchestre/shared";
import { midiToNoteName } from "@classe-orchestre/shared";
import { GroupPicker } from "../components/GroupPicker";
import { MiniKeyboard } from "../components/MiniKeyboard";
import { NoteHighway } from "../components/NoteHighway";
import { Survey } from "../components/Survey";
import { WaitingRoom } from "../components/WaitingRoom";
import { makeEventId } from "../realtime/socket";

type StudentPageProps = {
  state: PublicState;
  status: string;
  error?: string;
  connectionId?: string;
  serverTimeOffsetMs: number;
  send(message: ClientMessage): void;
};

function activeScoreIdForPhase(phase: PublicState["phase"]): ScoreId | undefined {
  switch (phase) {
    case "phase2_groups":
    case "phase3_practice":
    case "phase4_performance":
      return "piano_only";
    case "phase6_orchestra_groups":
    case "phase7_orchestra_practice":
    case "phase8_orchestra_performance":
      return "orchestre";
    default:
      return undefined;
  }
}

export function StudentPage({
  state,
  serverTimeOffsetMs,
  connectionId,
  send
}: StudentPageProps) {
  const activeEventsRef = useRef(new Map<number, string>());
  const student = state.students.find(
    (candidate) => candidate.connectionId === connectionId
  );

  const studentRoom = state.parts.find((room) =>
    student?.partId ? room.partId === student.partId : false
  );
  const studentScoreId = studentRoom?.scoreId;
  const score = studentScoreId ? state.scores[studentScoreId] : undefined;
  const part = useMemo(
    () => score?.parts.find((candidate) => candidate.id === student?.partId),
    [score?.parts, student?.partId]
  );

  const handleInputDown = (midi: number) => {
    const eventId = makeEventId("input");
    const now = Date.now();
    activeEventsRef.current.set(midi, eventId);

    send({
      type: "input_down",
      eventId,
      note: midiToNoteName(midi),
      midi,
      clientEventAtMs: now,
      estimatedServerEventAtMs: now + serverTimeOffsetMs
    });
  };

  const handleInputUp = (midi: number) => {
    const eventId = activeEventsRef.current.get(midi);
    if (!eventId) {
      return;
    }
    activeEventsRef.current.delete(midi);
    const now = Date.now();
    send({
      type: "input_up",
      eventId,
      note: midiToNoteName(midi),
      midi,
      clientEventAtMs: now,
      estimatedServerEventAtMs: now + serverTimeOffsetMs
    });
  };

  if (!student) {
    return (
      <main className="student-shell">
        <div className="centered-panel">Connexion en cours…</div>
      </main>
    );
  }

  const phase = state.phase;

  if (phase === "phase1_lobby") {
    return (
      <main className="student-shell">
        <header className="student-header-phone">
          <h1>{student.name}</h1>
        </header>
        <WaitingRoom
          title="En attente de l'administrateur"
          subtitle="La session va commencer."
        />
      </main>
    );
  }

  if (phase === "phase5_survey" || phase === "phase9_orchestra_survey") {
    return (
      <main className="student-shell">
        <header className="student-header-phone">
          <h1>{student.name}</h1>
        </header>
        <Survey
          onSubmit={(questionId, answerId) =>
            send({ type: "student_submit_answer", questionId, answerId })
          }
        />
      </main>
    );
  }

  // phase 2/3/4 (piano) OR phase 6/7/8 (orchestra)

  const targetScoreId = activeScoreIdForPhase(phase);
  const targetScore = targetScoreId ? state.scores[targetScoreId] : undefined;

  const isGroupsPhase =
    phase === "phase2_groups" || phase === "phase6_orchestra_groups";
  const isPracticePhase =
    phase === "phase3_practice" || phase === "phase7_orchestra_practice";
  const isPerformancePhase =
    phase === "phase4_performance" || phase === "phase8_orchestra_performance";

  if (isGroupsPhase) {
    if (!part || studentScoreId !== targetScoreId) {
      return (
        <main className="student-shell">
          <header className="student-header-phone">
            <h1>{student.name}</h1>
          </header>
          <GroupPicker
            parts={targetScore?.parts ?? []}
            rooms={state.parts.filter((room) => room.scoreId === targetScoreId)}
            students={state.students}
            selectedPartId={undefined}
            onJoin={(partId) => send({ type: "join_part", partId })}
          />
        </main>
      );
    }
    return (
      <main className="student-shell">
        <header className="student-header-phone">
          <p className="eyebrow">{part.displayName}</p>
          <h1>{student.name}</h1>
        </header>
        <WaitingRoom
          title={`Tu es dans ${part.displayName}`}
          subtitle="En attente des autres élèves."
        />
      </main>
    );
  }

  if (!part || studentScoreId !== targetScoreId) {
    return (
      <main className="student-shell">
        <header className="student-header-phone">
          <h1>{student.name}</h1>
        </header>
        <WaitingRoom
          title="Pas de groupe"
          subtitle="Tu n'as pas de groupe pour cette partie."
        />
      </main>
    );
  }

  if (isPracticePhase) {
    return (
      <main className="student-shell student-keyboard-only">
        <header className="student-header-phone">
          <p className="eyebrow">{part.displayName}</p>
          <h1>{student.name}</h1>
        </header>
        <div className="practice-zone">
          <p className="practice-hint">Joue librement</p>
        </div>
        <MiniKeyboard
          lanes={part.lanes}
          presetKey={part.soundPresetKey}
          onInputDown={handleInputDown}
          onInputUp={handleInputUp}
        />
      </main>
    );
  }

  if (isPerformancePhase) {
    return (
      <main className="student-shell performance-layout">
        <header className="student-header-phone compact">
          <p className="eyebrow">{part.displayName}</p>
          <span>{student.name}</span>
        </header>
        {state.performanceStartAtServerMs ? (
          <NoteHighway
            part={part}
            startAtServerMs={state.performanceStartAtServerMs}
            serverTimeOffsetMs={serverTimeOffsetMs}
            leadTimeMs={3000}
          />
        ) : (
          <WaitingRoom title="Préparation…" />
        )}
        <MiniKeyboard
          lanes={part.lanes}
          presetKey={part.soundPresetKey}
          onInputDown={handleInputDown}
          onInputUp={handleInputUp}
        />
      </main>
    );
  }

  return (
    <main className="student-shell">
      <div className="centered-panel">…</div>
    </main>
  );
}
