# Plan d’implémentation

## Objectif du projet

Créer une application web temps réel pour faire jouer une classe entière sur téléphone.

Le projet part d’un repo vide. Il faut créer toute l’architecture :

```txt
repo/
  package.json
  bun.lock
  tsconfig.base.json
  partitions/
    orchestre.json
    piano_only.json
  shared/
  backend/
  frontend/
```

Utiliser **Bun** avec un **Bun workspace**. Bun supporte les workspaces via la clé `"workspaces"` du `package.json`, et `bun install` installe les dépendances des workspaces. ([Bun][3])

Utiliser :

- **Backend** : Bun + Hono + WebSocket natif Hono.
- **Frontend** : Vite + React + TypeScript. Vite supporte la création d’un projet avec `bun create vite`, et fonctionne bien en projet frontend moderne. ([vitejs][4])
- **Shared** : types TypeScript communs entre frontend et backend.
- **Pas de base de données**.
- **Pas de persistance serveur** : tout est stocké en mémoire.
- **Partitions JSON** lues au démarrage depuis `/partitions`.

---

## Concept fonctionnel

L’application a deux grands cycles, chacun en trois étapes :

```txt
1x1 : essai des instruments piano
1x2 : interprétation du morceau piano
1x3 : questions & réponses

2x1 : essai des instruments orchestre
2x2 : interprétation du morceau orchestre
2x3 : questions & réponses
```

Le premier cycle utilise `piano_only.json`.

Le second cycle utilise `orchestre.json`.

Les élèves arrivent sur le site, entrent leur nom, choisissent un groupe, puis attendent le lancement par l’admin.

L’admin arrive sur le même site mais saisit le mot de passe admin dans le champ d’entrée. Si la valeur saisie correspond à `ADMIN_PASSWORD`, il accède à l’espace administrateur.

---

## Choix temps réel

Ne pas utiliser Socket.IO.

Utiliser une route WebSocket Hono :

```ts
import { Hono } from "hono";
import { upgradeWebSocket, websocket } from "hono/bun";

const app = new Hono();

app.get(
  "/ws",
  upgradeWebSocket((c) => {
    return {
      onOpen(event, ws) {},
      onMessage(event, ws) {},
      onClose(event, ws) {},
      onError(event, ws) {},
    };
  }),
);

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
  websocket,
};
```

La route `/ws` doit être séparée des middlewares qui modifient les headers.

---

## Architecture du repo

Créer cette structure :

```txt
repo/
  package.json
  tsconfig.base.json
  README.md
  partitions/
    orchestre.json
    piano_only.json

  shared/
    package.json
    tsconfig.json
    src/
      index.ts
      protocol.ts
      score.ts
      music.ts

  backend/
    package.json
    tsconfig.json
    src/
      index.ts
      env.ts
      state.ts
      websocket.ts
      partitions/
        loadPartitions.ts
        normalizeScore.ts
      scoring/
        judge.ts
        aggregate.ts
      utils/
        ids.ts
        safeJson.ts

  frontend/
    package.json
    tsconfig.json
    vite.config.ts
    index.html
    public/
      webaudiofont/
        WebAudioFontPlayer.js
        instruments/
          0000_GeneralUserGS_sf2_file.js
          0400_GeneralUserGS_sf2_file.js
          0730_GeneralUserGS_sf2_file.js
          etc...
    src/
      main.tsx
      App.tsx
      styles/
        global.css
      realtime/
        socket.ts
        useRealtime.ts
      audio/
        AudioEngine.ts
        instrumentPresets.ts
      music/
        noteMath.ts
      pages/
        LandingPage.tsx
        StudentPage.tsx
        AdminPage.tsx
      components/
        GroupPicker.tsx
        MiniKeyboard.tsx
        NoteHighway.tsx
        WaitingRoom.tsx
        ScorePanel.tsx
        QAView.tsx
```

Root `package.json` attendu :

```json
{
  "name": "classe-orchestre",
  "private": true,
  "workspaces": ["backend", "frontend", "shared"],
  "scripts": {
    "dev:backend": "bun --cwd backend run dev",
    "dev:frontend": "bun --cwd frontend run dev",
    "dev": "bun run dev:backend & bun run dev:frontend",
    "build": "bun --cwd frontend run build",
    "check": "bun --cwd shared run check && bun --cwd backend run check && bun --cwd frontend run check"
  }
}
```

