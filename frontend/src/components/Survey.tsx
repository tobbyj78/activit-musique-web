import { useEffect, useState } from "react";
import { SURVEY_QUESTIONS } from "@classe-orchestre/shared";

type SurveyProps = {
  onSubmit(questionId: string, answerId: string): void;
};

export function Survey({ onSubmit }: SurveyProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSubmitting(false);
  }, [currentIndex]);

  if (currentIndex >= SURVEY_QUESTIONS.length) {
    return (
      <section className="survey done">
        <h2>Merci !</h2>
        <p>En attente de l'administrateur…</p>
      </section>
    );
  }

  const question = SURVEY_QUESTIONS[currentIndex];

  const handleChoose = (answerId: string) => {
    if (submitting) return;
    setSubmitting(true);
    onSubmit(question.id, answerId);
    window.setTimeout(() => {
      setCurrentIndex((index) => index + 1);
    }, 250);
  };

  return (
    <section className="survey">
      <p className="survey-progress">
        Question {currentIndex + 1} / {SURVEY_QUESTIONS.length}
      </p>
      <h2>{question.label}</h2>
      <div className="survey-answers">
        {question.answers.map((answer) => (
          <button
            key={answer.id}
            type="button"
            className="survey-answer"
            disabled={submitting}
            onClick={() => handleChoose(answer.id)}
          >
            {answer.label}
          </button>
        ))}
      </div>
    </section>
  );
}
