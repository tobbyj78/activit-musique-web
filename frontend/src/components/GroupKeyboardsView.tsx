import { ArrowLeft } from "lucide-react";
import type {
  PartPublicRoom,
  ScorePart,
  StudentPublicSession
} from "@classe-orchestre/shared";
import { MiniKeyboard } from "./MiniKeyboard";

type GroupKeyboardsViewProps = {
  part: ScorePart;
  room: PartPublicRoom;
  students: StudentPublicSession[];
  activeKeysByStudent: Record<string, number[]>;
  muted: boolean;
  onClose(): void;
};

export function GroupKeyboardsView({
  part,
  room,
  students,
  activeKeysByStudent,
  muted,
  onClose
}: GroupKeyboardsViewProps) {
  const members = students.filter((student) =>
    room.students.includes(student.id)
  );

  return (
    <section className="group-drilldown">
      <header>
        <button type="button" className="ghost-button" onClick={onClose}>
          <ArrowLeft size={18} />
          <span>Retour</span>
        </button>
        <h2>
          {part.displayName} {muted ? "(muet)" : ""}
        </h2>
        <span className="muted">{members.length} élèves</span>
      </header>
      <div className="group-drilldown-grid">
        {members.length === 0 ? (
          <p className="muted">Aucun élève dans ce groupe.</p>
        ) : (
          members.map((student) => (
            <div key={student.id} className="member-keyboard">
              <h3>{student.name}</h3>
              <MiniKeyboard
                lanes={part.lanes}
                readOnly
                highlightedMidis={activeKeysByStudent[student.id] ?? []}
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
