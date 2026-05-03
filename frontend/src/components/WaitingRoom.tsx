type WaitingRoomProps = {
  title: string;
  subtitle?: string;
};

export function WaitingRoom({ title, subtitle }: WaitingRoomProps) {
  return (
    <section className="waiting-room">
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </section>
  );
}
