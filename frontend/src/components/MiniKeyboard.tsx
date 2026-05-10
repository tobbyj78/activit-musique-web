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
  const pressedMidis = useRef(new Map<number, number>());
  const highlighted = new Set(highlightedMidis ?? []);

  const setMidiPressed = (midi: number, pressed: boolean) => {
    const count = pressedMidis.current.get(midi) || 0;
    const newCount = pressed ? count + 1 : Math.max(0, count - 1);
    
    if (newCount === 0 && count > 0) {
      pressedMidis.current.delete(midi);
      document.querySelector(`.key[data-midi="${midi}"]`)?.classList.remove("is-active");
      onInputUp?.(midi);
    } else if (newCount === 1 && count === 0) {
      pressedMidis.current.set(midi, 1);
      document.querySelector(`.key[data-midi="${midi}"]`)?.classList.add("is-active");
      onInputDown?.(midi);
    } else if (newCount > 0) {
      pressedMidis.current.set(midi, newCount);
    }
  };

  const getMidiFromPoint = (clientX: number, clientY: number): number => {
    const element = document.elementFromPoint(clientX, clientY);
    if (!element) return -1;
    const keyElement = element.closest(".key") as HTMLElement | null;
    if (keyElement && keyElement.dataset.midi) {
      return parseInt(keyElement.dataset.midi, 10);
    }
    return -1;
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (readOnly) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    
    const midi = getMidiFromPoint(event.clientX, event.clientY);
    activePointers.current.set(event.pointerId, midi);
    if (midi >= 0) {
      setMidiPressed(midi, true);
    }
  };

  const handlePointerUpOrCancel = (event: React.PointerEvent) => {
    if (readOnly) return;
    const midi = activePointers.current.get(event.pointerId);
    if (midi !== undefined) {
      if (midi >= 0) {
        setMidiPressed(midi, false);
      }
      activePointers.current.delete(event.pointerId);
    }
  };

  return (
    <section
      className={`keyboard-shell${readOnly ? " is-readonly" : ""}`}
      data-preset={presetKey}
    >
      <div 
        className="keyboard"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
      >
        {lanes.map((lane) => {
          const isHighlighted = highlighted.has(lane.midi);
          const className = [
            "key",
            lane.isBlackKey ? "black-key" : "white-key",
            isHighlighted ? "is-highlighted" : ""
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={lane.midi}
              className={className}
              data-midi={lane.midi}
            ></div>
          );
        })}
      </div>
    </section>
  );
}