---

## Modèle de données partagé

Dans `shared/src/score.ts`, définir un format normalisé unique pour les deux JSON.

Les deux fichiers source n’ont pas exactement la même forme :

`orchestre.json` ressemble à :

```json
{
  "Flute": {
    "difficulty": "medium",
    "note_count": 12,
    "notes": [
      {
        "note": "D6",
        "timestamp_ms": 10670,
        "duration_ms": 102,
        "velocity": 0.65
      }
    ]
  }
}
```

`piano_only.json` ressemble plutôt à :

```json
{
  "instruments": {
    "groupe_1": {
      "note_count": 82,
      "notes": [
        {
          "note": "D5",
          "timestamp_ms": 0,
          "duration_ms": 229,
          "velocity": 0.5
        }
      ]
    }
  }
}
```

Créer un format normalisé :

```ts
export type ScoreId = "piano_only" | "orchestre";

export type NormalizedScore = {
  id: ScoreId;
  title: string;
  parts: ScorePart[];
  durationMs: number;
};

export type ScorePart = {
  id: string;
  displayName: string;
  sourceName: string;
  soundPresetKey: string;
  difficulty?: string;
  noteCount: number;
  notes: ScheduledNote[];
  range: {
    minMidi: number;
    maxMidi: number;
    uniqueMidis: number[];
  };
  lanes: PianoLane[];
};

export type ScheduledNote = {
  id: string;
  partId: string;
  note: string;
  midi: number;
  timestampMs: number;
  durationMs: number;
  velocity: number;
  laneIndex: number;
};

export type PianoLane = {
  midi: number;
  label: string;
  isBlackKey: boolean;
};
```

Créer aussi `shared/src/music.ts` avec :

```ts
export function noteNameToMidi(note: string): number;
export function midiToNoteName(midi: number): string;
export function isBlackMidi(midi: number): boolean;
```

Convention MIDI : `C4 = 60`.

Exemples :

```txt
D5 -> 74
D6 -> 86
G6 -> 91
D2 -> 38
```

---

## Normalisation des partitions

Dans `backend/src/partitions/normalizeScore.ts` :

### Pour `piano_only.json`

- Lire `json.instruments`.
- Chaque clé `groupe_1`, `groupe_2`, etc. devient une `ScorePart`.
- `displayName` : transformer `groupe_1` en `Groupe 1`.
- `soundPresetKey` : `"piano"`.
- Calculer `midi`, `range`, `lanes`.
- Générer un `id` stable pour chaque note :
  `piano_only:groupe_1:0`, `piano_only:groupe_1:1`, etc.

### Pour `orchestre.json`

- Lire directement les clés racine : `Flute`, `Violin`, etc.
- Chaque instrument devient une `ScorePart`.
- `displayName` : nom de l’instrument.
- `soundPresetKey` : mapping depuis le nom de l’instrument.
- Générer un `id` stable :
  `orchestre:Flute:0`, `orchestre:Flute:1`, etc.

### Mini-piano

Pour chaque groupe ou instrument :

1. Calculer toutes les notes MIDI utilisées.
2. Trier les notes uniques.
3. Créer les lanes à partir de ces notes uniques.

Par défaut, sur téléphone, ne pas afficher un clavier chromatique complet si ça rend l’interface trop large. Utiliser les notes réellement présentes dans la partie.

Option :

```ts
const USE_ONLY_NOTES_PRESENT_IN_PART = true;
```

---

## Mapping WebAudioFont

Créer `frontend/src/audio/instrumentPresets.ts`.

Objectif : mapper les `soundPresetKey` vers les fichiers et variables WebAudioFont.

Exemples confirmés :

```ts
export type InstrumentPreset = {
  key: string;
  label: string;
  file: string;
  variableName: string;
};

export const INSTRUMENT_PRESETS: Record<string, InstrumentPreset> = {
  piano: {
    key: "piano",
    label: "Piano",
    file: "/webaudiofont/instruments/0000_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0000_GeneralUserGS_sf2_file",
  },

  violin: {
    key: "violin",
    label: "Violon",
    file: "/webaudiofont/instruments/0400_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0400_GeneralUserGS_sf2_file",
  },

  flute: {
    key: "flute",
    label: "Flûte",
    file: "/webaudiofont/instruments/0730_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0730_GeneralUserGS_sf2_file",
  },

  trumpet: {
    key: "trumpet",
    label: "Trompette",
    file: "/webaudiofont/instruments/0560_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0560_GeneralUserGS_sf2_file",
  },
};
```

