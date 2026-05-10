# CLAUDE.md

Guidance pour Claude Code travaillant sur ce repo.

---

## ⚡ À lire en priorité

### Framework d'algorithmes d'agrégation (phase 4 actuellement, phase 8 à venir)

**Le serveur joue les notes via un timer pré-schedulé, pas en réaction directe aux touches élèves.** En phase 4 (piano), 4 algos sélectionnables par l'admin déterminent comment le jeu collectif d'un groupe se traduit en son. Le pattern est extensible (ex: nouveaux algos pour phase 8 orchestre).

**Mécanique commune** (`backend/src/websocket.ts:scheduleAggregatedPlayback`) :
- Au démarrage de la phase de performance, un `setTimeout` est armé pour **chaque note de chaque groupe** à `T = startAtServerMs + note.timestampMs + JUDGE_DELAY_MS (140ms)`.
- Au tick : on appelle `countCorrectPressers(state, partId, note, expectedAtServerMs)` (`backend/src/scoring/aggregate.ts`) qui compte le nombre d'élèves du groupe ayant pressé le bon MIDI dans la fenêtre `±MISS_WINDOW_MS (220ms)` autour de `expectedAtServerMs`.
- Selon l'algo (et `count` / `groupSize`), le serveur décide : silence, ou `broadcastToAdmins({ type: "group_play_note", playAtServerMs: expectedAtServerMs + OUTPUT_DELAY_MS, velocity, ... })`.
- L'admin schedule l'audio via `AudioEngine.schedule()` à l'instant exact.

**Constantes clés** (toutes dans `websocket.ts`) :
- `JUDGE_DELAY_MS = 140` — quand le tick fire, après le moment attendu.
- `OUTPUT_DELAY_MS = 220` — quand le son sort, après le moment attendu (donc 80ms après le tick).
- `MISS_WINDOW_MS = 220` — demi-fenêtre pour qu'un input compte comme "à temps".
- `note.velocity` plafonnée à 0.95 (`baseVelocity = Math.min(0.95, note.velocity)`).

**Algos actuels phase 4** (state.aggregationAlgorithm) :
| ID | Comportement (timer agrégé) |
|---|---|
| `democratic` (défaut) | `count ≥ 1` → vélocité partition. Sinon silence. |
| `majority` | `count ≥ ceil(groupSize/2)` → vélocité partition. Sinon silence. |
| `doublure` | Joue **toujours** : `velocity = min(baseVelocity, 0.4 + 0.15 × count)`. ⚠️ Quasi-imperceptible si élèves jouent ou pas (count=0 → 80% du volume plein). C'est par design "ordinateur joue, élèves renforcent". |
| `direct` | **Pas de timer**. Chaque `input_down` d'élève → `group_play_note` immédiat à vélocité 1.0, durée 700ms. Mode solo (1 joueur/groupe). |

**Feedback live phase 4** (`handleInputDown`) : pour `democratic`/`majority`/`doublure`, chaque pression d'élève (juste ou fausse) déclenche aussi un `group_play_note` discret (`FEEDBACK_PLAY_DURATION_MS = 300`, `FEEDBACK_PLAY_VELOCITY = 0.25`) en plus de l'algo agrégé. Sans ça, presser une mauvaise note = silence total → l'élève a l'impression que son téléphone est cassé. `direct` garde son broadcast à vol 1.0 / 700ms (pas besoin de feedback en plus).

**Phase 8 actuelle** : utilise `mode: "always"` (paramètre de `scheduleAggregatedPlayback`) — toutes les notes d'`orchestre.json` sont broadcastées avec leur vélocité pleine, indépendamment des inputs. Les inputs élèves sont quand même jugés par `judgeNote()` pour l'affichage des scores.

### Recette : ajouter un algo (ou un setting d'algo pour phase 8)

1. **`shared/src/protocol.ts`** : étendre `aggregationAlgorithmSchema` (z.enum). Pour un setting séparé phase 8, créer un nouveau schéma + un nouveau message client (ex: `admin_set_orchestra_algorithm`) + un nouveau champ dans `PublicState`.
2. **`backend/src/state.ts`** : ajouter le champ dans `RuntimeState`, l'initialiser dans `createRuntimeState`, l'inclure dans `publicRuntimeState`. **Ne pas le reset** dans `resetRuntimeState` (le choix admin persiste).
3. **`backend/src/websocket.ts`** : handler `admin_set_*` (avec `withAdmin`, idéalement gated sur `state.phase === "phase1_lobby"`). Branche dans `scheduleAggregatedPlayback` (mode "voted" actuellement, à généraliser). Si l'algo doit changer le comportement de `handleInputDown` (cas `direct`), le brancher aussi là.
4. **`frontend/src/pages/AdminPage.tsx`** : étendre `Phase1View` avec un sélecteur, comme `ALGORITHM_OPTIONS` existant.
5. **`frontend/src/styles/global.css`** : styles `.phase1-algo*`.

### Tester avec `scripts/load-piano.ts`

