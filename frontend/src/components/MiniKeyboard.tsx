import { useRef } from "react";
import type { PianoLane } from "@classe-orchestre/shared";

type MiniKeyboardProps = {
  lanes: PianoLane[];
  presetKey: string;
  mode: "practice" | "performance";
  onInputDown(midi: number): void;
  onInputUp(midi: number): void;
};

export function MiniKeyboard({
  lanes,
  presetKey,
  mode,
  onInputDown,
  onInputUp
}: MiniKeyboardProps) {
  const activePointers = useRef(new Map<number, number>());

  return (
    <section className="keyboard-shell" data-mode={mode} data-preset={presetKey}>
      <div className="keyboard">
        {lanes.map((lane) => (
          <button
            key={lane.midi}
            className={lane.isBlackKey ? "key black-key" : "key white-key"}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              activePointers.current.set(event.pointerId, lane.midi);
              onInputDown(lane.midi);
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              const midi = activePointers.current.get(event.pointerId);
              if (midi !== undefined) {
                activePointers.current.delete(event.pointerId);
                onInputUp(midi);
              }
            }}
            onPointerCancel={(event) => {
              const midi = activePointers.current.get(event.pointerId);
              if (midi !== undefined) {
                activePointers.current.delete(event.pointerId);
                onInputUp(midi);
              }
            }}
          >
            <span>{lane.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