Ajouter ensuite selon les instruments présents dans `orchestre.json`.

Mappings probables à prévoir :

```ts
const SOURCE_NAME_TO_PRESET_KEY: Record<string, string> = {
  Piano: "piano",
  "Acoustic Grand Piano": "piano",

  Flute: "flute",
  Violin: "violin",
  Viola: "viola",
  Cello: "cello",
  Contrabass: "contrabass",

  Trumpet: "trumpet",
  Trombone: "trombone",
  "French Horn": "frenchHorn",

  Oboe: "oboe",
  Clarinet: "clarinet",
  Bassoon: "bassoon",
};
```

Le catalogue WebAudioFont liste notamment les familles piano, cordes, cuivres, anches et flûtes, avec plusieurs variantes par instrument. Pour les instruments non encore ajoutés, vérifier le fichier `.html` du catalogue, copier le nom du fichier `.js` et le nom exact de la variable globale. ([Surikov][5])

Important : pour une salle de classe, ne pas dépendre d’Internet pendant la séance. Copier localement les fichiers WebAudioFont nécessaires dans `frontend/public/webaudiofont/instruments/`.

---

## AudioEngine frontend

Créer `frontend/src/audio/AudioEngine.ts`.

Responsabilités :

- Initialiser `AudioContext` uniquement après une action utilisateur, car les navigateurs mobiles bloquent souvent l’audio tant qu’il n’y a pas eu de geste utilisateur.
- Charger `WebAudioFontPlayer.js`.
- Charger dynamiquement les presets instrumentaux.
- Jouer une note immédiatement en mode essai.
- Programmer une note à un instant précis en mode interprétation.

API attendue :

```ts
export class AudioEngine {
  async unlock(): Promise<void>;

  async preloadPreset(presetKey: string): Promise<void>;

  async playNow(args: {
    presetKey: string;
    midi: number;
    durationMs: number;
    velocity: number;
  }): Promise<void>;

  async schedule(args: {
    presetKey: string;
    midi: number;
    durationMs: number;
    velocity: number;
    playAtServerMs: number;
    serverTimeOffsetMs: number;
  }): Promise<void>;
}
```

Pour `schedule`, convertir le temps serveur vers le temps `AudioContext` :

```ts
const estimatedServerNow = Date.now() + serverTimeOffsetMs;
const delaySeconds = Math.max(0, (playAtServerMs - estimatedServerNow) / 1000);
const when = audioContext.currentTime + delaySeconds;
```

Puis appeler :

```ts
player.queueWaveTable(
  audioContext,
  audioContext.destination,
  preset,
  when,
  midi,
  durationMs / 1000,
  velocity,
);
```

---

## Backend : état mémoire

Créer `backend/src/state.ts`.

```ts
export type AppStage =
  | "lobby"
  | "piano_practice"
  | "piano_performance"
  | "piano_qa"
  | "orchestra_practice"
  | "orchestra_performance"
  | "orchestra_qa";

export type PerformanceStatus =
  | "idle"
  | "countdown"
  | "running"
  | "stopped"
  | "finished";

export type StudentSession = {
  connectionId: string;
  sessionToken: string;
  name: string;
  partId?: string;
  joinedAt: number;
  lastSeenAt: number;
  ready: boolean;
  isSpeaker: boolean;
};

export type PartRoom = {
  partId: string;
  students: string[];
  maxSize: number;
};

export type RuntimeState = {
  stage: AppStage;
  performanceStatus: PerformanceStatus;
  currentScoreId?: ScoreId;
  startAtServerMs?: number;

  students: Map<string, StudentSession>;
  connections: Map<string, ServerConnection>;
  parts: Map<string, PartRoom>;

  scores: Record<ScoreId, NormalizedScore>;

  inputs: InputEventRecord[];
  judgements: Map<string, NoteJudgement>;
  groupScores: Map<string, GroupScore>;
};
```

Les groupes sont limités à 4 élèves :

```ts
const GROUP_SIZE = 4;
```

Si un groupe est plein, l’élève ne peut plus le rejoindre, sauf si l’admin active une option `allowOverflow`.