```bash
bun scripts/load-piano.ts --players=12 --jitter-ms=45 --api http://localhost:3000
```

Le script connecte N bots, les distribue dans les 4 groupes piano, lance la performance, et joue les notes correctement (avec jitter aléatoire). **Pas de variante orchestre actuellement** — à écrire (`scripts/load-orchestra.ts`) si on veut tester phase 8 en charge.

⚠️ **Important** : si tu testes les bots contre un serveur **distant**, la sync d'horloge dérive et `serverDownAtMs` peut tomber hors de la fenêtre ±220ms → `count` retourne 0 → algos democratic/majority silencieux. **Toujours tester les bots en local sur la même machine que le serveur.** En prod (élèves sur Wi-Fi local), la latence est négligeable et ça marche.

### Lock connexions

En dehors de phase 1, le serveur refuse les nouveaux `hello` (rôle student) sans `sessionToken` valide (`websocket.ts:handleHello`). Reconnexions par sessionToken : grâce 30s.

---

## Commandes

```bash
bun install            # workspace
bun run dev            # backend (3000) + frontend (5173)
bun run dev:backend
bun run dev:frontend
bun run build          # frontend prod
bun run check          # tsc sur les 3 packages
```

`backend/.env.example` → `backend/.env`. Mot de passe admin par défaut : `admin123`. Pas de tests automatisés.

⚠️ **Le dev tourne sur un serveur distant, pas sur cette machine.** L'install Node locale est cassée (`libllhttp.9.3.dylib` manquant) → `bun run check` / `bunx tsc` ne tournent pas ici, et `bun run dev` non plus. C'est attendu, ce n'est pas un signal qu'il faut "réparer" l'environnement. Pour valider, l'utilisateur teste visuellement sur le serveur — n'essaie pas de lancer le frontend/backend en local. Vérifie tes changements en relisant le code.

## Architecture

Monorepo Bun workspace, 3 packages :

- **`shared/`** — types TS (`@classe-orchestre/shared`) : `score.ts`, `protocol.ts` (messages WS + zod + `PublicState`), `music.ts` (note↔MIDI), `survey.ts` (7 questions).
- **`backend/`** — Bun + Hono. État en mémoire (pas de DB). Port 3000.
- **`frontend/`** — Vite + React + TS. Port 5173, proxy `/ws` et `/api` vers backend. Écoute `0.0.0.0` (accès LAN).

## Pas de responsive

- **Élèves** : téléphone uniquement (~375-430px, `100dvh`).
- **Admin** : écran fixe **1430×800px** (`.admin-shell` en dur).

## Flux 9 phases

L'app fonctionne en **9 phases linéaires strictes** (`shared/src/protocol.ts:appPhaseSchema`). L'admin ne peut qu'avancer (`admin_advance_phase`) ou reset (`admin_reset`). Pas de retour arrière. `admin_advance_phase` depuis phase 9 = reset complet.

| Phase | Élève | Admin |
|---|---|---|
| `phase1_lobby` | saisie prénom + attente | QR jaffrain.xyz, info hotspot, sélecteur algo, "Commencer" |
| `phase2_groups` | `GroupPicker` (4 groupes piano) | "Continuer", 4 carrés + non-assignés |
| `phase3_practice` | `MiniKeyboard` libre | "Continuer", 4 carrés + mute, drilldown claviers |
| `phase4_performance` | `NoteHighway` + `MiniKeyboard` | `SongProgressBar`, scores |
| `phase5_survey` | `Survey` (7 questions auto-avance) | résultats agrégés |
| `phase6_orchestra_groups` | `GroupPicker` (12 groupes orchestre) | grille 4×3 + non-assignés |
| `phase7_orchestra_practice` | `MiniKeyboard` libre | grille 4×3 + mute, drilldown |
| `phase8_orchestra_performance` | `NoteHighway` + `MiniKeyboard` | `SongProgressBar`, scores |
| `phase9_orchestra_survey` | `Survey` | résultats agrégés |

Ajout d'une phase : étendre `appPhaseSchema`, mapper le score dans `scoreIdForPhase()` si nécessaire, étendre `advancePhase()` dans `websocket.ts`, ajouter une vue dans `AdminPage.tsx` et `StudentPage.tsx`. Les helpers `isPracticePhase`/`isPerformancePhase`/`isGroupPickPhase`/`isSurveyPhase` aident à généraliser.

`HoldResetButton` (rouge, hold 3s) en bas-droite des phases 2-9 envoie `admin_reset`.

## Sortie audio admin uniquement

En phases 3, 4, 7 et 8, **les téléphones élèves ne produisent pas de son**. Les keypress remontent au backend qui broadcaste `group_play_note` **uniquement aux admins** (`broadcastToAdmins`). Le navigateur admin joue via `AudioEngine.schedule()`. Overlay "Cliquer pour activer l'audio" gate l'`AudioContext` lors du premier rendu admin. `AudioContext` jamais créé côté élève.

