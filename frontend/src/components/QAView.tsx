import { FormEvent, useState } from "react";
import { Check, Send } from "lucide-react";
import type { QAQuestion } from "@classe-orchestre/shared";

type QAViewProps = {
  role: "student" | "admin";
  questions: QAQuestion[];
  onSubmit(text: string): void;
  onMarkAnswered?(questionId: string): void;
};

export function QAView({
  role,
  questions,
  onSubmit,
  onMarkAnswered
}: QAViewProps) {
  const [text, setText] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) {
      return;
    }

    onSubmit(value);
    setText("");
  };

  return (
    <div className="qa-view">
      {role === "student" ? (
        <form onSubmit={submit} className="qa-form">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Votre question"
            maxLength={500}
          />
          <button type="submit">
            <Send size={18} />
            <span>Envoyer</span>
          </button>
        </form>
      ) : null}

      <div className="question-list">
        {questions.length === 0 ? (
          <p className="muted">Aucune question.</p>
        ) : (
          questions.map((question) => (
            <article
              key={question.id}
              className={question.answered ? "question answered" : "question"}
            >
              <div>
                <strong>{role === "admin" ? question.studentName : "Question"}</strong>
                <p>{question.text}</p>
              </div>
              {role === "admin" && !question.answered ? (
                <button onClick={() => onMarkAnswered?.(question.id)}>
                  <Check size={16} />
                  <span>Repondu</span>
                </button>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
