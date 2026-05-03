export type SurveyAnswer = { id: string; label: string };
export type SurveyQuestion = { id: string; label: string; answers: SurveyAnswer[] };

export const SURVEY_QUESTIONS: readonly SurveyQuestion[] = [
  {
    id: "tempo",
    label: "Quel est le tempo de cette chanson ?",
    answers: [
      { id: "lent", label: "Lent" },
      { id: "modere", label: "Modéré" },
      { id: "rapide", label: "Rapide" }
    ]
  },
  {
    id: "emotion",
    label: "Quelle est l'émotion dominante que vous avez ressentie ?",
    answers: [
      { id: "joie", label: "Joie" },
      { id: "tristesse", label: "Tristesse" },
      { id: "colere", label: "Colère" },
      { id: "serenite", label: "Sérénité" },
      { id: "stress", label: "Stress" }
    ]
  },
  {
    id: "conduite",
    label: "Si vous étiez au volant, comment conduiriez-vous avec ce son ?",
    answers: [
      { id: "tranquille", label: "Tranquille" },
      { id: "nerveux", label: "Nerveux" },
      { id: "distrait", label: "Distrait" }
    ]
  },
  {
    id: "revisions",
    label: "Pourriez-vous réviser un examen avec cette musique en fond ?",
    answers: [
      { id: "oui", label: "Oui, ça m'aide" },
      { id: "non", label: "Non, impossible de me concentrer" }
    ]
  },
  {
    id: "sport",
    label: "Si vous faisiez du sport, ce morceau vous aiderait-il à tenir plus longtemps ?",
    answers: [
      { id: "oui", label: "Grave, ça me motive" },
      { id: "non", label: "Pas du tout, ça me coupe mon rythme" }
    ]
  },
  {
    id: "souvenir",
    label: "Quel souvenir vous vient à l'esprit en écoutant cela ?",
    answers: [
      { id: "fete", label: "Une fête" },
      { id: "film", label: "Un film" },
      { id: "personne", label: "Une personne" }
    ]
  },
  {
    id: "tache",
    label: "Si vous deviez faire une tâche répétitive (ménage, rangement), ce morceau vous rendrait-il plus efficace ?",
    answers: [
      { id: "oui", label: "Oui" },
      { id: "non", label: "Non" }
    ]
  }
];

export type SurveyResults = Record<string, Record<string, number>>;
