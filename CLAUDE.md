# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commandes

```bash
bun install          # installer toutes les dépendances (workspace)
bun run dev          # backend (3000) + frontend (5173) en parallèle
bun run dev:backend  # backend seul
bun run dev:frontend # frontend seul
bun run build        # build production du frontend
bun run check        # vérification TypeScript sur les 3 packages
```

Pas de tests automatisés. Variables d'environnement backend : copier `backend/.env.example` → `backend/.env`. Mot de passe admin par défaut : `admin123`.

## Pas de responsive

- **Élèves** : téléphone uniquement (CSS conçu pour ~375-430px de large, `100dvh`).
- **Admin** : écran fixe **1430×800px** (le shell `.admin-shell` est en dur à ces dimensions).

## Architecture

Monorepo Bun workspace en 3 packages :

- **`shared/`** — types TS partagés (`@classe-orchestre/shared`). Contient `score.ts`, `protocol.ts` (messages WS + zod), `music.ts` (note↔MIDI), `survey.ts` (7 questions du sondage).
- **`backend/`** — Bun + Hono. État en mémoire (pas de DB). Port 3000.
- **`frontend/`** — Vite + React + TS. Port 5173, proxy `/ws` et `/api` vers le backend.

## Flux 9 phases

L'app fonctionne en **9 phases linéaires strictes** (`shared/src/protocol.ts:appPhaseSchema`). L'admin ne peut qu'avancer (`admin_advance_phase`) ou reset (`admin_reset`). Pas de retour arrière.

| Phase | Élève | Admin |
|---|---|---|
| `phase1_lobby` | saisie prénom + attente | QR jaffrain.xyz + info hotspot Wi-Fi, bouton "Commencer", count |
| `phase2_groups` | `GroupPicker` (4 groupes piano) | "Continuer", 4 carrés groupes, rectangle non-assignés |
| `phase3_practice` | `MiniKeyboard` libre (pas de son local) | "Continuer", 4 carrés + mute toggle, drilldown vue claviers |
| `phase4_performance` | `NoteHighway` + `MiniKeyboard` (pas de son local) | "Continuer", `SongProgressBar`, 4 carrés + scores |
| `phase5_survey` | `Survey` (7 questions auto-avance) | "Continuer", 7 lignes de résultats agrégés |
| `phase6_orchestra_groups` | `GroupPicker` (12 groupes orchestre) | "Continuer", grille 4×3 groupes, rectangle non-assignés |
| `phase7_orchestra_practice` | `MiniKeyboard` libre (pas de son local) | "Continuer", grille 4×3 + mute toggle, drilldown vue claviers |
| `phase8_orchestra_performance` | `NoteHighway` + `MiniKeyboard` (pas de son local) | "Continuer", `SongProgressBar`, grille 4×3 + scores |
| `phase9_orchestra_survey` | `Survey` (7 questions auto-avance) | "Continuer", 7 lignes de résultats agrégés |

`admin_advance_phase` depuis phase 9 = retour en phase 1 (= reset complet). Le bouton **`HoldResetButton`** rouge (hold 3s) est visible en bas-droite des phases 2-9 et envoie `admin_reset`.

## Lock connexions

En dehors de phase 1, le serveur refuse les nouveaux `hello` (rôle student) sans `sessionToken` valide (`backend/src/websocket.ts:handleHello`). Les reconnexions par sessionToken (grâce 30s) sont toujours autorisées.

## Sortie audio admin uniquement

En phases 3, 4, 7 et 8, **les téléphones élèves ne produisent pas de son**. Les keypress remontent au backend, qui broadcaste `group_play_note` **uniquement aux connexions admin** (`broadcastToAdmins`). Le navigateur admin joue le son via `AudioEngine.schedule()`. Une overlay "Cliquer pour activer l'audio" gate l'`AudioContext` lors du premier rendu admin.

### Phases 3 et 7 — son live
Chaque `input_down` produit un `group_play_note` `source: "live"` programmé à `now + 30ms`, durée 700ms, vélocité 0.7. Skipped si `mutedGroups.has(partId)`. `state.activeKeysByStudent` est mis à jour à chaque down/up et broadcast (coalescing 30ms via `broadcastStateSoon`).

### Phase 4 — son agrégé (piano voté)
Le serveur programme un timer pour chaque note attendue à `T + JUDGE_DELAY_MS (140ms)`. Au tick : il compte le nombre d'élèves du groupe ayant pressé le bon MIDI dans la fenêtre `±MISS_WINDOW_MS (220ms)` autour de `expectedAtServerMs`, puis applique la formule **count→velocity** : 1=30%, 2=70%, 3=90%, 4+=100% (multiplié par `note.velocity`). Voir `backend/src/scoring/aggregate.ts:countCorrectPressers` et `websocket.ts:scheduleAggregatedPlayback`.

Le scoring par-élève (timing+hold dans `scoring/judge.ts`) est indépendant et inchangé.

### Phase 8 — son automatique (orchestre joué par l'ordinateur)
Le serveur utilise `mode: "always"` dans `scheduleAggregatedPlayback` : toutes les notes d'`orchestre.json` sont broadcastées aux admins avec leur vélocité pleine, indépendamment des touches pressées par les élèves. Les inputs élèves passent quand même par `judgeNote()` pour l'affichage des scores.

## Reset

`admin_reset` :
1. Pour chaque connexion student : envoie un message `error` avec `message: "__RESET__"` (sentinel) puis ferme la WS. Le frontend (`useRealtime`) intercepte ce sentinel, vide `localStorage` (studentName + sessionToken), et désactive la reconnexion automatique → l'élève voit la `LandingPage` vierge.
2. `resetRuntimeState(state)` vide tout (students, parts, scores, mute, surveyAnswers, timers).
3. Broadcast d'un nouveau state.

