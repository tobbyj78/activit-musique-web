import { FormEvent, useState } from "react";
import { LogIn, Radio } from "lucide-react";

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

  return (
    <main className="landing-shell">
      <section className="landing-panel">
        <div className="brand-mark">
          <Radio size={28} />
          <span>Classe Orchestre</span>
        </div>
        <h1>Pupitre numerique de salle de concert</h1>
        <form onSubmit={submit} className="entry-form">
          <label htmlFor="entry">Nom eleve ou code admin</label>
          <input
            id="entry"
            autoFocus
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            placeholder="Votre nom"
            autoComplete="name"
          />
          <button type="submit" disabled={status === "connecting"}>
            <LogIn size={20} />
            <span>{status === "connecting" ? "Connexion..." : "Entrer"}</span>
          </button>
          <p className="form-help">
            Pour jouer, entrez un prenom. Pour la regie, entrez le mot de passe
            admin.
          </p>
        </form>
        {error ? <p className="status-line error">{error}</p> : null}
      </section>
    </main>
  );
}