---

## Protocole WebSocket

Créer `shared/src/protocol.ts`.

Tous les messages doivent avoir :

```ts
type BaseMessage = {
  type: string;
  requestId?: string;
};
```

### Client vers serveur

```ts
export type ClientMessage =
  | {
      type: "hello";
      role: "student";
      name: string;
      sessionToken?: string;
    }
  | {
      type: "hello";
      role: "admin";
      password: string;
    }
  | {
      type: "join_part";
      partId: string;
    }
  | {
      type: "leave_part";
    }
  | {
      type: "ready";
      ready: boolean;
    }
  | {
      type: "clock_ping";
      clientSentAtMs: number;
    }
  | {
      type: "input_down";
      eventId: string;
      note: string;
      midi: number;
      clientEventAtMs: number;
      estimatedServerEventAtMs: number;
    }
  | {
      type: "input_up";
      eventId: string;
      note: string;
      midi: number;
      clientEventAtMs: number;
      estimatedServerEventAtMs: number;
    }
  | {
      type: "admin_set_stage";
      stage: AppStage;
    }
  | {
      type: "admin_start_performance";
      scoreId: ScoreId;
      startDelayMs: number;
      audioMode: "local_immediate" | "server_aggregated";
    }
  | {
      type: "admin_stop";
    }
  | {
      type: "qa_submit_question";
      text: string;
    }
  | {
      type: "admin_mark_question_answered";
      questionId: string;
    };
```

### Serveur vers client

```ts
export type ServerMessage =
  | {
      type: "welcome";
      connectionId: string;
      role: "student" | "admin";
      state: PublicState;
      serverNowMs: number;
    }
  | {
      type: "state";
      state: PublicState;
      serverNowMs: number;
    }
  | {
      type: "clock_pong";
      clientSentAtMs: number;
      serverReceivedAtMs: number;
      serverSentAtMs: number;
    }
  | {
      type: "performance_start";
      scoreId: ScoreId;
      startAtServerMs: number;
      audioMode: "local_immediate" | "server_aggregated";
    }
  | {
      type: "group_play_note";
      partId: string;
      noteId: string;
      midi: number;
      presetKey: string;
      durationMs: number;
      velocity: number;
      playAtServerMs: number;
    }
  | {
      type: "note_judgement";
      judgement: NoteJudgement;
    }
  | {
      type: "score_update";
      groupScores: GroupScore[];
      globalScore: number;
    }
  | {
      type: "error";
      message: string;
    };
```

Valider les messages avec `zod` ou une validation manuelle stricte.

---

## Synchronisation temporelle

Créer un petit mécanisme de clock sync côté frontend.

Toutes les 2 secondes :

1. Le client envoie `clock_ping` avec `clientSentAtMs = Date.now()`.
2. Le serveur répond avec :
   - `clientSentAtMs`
   - `serverReceivedAtMs`
   - `serverSentAtMs`

3. Le client estime l’offset serveur :

```ts
const clientReceivedAtMs = Date.now();
const roundTripMs = clientReceivedAtMs - clientSentAtMs;
const estimatedServerAtClientReceive = serverSentAtMs + roundTripMs / 2;

const offsetMs = estimatedServerAtClientReceive - clientReceivedAtMs;
```

Garder les 5 meilleurs pings, choisir celui avec le plus petit RTT.

Utiliser `serverTimeOffsetMs` pour :

- afficher les notes qui tombent au bon moment ;
- horodater les inputs ;
- programmer les sons WebAudioFont.

---

## Algorithme de jeu et de scoring

### Idée centrale

Pour chaque groupe de 4 élèves :

1. Chaque élève joue la même partie.
2. Pour chaque note prévue, le serveur évalue la qualité de chaque élève.
3. Le score du groupe est la **moyenne** des scores des élèves du groupe.
4. Le morceau global est la **somme des groupes**.

### Jugement individuel d’une note

Créer `backend/src/scoring/judge.ts`.

Pour chaque note attendue :

```ts
type IndividualNoteScore = {
  studentId: string;
  noteId: string;
  timingErrorMs: number;
  durationErrorMs: number;
  timingScore: number;
  holdScore: number;
  totalScore: number;
  label: "perfect" | "good" | "late" | "early" | "miss";
};
```

Paramètres :

