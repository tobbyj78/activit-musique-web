import { useRef } from "react";
import type { PianoLane } from "@classe-orchestre/shared";

type MiniKeyboardProps = {
  lanes: PianoLane[];
  presetKey?: string;
  highlightedMidis?: number[];
  readOnly?: boolean;
  onInputDown?(midi: number): void;
  onInputUp?(midi: number): void;
};

export function MiniKeyboard({
  lanes,
  presetKey,
  highlightedMidis,
  readOnly = false,
  onInputDown,
  onInputUp
}: MiniKeyboardProps) {
  const activePointers = useRef(new Map<number, number>());
  const highlighted = new Set(highlightedMidis ?? []);

  return (
    <section
      className={`keyboard-shell${readOnly ? " is-readonly" : ""}`}
      data-preset={presetKey}
    >
      <div className="keyboard">
        {lanes.map((lane) => {
          const isHighlighted = highlighted.has(lane.midi);
          const className = [
            "key",
            lane.isBlackKey ? "black-key" : "white-key",
            isHighlighted ? "is-highlighted" : ""
          ]
            .filter(Boolean)
            .join(" ");

          if (readOnly) {
            return (
              <div key={lane.midi} className={className}>
                <span>{lane.label}</span>
              </div>
            );
          }

          return (
            <button
              key={lane.midi}
              className={className}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                activePointers.current.set(event.pointerId, lane.midi);
                onInputDown?.(lane.midi);
              }}
              onPointerUp={(event) => {
                event.preventDefault();
                const midi = activePointers.current.get(event.pointerId);
                if (midi !== undefined) {
                  activePointers.current.delete(event.pointerId);
                  onInputUp?.(midi);
                }
              }}
              onPointerCancel={(event) => {
                const midi = activePointers.current.get(event.pointerId);
                if (midi !== undefined) {
                  activePointers.current.delete(event.pointerId);
                  onInputUp?.(midi);
                }
              }}
            >
              <span>{lane.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
