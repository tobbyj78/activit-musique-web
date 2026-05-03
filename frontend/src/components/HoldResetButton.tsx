import { useEffect, useRef, useState } from "react";

type HoldResetButtonProps = {
  durationMs?: number;
  onConfirm(): void;
};

export function HoldResetButton({
  durationMs = 3000,
  onConfirm
}: HoldResetButtonProps) {
  const [progress, setProgress] = useState(0);
  const startedAtRef = useRef<number | undefined>();
  const frameRef = useRef<number | undefined>();

  const stop = () => {
    if (frameRef.current !== undefined) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }
    startedAtRef.current = undefined;
    setProgress(0);
  };

  useEffect(() => stop, []);

  const tick = () => {
    if (startedAtRef.current === undefined) return;
    const elapsed = Date.now() - startedAtRef.current;
    const ratio = Math.min(1, elapsed / durationMs);
    setProgress(ratio);
    if (ratio >= 1) {
      stop();
      onConfirm();
      return;
    }
    frameRef.current = window.requestAnimationFrame(tick);
  };

  const start = () => {
    startedAtRef.current = Date.now();
    frameRef.current = window.requestAnimationFrame(tick);
  };

  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <button
      type="button"
      className="hold-reset"
      title="Maintenir 3 secondes pour reset"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      <svg viewBox="0 0 60 60" width="56" height="56" className="hold-ring">
        <circle
          cx="30"
          cy="30"
          r={radius}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="3"
          fill="none"
        />
        <circle
          cx="30"
          cy="30"
          r={radius}
          stroke="#fff"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 30 30)"
        />
      </svg>
      <span>RESET</span>
    </button>
  );
}
