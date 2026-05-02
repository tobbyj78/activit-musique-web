import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ClientMessage,
  NoteJudgement,
  PublicState,
  ServerMessage
} from "@classe-orchestre/shared";
import { midiToNoteName } from "@classe-orchestre/shared";
import { AudioEngine } from "../audio/AudioEngine";
import { GroupPicker } from "../components/GroupPicker";
import { MiniKeyboard } from "../components/MiniKeyboard";
import { NoteHighway } from "../components/NoteHighway";
import { QAView } from "../components/QAView";
import { WaitingRoom } from "../components/WaitingRoom";
import { makeEventId } from "../realtime/socket";

type GroupPlayNote = Extract<ServerMessage, { type: "group_play_note" }> & {
  receivedAt: number;
  key: string;
};

type StudentPageProps = {
  state: PublicState;
  status: string;
  error?: string;
  connectionId?: string;
  serverTimeOffsetMs: number;
  send(message: ClientMessage): void;
  audioEngine: AudioEngine;
  audioReady: boolean;
  onUnlockAudio(): Promise<void>;
  groupNotes: GroupPlayNote[];
  latestJudgement?: NoteJudgement;
};

export function StudentPage({
  state,
  status,
  error,
  connectionId,
  serverTimeOffsetMs,
  send,
  audioEngine,
  audioReady,
  onUnlockAudio,
  groupNotes,
  latestJudgement
}: StudentPageProps) {
  const activeEventsRef = useRef(new Map<number, string>());
  const playedGroupNotesRef = useRef(new Set<string>());
  const [audioDebug, setAudioDebug] = useState<string>();
  const student = state.students.find((candidate) => candidate.connectionId === connectionId);
  const scoreId = state.currentScoreId ?? "piano_only";
  const score = state.scores[scoreId];
  const part = useMemo(
    () => score.parts.find((candidate) => candidate.id === student?.partId),
    [score.parts, student?.partId]
  );
  const isPractice =
    state.stage === "piano_practice" || state.stage === "orchestra_practice";
  const isPerformance =
    state.stage === "piano_performance" || state.stage === "orchestra_performance";
  const isQa = state.stage === "piano_qa" || state.stage === "orchestra_qa";

  useEffect(() => {
    if (part) {
      audioEngine.preloadPreset(part.soundPresetKey).catch(() => undefined);
    }
  }, [audioEngine, part]);

  useEffect(() => {
    if (!part || state.audioMode !== "server_aggregated") {
      return;
    }

    for (const note of groupNotes) {
      if (note.partId !== part.id || playedGroupNotesRef.current.has(note.key)) {
        continue;
      }

      playedGroupNotesRef.current.add(note.key);
      audioEngine
        .schedule({
          presetKey: note.presetKey,
          midi: note.midi,
          durationMs: note.durationMs,
          velocity: note.velocity,
          playAtServerMs: note.playAtServerMs,
          serverTimeOffsetMs
        })
        .catch(() => undefined);
    }
  }, [audioEngine, groupNotes, part, serverTimeOffsetMs, state.audioMode]);

  const handleInputDown = (midi: number) => {
    if (!part) {
      return;
    }

    const eventId = makeEventId("input");
    const now = Date.now();
    const note = midiToNoteName(midi);
    activeEventsRef.current.set(midi, eventId);

    send({
      type: "input_down",
      eventId,
      note,
      midi,
      clientEventAtMs: now,
      estimatedServerEventAtMs: now + serverTimeOffsetMs
    });

    if (isPractice || (isPerformance && state.audioMode === "local_immediate")) {
      audioEngine
        .playNow({
          presetKey: part.soundPresetKey,
          midi,
          durationMs: 300,
          velocity: 0.55
        })
        .catch(() => undefined);
    }
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

  const testSound = () => {
    const debug = audioEngine.playTestToneNow();
    setAudioDebug(
      `Audio: ${debug.contextState}, t=${debug.currentTime.toFixed(2)}${
        debug.error ? `, ${debug.error}` : ""
      }`
    );
    void onUnlockAudio().catch((error) => {
      setAudioDebug(
        `Audio: erreur, ${error instanceof Error ? error.message : "inconnue"}`
      );
    });
    if (part) {
      void audioEngine.playNow({
        presetKey: part.soundPresetKey,
        midi: part.lanes[0]?.midi ?? 72,
        durationMs: 500,
        velocity: 0.75
      });
    }
  };

  if (!student) {
    return (
      <main className="app-shell student-shell">
        <div className="panel centered-panel">Connexion eleve en cours...</div>
      </main>
    );
  }

  if (isQa) {
    return (
      <main className="app-shell student-shell">
        <StudentHeader
          name={student.name}
          partName={part?.displayName}
          status={status}
          error={error}
        />
        <section className="panel">
          <QAView
            role="student"
            questions={state.questions}
            onSubmit={(text) =>
              send({
                type: "qa_submit_question",
                text
              })
            }
          />
        </section>
      </main>
    );
  }

  if (!part) {
    return (
      <main className="app-shell student-shell">
        <StudentHeader name={student.name} status={status} error={error} />
        <GroupPicker
          score={score}
          rooms={state.parts}
          students={state.students}
          selectedPartId={student.partId}
          onJoin={(partId) =>
            send({
              type: "join_part",
              partId
            })
          }
        />
      </main>
    );
  }

  return (
    <main className="app-shell student-shell performance-layout">
      <StudentHeader
        name={student.name}
        partName={part.displayName}
        status={status}
        error={error}
      />

      <div className="audio-actions">
        {!audioReady ? (
          <button onClick={onUnlockAudio}>Activer le son</button>
        ) : null}
        <button onClick={testSound}>Tester le son</button>
        {audioDebug ? <span>{audioDebug}</span> : null}
      </div>

      {isPerformance && state.startAtServerMs ? (
        <NoteHighway
          part={part}
          startAtServerMs={state.startAtServerMs}
          serverTimeOffsetMs={serverTimeOffsetMs}
          leadTimeMs={3000}
        />
      ) : (
        <WaitingRoom
          stage={state.stage}
          partName={part.displayName}
          ready={student.ready}
          onReady={(ready) =>
            send({
              type: "ready",
              ready
            })
          }
        />
      )}

      {(isPractice || isPerformance) && (
        <MiniKeyboard
          lanes={part.lanes}
          presetKey={part.soundPresetKey}
          mode={isPractice ? "practice" : "performance"}
          onInputDown={handleInputDown}
          onInputUp={handleInputUp}
        />
      )}

      {latestJudgement ? (
        <div className={`judgement-toast ${latestJudgement.label}`}>
          {latestJudgement.label} - {Math.round(latestJudgement.totalScore * 100)}%
        </div>
      ) : null}
    </main>
  );
}

function StudentHeader({
  name,
  partName,
  status,
  error
}: {
  name: string;
  partName?: string;
  status: string;
  error?: string;
}) {
  return (
    <header className="student-header">
      <div>
        <p className="eyebrow">{partName ?? "Choix du groupe"}</p>
        <h1>{name}</h1>
      </div>
      <div className="connection-pill" data-state={status}>
        {status}
      </div>
      {error ? <p className="status-line error">{error}</p> : null}
    </header>
  );
}
