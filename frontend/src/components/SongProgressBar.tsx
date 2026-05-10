import { useEffect, useRef } from "react";

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
  const fillRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!startAtServerMs || !durationMs) return;

    let frame = 0;

    const tick = () => {
      const now = Date.now();
      const serverNow = now + serverTimeOffsetMs;
      const elapsed = Math.max(0, serverNow - startAtServerMs);
      
      const cappedElapsed = Math.min(elapsed, durationMs);
      const ratio = durationMs > 0 ? cappedElapsed / durationMs : 0;

      const elapsedSeconds = Math.floor(cappedElapsed / 1000);
      const totalSeconds = Math.floor(durationMs / 1000);

      if (fillRef.current) {
        fillRef.current.style.width = `${(ratio * 100).toFixed(2)}%`;
      }
      
      if (labelRef.current) {
        labelRef.current.textContent = `${formatMmSs(elapsedSeconds)} / ${formatMmSs(totalSeconds)}`;
      }

      if (cappedElapsed < durationMs) {
        frame = window.requestAnimationFrame(tick);
      } else if (fillRef.current && labelRef.current) {
        fillRef.current.style.width = '100%';
        labelRef.current.textContent = `${formatMmSs(totalSeconds)} / ${formatMmSs(totalSeconds)}`;
      }
    };

    frame = window.requestAnimationFrame(tick);
    
    return () => window.cancelAnimationFrame(frame);
  }, [startAtServerMs, durationMs, serverTimeOffsetMs]);

  return (
    <div className="song-progress" role="progressbar">
      <div className="song-progress-fill" ref={fillRef} style={{ width: '0%' }} />
      <span className="song-progress-label" ref={labelRef}>
        0:00 / {formatMmSs(Math.floor((durationMs || 0) / 1000))}
      </span>
    </div>
  );
}

function formatMmSs(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
