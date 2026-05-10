import { useEffect, useMemo, useState } from "react";
import type { ScorePart } from "@classe-orchestre/shared";

type NoteHighwayProps = {
  part: ScorePart;
  startAtServerMs: number;
  serverTimeOffsetMs: number;
  leadTimeMs: number;
};

const HIT_LINE_PERCENT = 50;

export function NoteHighway({
  part,
  startAtServerMs,
  serverTimeOffsetMs,
  leadTimeMs
}: NoteHighwayProps) {
  const [nowMs, setNowMs] = useState(Date.now());
  const laneCount = Math.max(1, part.lanes.length);
  const laneWidth = 100 / laneCount;

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setNowMs(Date.now());
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const visibleNotes = useMemo(() => {
    const serverNow = nowMs + serverTimeOffsetMs;
    const elapsedMs = serverNow - startAtServerMs;

    return part.notes
      .filter((note) => !note.autoPlay)
      .map((note) => ({
        note,
        timeUntilHit: note.timestampMs - elapsedMs
      }))
      .filter(
        ({ timeUntilHit }) => timeUntilHit > -500 && timeUntilHit < leadTimeMs
      );
  }, [leadTimeMs, nowMs, part.notes, serverTimeOffsetMs, startAtServerMs]);

  return (
    <section className="note-highway" aria-label="Notes a jouer">
      <div className="lane-labels">
        {part.lanes.map((lane) => (
          <span key={lane.midi}></span>
        ))}
      </div>
      <div className="highway-board">
        {part.lanes.map((lane, index) => (
          <div
            key={lane.midi}
            className="lane"
            style={{
              left: `${index * laneWidth}%`,
              width: `${laneWidth}%`
            }}
          />
        ))}
        {visibleNotes.map(({ note, timeUntilHit }) => {
          const progress = 1 - timeUntilHit / leadTimeMs;
          const height = Math.min(
            22,
            Math.max(3.5, (note.durationMs / leadTimeMs) * HIT_LINE_PERCENT)
          );
          const bottomY = progress * HIT_LINE_PERCENT;
          const y = Math.min(104, Math.max(-height, bottomY - height));

          return (
            <div
              key={note.id}
              className="falling-note"
              style={{
                left: `${note.laneIndex * laneWidth + laneWidth * 0.14}%`,
                width: `${laneWidth * 0.72}%`,
                top: `${y}%`,
                height: `${height}%`
              }}
            >
            </div>
          );
        })}
        <div className="hit-line" />
      </div>
    </section>
  );
}
