import { useEffect, useState } from "react";

type SongProgressBarProps = {
  startAtServerMs: number;
  durationMs: number;
  serverTimeOffsetMs: number;
};

export function SongProgressBar({
  startAtServerMs,
  durationMs,
  serverTimeOffsetMs
}: SongProgressBarProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setNow(Date.now());
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const serverNow = now + serverTimeOffsetMs;
  const elapsed = Math.max(0, serverNow - startAtServerMs);
  const ratio = durationMs > 0 ? Math.min(1, elapsed / durationMs) : 0;

  const elapsedSeconds = Math.floor(elapsed / 1000);
  const totalSeconds = Math.floor(durationMs / 1000);

  return (
    <div className="song-progress" role="progressbar" aria-valuenow={ratio * 100}>
      <div
        className="song-progress-fill"
        style={{ width: `${(ratio * 100).toFixed(2)}%` }}
      />
      <span className="song-progress-label">
        {formatMmSs(elapsedSeconds)} / {formatMmSs(totalSeconds)}
      </span>
    </div>
  );
}

function formatMmSs(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
