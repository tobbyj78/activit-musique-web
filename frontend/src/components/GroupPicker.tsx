import type {
  NormalizedScore,
  PartPublicRoom,
  StudentPublicSession
} from "@classe-orchestre/shared";

type GroupPickerProps = {
  score: NormalizedScore;
  rooms: PartPublicRoom[];
  students: StudentPublicSession[];
  selectedPartId?: string;
  onJoin(partId: string): void;
};

export function GroupPicker({
  score,
  rooms,
  students,
  selectedPartId,
  onJoin
}: GroupPickerProps) {
  return (
    <section className="group-picker">
      <div className="section-heading">
        <p className="eyebrow">{score.title}</p>
        <h2>Choisissez votre pupitre</h2>
      </div>
      <div className="group-grid">
        {score.parts.map((part) => {
          const room = rooms.find((candidate) => candidate.partId === part.id);
          const count = room?.students.length ?? 0;
          const max = room?.maxSize ?? 4;
          const full = count >= max;
          const studentNames = students
            .filter((student) => room?.students.includes(student.id))
            .map((student) => student.name);

          return (
            <button
              key={part.id}
              className={selectedPartId === part.id ? "group-card is-active" : "group-card"}
              disabled={full && selectedPartId !== part.id}
              onClick={() => onJoin(part.id)}
            >
              <span className="group-title">{part.displayName}</span>
              <span className="group-count">
                {count}/{max}
              </span>
              <span className="group-notes">{part.lanes.length} notes</span>
              <small>{studentNames.join(", ") || "Disponible"}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
