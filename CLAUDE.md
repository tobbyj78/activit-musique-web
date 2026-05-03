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

## Flux 5 phases

L'app fonctionne en **5 phases linéaires strictes** (`shared/src/protocol.ts:appPhaseSchema`). L'admin ne peut qu'avancer (`admin_advance_phase`) ou reset (`admin_reset`). Pas de retour arrière.

| Phase | Élève | Admin |
|---|---|---|
| `phase1_lobby` | saisie prénom + attente | QR jaffrain.xyz, bouton "Commencer", count |
| `phase2_groups` | `GroupPicker` (4 groupes piano) | "Continuer", 4 carrés groupes, rectangle non-assignés |
| `phase3_practice` | `MiniKeyboard` libre (pas de son local) | "Continuer", 4 carrés + mute toggle, drilldown vue claviers |
| `phase4_performance` | `NoteHighway` + `MiniKeyboard` (pas de son local) | "Continuer", `SongProgressBar`, 4 carrés + scores |
| `phase5_survey` | `Survey` (7 questions auto-avance) | "Continuer", 7 lignes de résultats agrégés |

`admin_advance_phase` depuis phase 5 = retour en phase 1 (= reset complet). Le bouton **`HoldResetButton`** rouge (hold 3s) est visible en bas-droite des phases 2-5 et envoie `admin_reset`.

## Lock connexions

En dehors de phase 1, le serveur refuse les nouveaux `hello` (rôle student) sans `sessionToken` valide (`backend/src/websocket.ts:handleHello`). Les reconnexions par sessionToken (grâce 30s) sont toujours autorisées.

## Sortie audio admin uniquement

En phases 3 et 4, **les téléphones élèves ne produisent pas de son**. Les keypress remontent au backend, qui broadcaste `group_play_note` **uniquement aux connexions admin** (`broadcastToAdmins`). Le navigateur admin joue le son via `AudioEngine.schedule()`. Une overlay "Cliquer pour activer l'audio" gate l'`AudioContext` lors du premier rendu admin.

### Phase 3 — son live
Chaque `input_down` produit un `group_play_note` `source: "live"` programmé à `now + 30ms`, durée 700ms, vélocité 0.7. Skipped si `mutedGroups.has(partId)`. `state.activeKeysByStudent` est mis à jour à chaque down/up et broadcast (coalescing 30ms via `broadcastStateSoon`).

### Phase 4 — son agrégé
Le serveur programme un timer pour chaque note attendue à `T + JUDGE_DELAY_MS (140ms)`. Au tick : il compte le nombre d'élèves du groupe ayant pressé le bon MIDI dans la fenêtre `±MISS_WINDOW_MS (220ms)` autour de `expectedAtServerMs`, puis applique la formule **count→velocity** : 1=30%, 2=70%, 3=90%, 4+=100% (multiplié par `note.velocity`). Voir `backend/src/scoring/aggregate.ts:countCorrectPressers` et `websocket.ts:scheduleAggregatedPlayback`.

Le scoring par-élève (timing+hold dans `scoring/judge.ts`) est indépendant et inchangé.

## Reset

`admin_reset` :
1. Pour chaque connexion student : envoie un message `error` avec `message: "__RESET__"` (sentinel) puis ferme la WS. Le frontend (`useRealtime`) intercepte ce sentinel, vide `localStorage` (studentName + sessionToken), et désactive la reconnexion automatique → l'élève voit la `LandingPage` vierge.
2. `resetRuntimeState(state)` vide tout (students, parts, scores, mute, surveyAnswers, timers).
3. Broadcast d'un nouveau state.

## Partitions

Un seul fichier dans `partitions/piano_only.json` (4 groupes, 285 notes, 65.5s). Lu au démarrage par `backend/src/partitions/loadPartitions.ts` puis normalisé via `normalizeScore.ts` en `NormalizedScore`. IDs de note : `scoreId:sourceName:index` (ex: `piano_only:groupe_1:0`). **Les lanes sont chromatiques** entre `minMidi` et `maxMidi` du groupe (toutes les touches noires/blanches comprises) — voir `buildChromaticLanes`.

`orchestre.json` a été supprimé. Le type `ScoreId` est désormais `"piano_only"` uniquement.

## Audio engine

`AudioEngine` (frontend) charge `WebAudioFontPlayer.js` puis `0000_FluidR3_GM_sf2_file.js` (~1.2MB, vrai sample multi-échantillonné acoustic grand piano). Le preset est unique : `piano` → `_tone_0000_FluidR3_GM_sf2_file`. Si non chargé, fallback synthé triangle. Plafond de vélocité = 0.95.

L'`AudioContext` n'est jamais créé côté élève (App.tsx gate `unlockAudio` sur `role === "admin"`).

## Composants frontend clés

- `pages/LandingPage.tsx` — saisie prénom/admin pwd. Si erreur "partie en cours", bloque l'input.
- `pages/AdminPage.tsx` — switch sur `state.phase` → 5 sous-vues (`Phase1View`...`Phase5View`). State local `drillPartId` pour la vue détaillée phase 3.
- `pages/StudentPage.tsx` — switch sur `state.phase` (5 sous-vues, pas de jeu d'audio local).
- `components/MiniKeyboard.tsx` — props `highlightedMidis?` (vue admin drilldown), `readOnly?` (idem).
- `components/HoldResetButton.tsx` — anneau SVG progressif sur 3s, fire `onConfirm` à 100%, annule sur pointer-up précoce.
- `components/Survey.tsx` — état local `currentIndex` qui s'auto-incrémente après chaque réponse.
- `components/QrCode.tsx` — wrapper `qrcode.react` (dépendance v4).
- `components/SongProgressBar.tsx` — rAF, lit `serverTimeOffsetMs` pour calcul d'avancement.
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
- **Changer les questions du sondage** : `shared/src/survey.ts` (un seul endroit, types stricts).
- **Accès mobile** : le frontend écoute sur `0.0.0.0:5173`. Les élèves se connectent via l'IP locale. Hôtes autorisés dans `vite.config.ts`.