```ts
const PERFECT_WINDOW_MS = 60;
const GOOD_WINDOW_MS = 120;
const MISS_WINDOW_MS = 220;
const MIN_HOLD_NOTE_MS = 250;
```

Calcul :

```ts
const absTiming = Math.abs(timingErrorMs);

let timingScore = 0;

if (absTiming <= PERFECT_WINDOW_MS) {
  timingScore = 1;
} else if (absTiming <= GOOD_WINDOW_MS) {
  timingScore = 0.75;
} else if (absTiming <= MISS_WINDOW_MS) {
  timingScore = 0.35;
} else {
  timingScore = 0;
}
```

Pour la durée :

```ts
const expectedDuration = note.durationMs;
const actualDuration = inputUpAtMs - inputDownAtMs;

let holdScore = 1;

if (expectedDuration >= MIN_HOLD_NOTE_MS) {
  const tolerance = Math.max(120, expectedDuration * 0.35);
  holdScore = Math.max(
    0,
    1 - Math.abs(actualDuration - expectedDuration) / tolerance,
  );
}
```

Score total :

```ts
const totalScore = timingScore * 0.75 + holdScore * 0.25;
```

Si l’élève joue la mauvaise note, score `0`.

Si l’élève ne joue pas la note, score `0`.

### Score de groupe

Créer `backend/src/scoring/aggregate.ts`.

```ts
const groupNoteScore =
  sum(individualScoresForThisNote) / activeStudentsInGroup.length;
```

Si le groupe a moins de 4 élèves, diviser par le nombre d’élèves actifs, mais afficher un avertissement côté admin : `Groupe incomplet`.

### Volume de groupe

Pour une note donnée :

```ts
const groupVelocity = note.velocity * groupNoteScore;
```

Ensuite, si tous les téléphones du groupe jouent le son, diviser le volume par le nombre d’élèves actifs pour éviter qu’un groupe de 4 soit quatre fois plus fort :

```ts
const perPhoneVelocity =
  groupVelocity / Math.max(1, activeStudentsInGroup.length);
```

Donc :

```txt
note finale du groupe = moyenne des élèves
son global = somme physique des sons des groupes
```

### Deux modes audio

Implémenter deux modes.

#### Mode 1 : `local_immediate`

Mode simple, utile pour le MVP.

- Quand l’élève appuie, son téléphone joue immédiatement la note.
- Le serveur calcule les scores.
- Le rendu sonore réel dépend directement des gestes des élèves.
- Avantage : très réactif.
- Inconvénient : ce n’est pas encore une vraie moyenne sonore serveur.

#### Mode 2 : `server_aggregated`

Mode cible.

- Les élèves appuient au bon moment.
- Le serveur attend une petite fenêtre de jugement.
- Le serveur calcule la moyenne du groupe.
- Le serveur envoie `group_play_note`.
- Les téléphones du groupe programment la note avec un volume correspondant à la moyenne.

Paramètres :

```ts
const JUDGE_DELAY_MS = 140;
const OUTPUT_DELAY_MS = 220;
```

Pour une note prévue à `T` :

```txt
T = moment où l’élève doit appuyer
T + JUDGE_DELAY_MS = moment où le serveur calcule la moyenne
T + OUTPUT_DELAY_MS = moment où les téléphones jouent le son agrégé
```

Le son aura donc un léger délai contrôlé, mais il permettra d’obtenir réellement :

```txt
groupe = moyenne des joueurs
classe = somme des groupes
```

---

## Backend : fonctionnement WebSocket

Créer `backend/src/websocket.ts`.

### À la connexion

- Créer un `connectionId`.
- Attendre un message `hello`.
- Si `role = student`, créer ou restaurer une session en mémoire.
- Si `role = admin`, vérifier `ADMIN_PASSWORD`.
- Envoyer `welcome`.
- Broadcast `state`.

### À la déconnexion

- Ne pas supprimer immédiatement l’élève.
- Marquer `lastSeenAt`.
- Après 30 secondes sans reconnexion, le retirer du groupe.
- Cela permet aux téléphones de récupérer après un refresh ou une micro-coupure réseau.

### Broadcast

Créer des helpers :

```ts
broadcastToAll(message);
broadcastToAdmins(message);
broadcastToStudents(message);
broadcastToPart(partId, message);
sendToConnection(connectionId, message);
```

---

## Frontend : pages

### `LandingPage`

