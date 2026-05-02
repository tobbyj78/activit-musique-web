import type { AppStage } from "@classe-orchestre/shared";

type WaitingRoomProps = {
  stage: AppStage;
  partName: string;
  ready: boolean;
  onReady(ready: boolean): void;
};

export function WaitingRoom({ stage, partName, ready, onReady }: WaitingRoomProps) {
  return (
    <section className="waiting-room">
      <p className="eyebrow">{stage}</p>
      <h2>{partName}</h2>
      <button
        className={ready ? "ready-button is-active" : "ready-button"}
        onClick={() => onReady(!ready)}
      >
        {ready ? "Pret" : "Je suis pret"}
      </button>
    </section>
  );
}
