import { FormEvent, useState } from "react";
import { LogIn, Music } from "lucide-react";

type LandingPageProps = {
  status: string;
  error?: string;
  onEnter(entry: string): void | Promise<void>;
};

export function LandingPage({ status, error, onEnter }: LandingPageProps) {
  const [entry, setEntry] = useState(
    () => window.localStorage.getItem("studentName") ?? ""
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = entry.trim();
    if (!value) {
      return;
    }
    await onEnter(value);
  };

  const partyInProgress = error?.includes("partie est en cours");

  return (
    <main className="landing-shell">
      <section className="landing-panel">
        <div className="brand-mark">
          <Music size={28} />
          <span>Classe Orchestre</span>
        </div>
        {partyInProgress ? (
          <div className="party-locked">
            <h1>Une partie est en cours</h1>
            <p>
              Les nouveaux participants ne peuvent rejoindre qu'au début d'une
              session. Attends que l'administrateur revienne à l'accueil.
            </p>
          </div>
        ) : (
          <>
            <h1>Entre ton prénom</h1>
            <form onSubmit={submit} className="entry-form">
              <input
                id="entry"
                autoFocus
                value={entry}
                onChange={(event) => setEntry(event.target.value)}
                placeholder="Ton prénom"
                autoComplete="given-name"
              />
              <button type="submit" disabled={status === "connecting" || !entry.trim()}>
                <LogIn size={20} />
                <span>{status === "connecting" ? "Connexion…" : "Entrer"}</span>
              </button>
            </form>
            {error ? <p className="status-line error">{error}</p> : null}
          </>
        )}
      </section>
    </main>
  );
}