Un seul champ :

```txt
Nom ou mot de passe admin
```

Si la valeur correspond au mot de passe admin, le serveur répond avec `role: "admin"`.

Sinon, le serveur crée une session élève.

UI :

- champ texte ;
- bouton “Entrer” ;
- message “Touchez pour activer le son” après connexion.

### `StudentPage`

États :

1. Choix du groupe.
2. Salle d’attente.
3. Essai des instruments.
4. Interprétation.
5. Questions & réponses.

### `AdminPage`

Fonctions :

- voir les élèves connectés ;
- voir les groupes et leur remplissage `0/4`, `1/4`, etc. ;
- déplacer un élève d’un groupe à un autre ;
- choisir l’étape ;
- lancer `piano_practice` ;
- lancer `piano_performance` ;
- lancer `piano_qa` ;
- lancer `orchestra_practice` ;
- lancer `orchestra_performance` ;
- lancer `orchestra_qa` ;
- stop/reset ;
- voir les scores individuels, par groupe et global ;
- voir les questions posées.

---

## Frontend : mini clavier

Créer `MiniKeyboard.tsx`.

Props :

```ts
type MiniKeyboardProps = {
  lanes: PianoLane[];
  presetKey: string;
  mode: "practice" | "performance";
  onInputDown(midi: number): void;
  onInputUp(midi: number): void;
};
```

Comportement :

- gros boutons adaptés au tactile ;
- utiliser `pointerdown`, `pointerup`, `pointercancel` ;
- empêcher le scroll pendant le jeu ;
- afficher le nom des notes ;
- en mode practice, jouer directement la note via `AudioEngine.playNow`.

---

## Frontend : notes qui tombent

Créer `NoteHighway.tsx`.

Objectif : interface type Piano Tiles.

Props :

```ts
type NoteHighwayProps = {
  part: ScorePart;
  startAtServerMs: number;
  serverTimeOffsetMs: number;
  leadTimeMs: number;
};
```

Calcul :

```ts
const serverNow = Date.now() + serverTimeOffsetMs;
const elapsedMs = serverNow - startAtServerMs;
```

Pour chaque note :

```ts
const timeUntilHit = note.timestampMs - elapsedMs;
```

Afficher seulement les notes dont :

```ts
timeUntilHit > -500 && timeUntilHit < leadTimeMs;
```

Position verticale :

```ts
const progress = 1 - timeUntilHit / leadTimeMs;
const y = progress * highwayHeight;
```

La ligne de frappe est en bas de l’écran. La note atteint cette ligne quand `timeUntilHit = 0`.

Pour une note longue, la hauteur visuelle dépend de `durationMs`.

---

## Design frontend

Appliquer le lien design fourni : interface expressive, pas générique. Le document insiste sur une direction esthétique claire, une typographie travaillée, des couleurs cohérentes, de la motion et une vraie identité visuelle, plutôt qu’une interface générique. ([GitHub][6])

Direction proposée :

```txt
“Pupitre numérique de salle de concert”
```

Style :

- fond sombre, ambiance scène ;
- lignes de notes lumineuses ;
- boutons très gros pour mobile ;
- contraste élevé ;
- feedback visuel immédiat ;
- admin plus sobre, type régie de concert ;
- élève plus immersif, type jeu musical.

Ne pas utiliser une esthétique SaaS générique.

---

## Questions & réponses

Créer un écran simple.

Côté élève :

- champ texte ;
- bouton envoyer ;
- liste des questions de la classe, éventuellement anonymisées.

Côté admin :

- liste des questions ;
- bouton “marquer comme répondu” ;
- bouton “effacer toutes les questions”.

Stockage en mémoire :

```ts
type QAQuestion = {
  id: string;
  studentName: string;
  text: string;
  createdAt: number;
  answered: boolean;
};
```

---

## Variables d’environnement backend

Créer `backend/.env.example` :

```env
PORT=3000
ADMIN_PASSWORD=admin123
GROUP_SIZE=4
```

Dans `env.ts` :

```ts
export const env = {
  port: Number(process.env.PORT ?? 3000),
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin123",
  groupSize: Number(process.env.GROUP_SIZE ?? 4),
};
```

---

## Vite config frontend

Créer `frontend/vite.config.ts`.

Objectifs :

