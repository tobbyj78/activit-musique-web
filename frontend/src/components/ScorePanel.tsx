import type { GroupScore } from "@classe-orchestre/shared";

type ScorePanelProps = {
  groupScores: GroupScore[];
  globalScore: number;
};

export function ScorePanel({ groupScores, globalScore }: ScorePanelProps) {
  return (
    <div className="panel score-panel">
      <div className="score-total">
        <span>Score global</span>
        <strong>{Math.round(globalScore * 100)}%</strong>
      </div>
      <div className="score-list">
        {groupScores.length === 0 ? (
          <p className="muted">Aucun score pour le moment.</p>
        ) : (
          groupScores.map((group) => (
            <div key={group.partId} className="score-row">
              <div>
                <strong>{group.displayName}</strong>
                <small>
                  {group.activeStudents} eleves - {group.judgedNotes}/
                  {Math.max(1, group.expectedNotes * Math.max(1, group.activeStudents))}
                </small>
              </div>
              <span>{Math.round(group.score * 100)}%</span>
              {group.incomplete ? <em>Groupe incomplet</em> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
