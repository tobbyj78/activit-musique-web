import { ArrowRight, Play } from "lucide-react";
import type { AppPhase } from "@classe-orchestre/shared";

type PhaseAdvanceButtonProps = {
  phase: AppPhase;
  onAdvance(): void;
  disabled?: boolean;
  size?: "default" | "huge";
};

export function PhaseAdvanceButton({
  phase,
  onAdvance,
  disabled,
  size = "default"
}: PhaseAdvanceButtonProps) {
  return (
    <button
      type="button"
      className={`phase-advance phase-advance-${size}`}
      onClick={onAdvance}
      disabled={disabled}
    >
      {phase === "phase1_lobby" ? <Play size={28} /> : <ArrowRight size={28} />}
      <span>{labelFor(phase)}</span>
    </button>
  );
}

function labelFor(phase: AppPhase): string {
  switch (phase) {
    case "phase1_lobby":
      return "Commencer";
    case "phase5_survey":
      return "Terminer";
    default:
      return "Continuer";
  }
}