- lancer le frontend sur `0.0.0.0` pour que les téléphones du réseau local puissent se connecter ;
- proxy `/api` vers le backend ;
- proxy `/ws` vers le backend avec support WebSocket.

Exemple :

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
});
```

---

## API HTTP minimale

Même si le temps réel passe par WebSocket, ajouter quelques routes HTTP :

```txt
GET /api/health
GET /api/scores
GET /api/partitions
GET /api/state
```

`/api/partitions` renvoie les partitions normalisées sans toutes les notes si c’est trop lourd, ou avec les notes si nécessaire pour le frontend.

---

## Gestion des partitions côté frontend

Le frontend doit recevoir :

- les partitions normalisées ;
- les groupes disponibles ;
- la partie choisie par l’élève ;
- les notes de cette partie.

Quand l’élève rejoint `groupe_1`, il reçoit seulement les données utiles pour `groupe_1`, pas forcément tout le morceau.

Pour l’admin, afficher toutes les parties.

---

## Critères d’acceptation MVP

Le MVP est terminé quand :

1. Le repo démarre avec :

```bash
bun install
bun run dev
```

2. L’admin peut entrer avec le mot de passe.
3. Un élève peut entrer avec son nom.
4. Les élèves peuvent choisir un groupe.
5. Les groupes sont limités à 4 élèves.
6. L’admin peut lancer `piano_practice`.
7. En practice, chaque élève a un mini-clavier correspondant aux notes de son groupe.
8. Le son piano fonctionne avec WebAudioFont.
9. L’admin peut lancer `piano_performance`.
10. Les notes tombent au bon moment.
11. Les élèves peuvent appuyer sur les notes.
12. Le serveur reçoit les inputs.
13. Le serveur calcule un score individuel.
14. Le serveur calcule une moyenne par groupe.
15. L’admin voit les scores.
16. L’admin peut lancer le cycle orchestre.
17. Les sons d’instruments fonctionnent au moins pour piano, flûte, violon et trompette.
18. L’étape Q&R fonctionne.

---

## Critères d’acceptation version cible

La version cible est terminée quand :

1. Le mode `server_aggregated` fonctionne.
2. Pour chaque note d’un groupe, le serveur calcule la moyenne des élèves.
3. Le volume joué par le groupe dépend de cette moyenne.
4. Les téléphones du groupe jouent avec un volume divisé par le nombre d’élèves actifs.
5. La somme physique des groupes produit le morceau complet.
6. L’admin peut choisir entre :
   - `local_immediate`
   - `server_aggregated`

7. L’admin voit :
   - score global ;
   - score par groupe ;
   - score par élève ;
   - élèves absents ou déconnectés ;
   - groupes incomplets.

---

## Ordre d’implémentation recommandé

### Étape 1 — Bootstrap repo

Créer le workspace Bun, les trois packages `shared`, `backend`, `frontend`.

Installer :

Backend :

```bash
bun add hono zod
```

Frontend :

```bash
bun add react react-dom
bun add -d vite typescript @vitejs/plugin-react
```

Shared :

```bash
bun add zod
```

### Étape 2 — Types partagés

Créer :

```txt
shared/src/protocol.ts
shared/src/score.ts
shared/src/music.ts
shared/src/index.ts
```

### Étape 3 — Chargement des partitions

Créer côté backend :

```txt
loadPartitions.ts
normalizeScore.ts
```

Vérifier que les deux fichiers JSON sont bien convertis en `NormalizedScore`.

Ajouter des logs au démarrage :

```txt
Loaded piano_only: 8 parts, 640 notes, duration 92000ms
Loaded orchestre: 12 parts, 1400 notes, duration 124000ms
```

### Étape 4 — Backend Hono + WebSocket

Créer :

```txt
index.ts
websocket.ts
state.ts
```

Implémenter :

- connexion admin ;
- connexion élève ;
- broadcast state ;
- join group ;
- ready ;
- start/stop stage.

### Étape 5 — Frontend connexion

Créer :

```txt
LandingPage
useRealtime
socket.ts
StudentPage
AdminPage
```

À ce stade, l’admin doit voir les élèves en direct.

### Étape 6 — Groupes

Créer `GroupPicker`.

L’élève doit voir :

```txt
Groupe 1 — 2/4
Groupe 2 — 4/4 complet
Flute — 1/4
Violin — 3/4
```

### Étape 7 — Audio

Créer :

```txt
AudioEngine.ts
instrumentPresets.ts
```

Ajouter WebAudioFont localement.

Tester :

- bouton “tester le son” ;
- piano ;
- flûte ;
- violon ;
- trompette.

### Étape 8 — Mode practice

Créer `MiniKeyboard`.

L’admin lance `piano_practice`.

Chaque élève voit le mini-clavier de son groupe et peut tester les sons.

Ensuite, même chose pour `orchestra_practice`.

### Étape 9 — Notes qui tombent

Créer `NoteHighway`.

L’admin lance `piano_performance`.

Les élèves voient les notes tomber selon `timestamp_ms`.

### Étape 10 — Inputs et scoring

Envoyer `input_down` et `input_up`.

Côté backend :

- matcher l’input avec la note attendue ;
- calculer timing ;
- calculer durée ;
- calculer score ;
- renvoyer jugement ;
- mettre à jour score admin.

### Étape 11 — Agrégation groupe

Implémenter :

```txt
score groupe = moyenne des élèves
score global = somme ou moyenne pondérée des groupes
```

Afficher sur admin.

### Étape 12 — Mode audio agrégé serveur

Implémenter `server_aggregated`.

Pour chaque note :

- collecter inputs ;
- attendre `JUDGE_DELAY_MS` ;
- calculer moyenne ;
- envoyer `group_play_note` ;
- jouer sur les téléphones du groupe.

### Étape 13 — Q&R

Ajouter les écrans Q&R.

### Étape 14 — Robustesse mobile

Ajouter :

- bouton “activer le son” ;
- Wake Lock si disponible ;
- message si WebSocket perdu ;
- reconnexion automatique ;
- conservation du nom en `localStorage` ;
- conservation du `sessionToken` en `localStorage`.

---

## Points techniques importants

### Reconnexion

Le frontend garde :

```ts
localStorage.setItem("sessionToken", token);
localStorage.setItem("studentName", name);
```

En cas de refresh, il renvoie le token.

Le serveur peut restaurer la session tant qu’elle existe en mémoire.

### Téléphones sur réseau local

Le frontend doit être accessible avec l’IP locale de l’ordinateur admin :

```txt
http://192.168.x.x:5173
```

Ajouter dans l’admin une zone “Adresse à donner aux élèves”.

Option bonus : générer un QR code.

### Sécurité

Ce projet est local et pédagogique.

Le mot de passe admin peut rester simple, mais il doit être dans `.env`, pas hardcodé dans le frontend.

Ne jamais envoyer `ADMIN_PASSWORD` côté client.

### Performances

Pour les notes qui tombent :

- utiliser `requestAnimationFrame`;
- ne rendre que les notes visibles ;
- éviter de recalculer toute la partition à chaque frame ;
- utiliser `useMemo` pour les notes par lane.

### Volume

Le volume WebAudioFont doit être limité :

```ts
const safeVelocity = Math.min(0.8, Math.max(0, velocity));
```

En mode groupe :

```ts
const safeGroupVelocity = Math.min(
  0.7,
  (note.velocity * groupScore) / activeStudents,
);
```

---

## Résultat attendu

À la fin, on doit avoir une application où :

- l’admin contrôle les phases ;
- les élèves choisissent leur groupe ;
- chaque groupe a un mini-piano adapté à ses notes ;
- le piano seul fonctionne ;
- l’orchestre fonctionne avec des sons différents ;
- les notes tombent façon Piano Tiles ;
- les élèves jouent au bon moment et avec la bonne durée ;
- le serveur calcule les scores ;
- les groupes de 4 sont moyennés ;
- le morceau global correspond à la somme sonore des groupes ;
- aucune base de données n’est utilisée ;
- tout disparaît quand le serveur redémarre, ce qui est voulu.

[1]: https://hono.dev/docs/helpers/websocket "WebSocket Helper - Hono"
[2]: https://surikov.github.io/webaudiofont/ "WebAudioFont | webaudiofont"
[3]: https://bun.sh/docs/install/workspaces "Workspaces - Bun"
[4]: https://vite.dev/guide/ "Getting Started | Vite"
[5]: https://surikov.github.io/webaudiofontdata/sound/ "surikov.github.io"
[6]: https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md "claude-code/plugins/frontend-design/skills/frontend-design/SKILL.md at main · anthropics/claude-code · GitHub"
