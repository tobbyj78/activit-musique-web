import type {
  PartPublicRoom,
  ScorePart
} from "@classe-orchestre/shared";

type GroupPickerProps = {
  parts: ScorePart[];
  rooms: PartPublicRoom[];
  selectedPartId?: string;
  onJoin(partId: string): void;
};

export function GroupPicker({
  parts,
  rooms,
  selectedPartId,
  onJoin
}: GroupPickerProps) {
  return (
    <section className="group-picker">
      <h2>Choisis ton groupe</h2>
      <div className="group-grid">
        {parts.map((part) => {
          const room = rooms.find((candidate) => candidate.partId === part.id);
          const count = room?.students.length ?? 0;
          const max = room?.maxSize ?? 8;
          const full = count >= max;

          return (
            <button
              key={part.id}
              className={
                selectedPartId === part.id ? "group-card is-active" : "group-card"
              }
              disabled={full && selectedPartId !== part.id}
              onClick={() => onJoin(part.id)}
            >
              <span className="group-title">{part.displayName}</span>
              <span className="group-count">
                {count}/{max}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