### Phases 3 et 7 — son live
`input_down` → `group_play_note` `source: "live"`, `now + 30ms`, durée 15000ms (`LIVE_PLAY_DURATION_MS`), vélocité 0.7. Skip si muted. `state.activeKeysByStudent` mis à jour à chaque down/up et broadcasté (coalescing 30ms).

### Phases 4 et 8 — voir section "Framework d'algorithmes" en haut.

## Reset

`admin_reset` :
1. Pour chaque student : envoie `error { message: "__RESET__" }` (sentinel) puis ferme la WS. Le frontend (`useRealtime`) intercepte, vide `localStorage` (studentName + sessionToken), désactive la reconnexion auto.
2. `resetRuntimeState(state)` vide tout (students, parts, scores, mute, surveyAnswers, timers). **Préserve `aggregationAlgorithm`** (et tout futur setting persistant).
3. Broadcast nouveau state.

## Partitions

Deux fichiers dans `partitions/` :
- `piano_only.json` — 4 groupes, 145 notes, 30s
- `orchestre.json` — 12 instruments, 872 notes, 35s (Flute, Hautbois, Clarinette, Basson, Cor, Trompette, Trombone, Tuba, ViolonI, ViolonII, Alto, Violoncelle)

Lecture : `backend/src/partitions/loadPartitions.ts` → normalisation `normalizeScore.ts` → `NormalizedScore`. `ScoreId = "piano_only" | "orchestre"`.

- IDs de note : `scoreId:sourceName:index` (ex: `piano_only:groupe_1:0`).
- `partId` préfixé : `scoreId:sourceName` (évite les collisions piano↔orchestre).
- Lanes du clavier : **chromatiques** entre `minMidi` et `maxMidi` du groupe (`buildChromaticLanes`).
- `SOURCE_NAME_TO_PRESET_KEY` dans `normalizeScore.ts` mappe noms d'instruments → clés de presets audio.

## Audio engine

`frontend/src/audio/AudioEngine.ts` charge `WebAudioFontPlayer.js` puis les `.js` de presets WebAudioFont. 13 presets :
- **Piano** : `0000_FluidR3_GM_sf2_file.js` (~1.2MB).
- **12 orchestre** : GeneralUserGS pour Flute (0400), Hautbois (0410), Clarinette (0420), Basson (0430), Cor (0470), Trompette (0560), Trombone (0602), Tuba (0680), ViolonI (0700), ViolonII (0710 + deep-clone via `copyKey`), Alto (0710), Violoncelle (0730).

Plafond vélocité 0.95. Fallback synthé triangle si preset pas chargé. `App.tsx` précharge piano dès l'admin entre, et les 12 orchestre quand phase 6/7/8.

## Synchronisation temporelle

`clock_ping`/`clock_pong` toutes les 2s. `serverTimeOffsetMs` (lissage EMA 0.8) sert à :
1. horodater les inputs (`estimatedServerEventAtMs`) → utilisé par `countCorrectPressers` côté serveur.
2. positionner les notes dans `NoteHighway`.
3. scheduler les sons admin via `AudioEngine.schedule()`.
4. avancement morceau (`SongProgressBar`).

## Composants frontend clés

- `pages/AdminPage.tsx` — switch sur `state.phase` → `Phase1View`, `GroupsView` (2/6), `PracticeView` (3/7), `PracticeDrillView`, `PerformanceView` (4/8), `SurveyView` (5/9). Grille 4×3 pour orchestre. State local `drillPartId`.
- `pages/StudentPage.tsx` — switch sur `state.phase` (9 sous-vues via `activeScoreIdForPhase`). Pas d'audio local.
- `components/MiniKeyboard.tsx` — `highlightedMidis?`, `readOnly?` pour drilldown admin.
- `components/HoldResetButton.tsx` — anneau SVG progressif 3s.
- `components/Survey.tsx` — `currentIndex` auto-incrémenté.
- `components/QrCode.tsx` — `qrcode.react` v4, pointe `https://jaffrain.xyz`.
- `components/SongProgressBar.tsx` — rAF, `serverTimeOffsetMs`.
- `components/GroupKeyboardsView.tsx` — N `MiniKeyboard` read-only avec `highlightedMidis` de `state.activeKeysByStudent`.
- `components/NoteHighway.tsx` — hit line à 84%, leadTime 3000ms.

## Modifier l'app — recettes courtes

- **Nouveau message WS** : zod dans `shared/src/protocol.ts` → handler dans `backend/src/websocket.ts` → réception dans `frontend/src/realtime/useRealtime.ts`.
- **Scoring par-élève** : `backend/src/scoring/judge.ts` (timing + hold).
- **Questions sondage** : `shared/src/survey.ts` (un seul endroit, mêmes 7 questions phases 5 et 9).
- **Nouvel instrument orchestre** : entrée dans `instrumentPresets.ts` + `.js` dans `frontend/public/webaudiofont/instruments/` + entrée dans `SOURCE_NAME_TO_PRESET_KEY`.
