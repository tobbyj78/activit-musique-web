import { Check, Play, Square, Users } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  AppStage,
  AudioMode,
  ClientMessage,
  PublicState,
  ScoreId
} from "@classe-orchestre/shared";
import { QAView } from "../components/QAView";
import { ScorePanel } from "../components/ScorePanel";

type AdminPageProps = {
  state: PublicState;
  status: string;
  error?: string;
  send(message: ClientMessage): void;
};

const STAGES: Array<{ stage: AppStage; label: string }> = [
  { stage: "lobby", label: "Accueil" },
  { stage: "piano_practice", label: "1x1 Piano essai" },
  { stage: "piano_performance", label: "1x2 Piano morceau" },
  { stage: "piano_qa", label: "1x3 Piano Q&R" },
  { stage: "orchestra_practice", label: "2x1 Orchestre essai" },
  { stage: "orchestra_performance", label: "2x2 Orchestre morceau" },
  { stage: "orchestra_qa", label: "2x3 Orchestre Q&R" }
];

export function AdminPage({ state, status, error, send }: AdminPageProps) {
  const [audioMode, setAudioMode] = useState<AudioMode>("local_immediate");
  const [scoreId, setScoreId] = useState<ScoreId>(state.currentScoreId ?? "piano_only");
  const currentParts = useMemo(
    () => state.parts.filter((part) => part.scoreId === scoreId),
    [state.parts, scoreId]
  );
  const address = `${window.location.protocol}//${window.location.host}`;

  const startPerformance = (id: ScoreId) => {
    setScoreId(id);
    send({
      type: "admin_start_performance",
      scoreId: id,
      startDelayMs: 3000,
      audioMode
    });
  };

  return (
    <main className="app-shell admin-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Regie</p>
          <h1>Classe Orchestre</h1>
        </div>
        <div className="connection-pill" data-state={status}>
          {status}
        </div>
      </header>

      {error ? <p className="status-line error">{error}</p> : null}

      <section className="admin-grid">
        <div className="panel control-panel">
          <h2>Phases</h2>
          <div className="stage-grid">
            {STAGES.map((item) => (
              <button
                key={item.stage}
                className={state.stage === item.stage ? "is-active" : ""}
                onClick={() =>
                  send({
                    type: "admin_set_stage",
                    stage: item.stage
                  })
                }
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="segmented">
            <button
              className={audioMode === "local_immediate" ? "is-active" : ""}
              onClick={() => setAudioMode("local_immediate")}
            >
              Local direct
            </button>
            <button
              className={audioMode === "server_aggregated" ? "is-active" : ""}
              onClick={() => setAudioMode("server_aggregated")}
            >
              Moyenne serveur
            </button>
          </div>

          <div className="command-row">
            <button onClick={() => startPerformance("piano_only")}>
              <Play size={18} />
              <span>Piano</span>
            </button>
            <button onClick={() => startPerformance("orchestre")}>
              <Play size={18} />
              <span>Orchestre</span>
            </button>
            <button
              className="danger"
              onClick={() =>
                send({
                  type: "admin_stop"
                })
              }
            >
              <Square size={18} />
              <span>Stop</span>
            </button>
          </div>

          <label className="toggle-line">
            <input
              type="checkbox"
              checked={state.allowOverflow}
              onChange={(event) =>
                send({
                  type: "admin_set_overflow",
                  allowOverflow: event.target.checked
                })
              }
            />
            Autoriser les groupes au-dela de {state.groupSize}
          </label>
        </div>

        <div className="panel">
          <h2>Adresse eleves</h2>
          <p className="network-address">{address}</p>
          <p className="muted">Backend: port 3000. Frontend: port 5173.</p>
        </div>

        <div className="panel students-panel">
          <h2>
            <Users size={20} />
            Eleves connectes
          </h2>
          <div className="student-list">
            {state.students.length === 0 ? (
              <p className="muted">Aucun eleve connecte.</p>
            ) : (
              state.students.map((student) => (
                <div key={student.id} className="student-row">
                  <span className={student.online ? "dot online" : "dot"} />
                  <strong>{student.name}</strong>
                  <span className="muted">{student.ready ? "pret" : "attente"}</span>
                  <select
                    value={student.partId ?? ""}
                    onChange={(event) =>
                      event.target.value &&
                      send({
                        type: "admin_assign_student",
                        studentId: student.id,
                        partId: event.target.value
                      })
                    }
                  >
                    <option value="">Sans groupe</option>
                    {state.parts.map((part) => (
                      <option key={part.partId} value={part.partId}>
                        {part.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel groups-panel">
          <div className="panel-title-row">
            <h2>Groupes</h2>
            <div className="segmented compact">
              <button
                className={scoreId === "piano_only" ? "is-active" : ""}
                onClick={() => setScoreId("piano_only")}
              >
                Piano
              </button>
              <button
                className={scoreId === "orchestre" ? "is-active" : ""}
                onClick={() => setScoreId("orchestre")}
              >
                Orchestre
              </button>
            </div>
          </div>
          <div className="room-grid">
            {currentParts.map((part) => {
              const students = state.students.filter((student) =>
                state.parts
                  .find((room) => room.partId === part.partId)
                  ?.students.includes(student.id)
              );
              return (
                <div key={part.partId} className="room-tile">
                  <strong>{part.displayName}</strong>
                  <span>
                    {students.length}/{part.maxSize}
                  </span>
                  <small>{students.map((student) => student.name).join(", ")}</small>
                </div>
              );
            })}
          </div>
        </div>

        <ScorePanel
          groupScores={state.groupScores}
          globalScore={state.globalScore}
        />

        <div className="panel qa-panel">
          <div className="panel-title-row">
            <h2>Questions</h2>
            <button
              className="small-button"
              onClick={() =>
                send({
                  type: "admin_clear_questions"
                })
              }
            >
              Effacer
            </button>
          </div>
          <QAView
            role="admin"
            questions={state.questions}
            onSubmit={() => undefined}
            onMarkAnswered={(questionId) =>
              send({
                type: "admin_mark_question_answered",
                questionId
              })
            }
          />
        </div>
      </section>

      <footer className="admin-footer">
        <span>{state.performanceStatus}</span>
        <span>{state.currentScoreId}</span>
        <span>
          <Check size={16} />
          {state.students.filter((student) => student.ready).length} prets
        </span>
      </footer>
    </main>
  );
}