## Partitions

Deux fichiers dans `partitions/` :
- `piano_only.json` — 4 groupes, 145 notes, 30s
- `orchestre.json` — 12 instruments (Flute, Hautbois, Clarinette, Basson, Cor, Trompette, Trombone, Tuba, ViolonI, ViolonII, Alto, Violoncelle)

Lus au démarrage par `backend/src/partitions/loadPartitions.ts` puis normalisés via `normalizeScore.ts` en `NormalizedScore`. Le type `ScoreId = "piano_only" | "orchestre"`.

IDs de note : `scoreId:sourceName:index` (ex: `piano_only:groupe_1:0`, `orchestre:Flute:42`). **Les lanes sont chromatiques** entre `minMidi` et `maxMidi` du groupe — voir `buildChromaticLanes`.

Les `partId` sont préfixés par `scoreId:sourceName` (ex: `piano_only:groupe_1`, `orchestre:Flute`) pour éviter les collisions entre les phases piano et orchestre.

`SOURCE_NAME_TO_PRESET_KEY` dans `normalizeScore.ts` mappe les noms d'instruments vers les clés de presets audio.

## Audio engine

`AudioEngine` (frontend) charge `WebAudioFontPlayer.js` puis les fichiers `.js` de presets WebAudioFont. 13 presets au total :
- **Piano** : `0000_FluidR3_GM_sf2_file.js` (~1.2MB, acoustic grand piano multi-échantillonné)
- **12 orchestre** : fichiers GeneralUserGS pour Flute (0400), Hautbois (0410), Clarinette (0420), Basson (0430), Cor (0470), Trompette (0560), Trombone (0602), Tuba (0680), ViolonI (0700), ViolonII (0710 avec deep-clone via `copyKey`), Alto (0710), Violoncelle (0730)

`ORCHESTRA_PRESET_KEYS` exporte les 12 clés orchestre. Plafond de vélocité = 0.95. Fallback synthé triangle si le preset n'est pas chargé.

`App.tsx` précharge le preset piano dès que l'admin entre, puis précharge les 12 presets orchestre quand la phase passe en 6/7/8.

L'`AudioContext` n'est jamais créé côté élève (`App.tsx` gate `unlockAudio` sur `role === "admin"`).

## Composants frontend clés

- `pages/LandingPage.tsx` — saisie prénom/admin pwd. Si erreur "partie en cours", bloque l'input.
- `pages/AdminPage.tsx` — switch sur `state.phase` → vues généralisées : `GroupsView` (phases 2/6), `PracticeView` (phases 3/7), `PracticeDrillView` (drilldown 3/7), `PerformanceView` (phases 4/8), `SurveyView` (phases 5/9). Phase 1 affiche QR code + info hotspot Wi-Fi. Grille 4×3 pour les 12 instruments en phases 6/7/8. State local `drillPartId` pour la vue détaillée.
- `pages/StudentPage.tsx` — switch sur `state.phase` (9 sous-vues via `activeScoreIdForPhase`, pas de jeu d'audio local).
- `components/MiniKeyboard.tsx` — props `highlightedMidis?` (vue admin drilldown), `readOnly?` (idem).
- `components/HoldResetButton.tsx` — anneau SVG progressif sur 3s, fire `onConfirm` à 100%, annule sur pointer-up précoce.
- `components/Survey.tsx` — état local `currentIndex` qui s'auto-incrémente après chaque réponse. Utilisé en phases 5 et 9.
- `components/QrCode.tsx` — wrapper `qrcode.react` (dépendance v4). Pointe vers `https://jaffrain.xyz`.
- `components/SongProgressBar.tsx` — rAF, lit `serverTimeOffsetMs` pour calcul d'avancement.
- `components/GroupKeyboardsView.tsx` — N `MiniKeyboard` read-only côte-à-côte avec `highlightedMidis` de `state.activeKeysByStudent`.
- `components/NoteHighway.tsx` — inchangé. Hit line à 84%, leadTime 3000ms.

## Synchronisation temporelle

Inchangée. `clock_ping`/`clock_pong` toutes les 2s. `serverTimeOffsetMs` est utilisé pour :
1. horodater les inputs (`estimatedServerEventAtMs`)
2. positionner les notes dans `NoteHighway`
3. programmer les sons admin via `AudioEngine.schedule()`
4. afficher la progression du morceau (`SongProgressBar`)

## Modifier l'app

- **Ajouter un message WS** : schéma zod dans `shared/src/protocol.ts`, handler dans `backend/src/websocket.ts`, réception dans `useRealtime.ts`.
- **Modifier le scoring** : `backend/src/scoring/judge.ts` (timing+hold, inchangé).
- **Modifier la formule de vélocité phase 4** : `backend/src/websocket.ts:scheduleAggregatedPlayback` (mapping count→factor).
- **Changer les questions du sondage** : `shared/src/survey.ts` (un seul endroit, types stricts). Les mêmes 7 questions sont utilisées en phases 5 et 9.
- **Ajouter un instrument orchestre** : ajouter l'entrée dans `instrumentPresets.ts`, télécharger le `.js` dans `frontend/public/webaudiofont/instruments/`, mettre à jour `SOURCE_NAME_TO_PRESET_KEY` dans `normalizeScore.ts`.
- **Accès mobile** : le frontend écoute sur `0.0.0.0:5173`. Les élèves se connectent via l'IP locale. Hôtes autorisés dans `vite.config.ts`.
