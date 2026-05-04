Dans la pahse #3 et phase #4 : le son du piano doit faire un son de vrai piano, et non un son synthétique comme c'est le cas ici (peut être que utiliser la bibliothèque webaudiofont marcherais ?).

Pour la phase #7 et phase #8 :
le son du piano fait le son de l'intrument associé au groupe,  et non un son synthétique comme c'est le cas ici (peut être que utiliser la bibliothèque webaudiofont marcherais ?) regarde le fichier orchestre.html, c'est un site qui permet de récupérer le fichier orchestre.json et de le jouer avec de très bon sons.
Je veux aussi que si un élève presse durablement la touche, le son reste sur la durée, jusqu'à ce que la touche est relachée.

---

## État d'implémentation (session 2026-05-04)

**Tout ce qui suit a été implémenté et est fonctionnel.**

### Architecture actuelle : 9 phases

L'app tourne en 9 phases linéaires (`shared/src/protocol.ts:appPhaseSchema`). La machine est :
`phase1_lobby → phase2_groups → phase3_practice → phase4_performance → phase5_survey → phase6_orchestra_groups → phase7_orchestra_practice → phase8_orchestra_performance → phase9_orchestra_survey → phase1_lobby (reset)`

### Audio — ce qui est en place

**Piano (phases 3 & 4)** : WebAudioFont `0000_FluidR3_GM_sf2_file.js` (~1.2MB, acoustic grand piano multi-échantillonné). Fichier dans `frontend/public/webaudiofont/instruments/`. Preset : `_tone_0000_FluidR3_GM_sf2_file`. Son dure tant que la touche est tenue (durée 700ms en live, durée réelle de la note en performance).

**Orchestre (phases 7 & 8)** : 12 instruments, chacun un fichier GeneralUserGS distinct dans `frontend/public/webaudiofont/instruments/`. Mapping dans `backend/src/partitions/normalizeScore.ts:SOURCE_NAME_TO_PRESET_KEY`. ViolonII est un deep-clone de ViolonI (même preset 0710) via `copyKey` pour éviter les conflits d'envelope.

**Audio admin uniquement** : `group_play_note` est broadcasté uniquement aux connexions admin (`broadcastToAdmins`). Les élèves ne produisent jamais de son. `AudioContext` n'est jamais créé côté élève.

**Phase 8 spécifique** : le son est joué *automatiquement par l'ordinateur* (`mode: "always"` dans `scheduleAggregatedPlayback`). Toutes les notes d'`orchestre.json` sont broadcastées à l'admin avec vélocité pleine. Les inputs élèves passent quand même par `judgeNote()` pour le scoring.

**Phase 4** : son *agrégé/voté* — count d'élèves qui ont pressé le bon MIDI → formule 1=30%, 2=70%, 3=90%, 4+=100% de vélocité.

### Architecture backend critique

- `partId` format : `${scoreId}:${sourceName}` (ex: `piano_only:groupe_1`, `orchestre:Flute`) — essentiel pour éviter les collisions quand un élève a un partId piano et rejoint ensuite un groupe orchestre.
- `scoreIdForPhase()` dans `websocket.ts` retourne `"piano_only"` pour phases 2-5, `"orchestre"` pour phases 6-9.
- `join_part` valide que le `partId` correspond au scoreId attendu pour la phase courante.
- `resetRuntimeState()` vide tout : students, parts, inputs, timers, surveyAnswers, mutedGroups, activeKeysByStudent.
- Lock connexions : hors phase 1, refus des `hello` student sans sessionToken valide.

### Patterns importants

- **Reset sentinel** : le serveur envoie `{ type: "error", message: "__RESET__" }` aux élèves avant de fermer leur WS. `useRealtime.ts` intercepte ce sentinel → vide localStorage → désactive reconnexion auto → élève retombe sur LandingPage vierge.
- **Coalescing broadcast** : `broadcastStateSoon()` dans `websocket.ts` utilise un flag microtask pour éviter de flooder en phase 3 (N élèves × inputs rapides).
- **ViolonII deep-clone** : `AudioEngine.loadPreset()` vérifie `preset.copyKey` et copie profondément les zones pour éviter que ViolonI et ViolonII partagent les mêmes objets d'enveloppe.

### Fichiers clés à connaître

| Fichier | Rôle |
|---|---|
| `shared/src/protocol.ts` | Toute la définition du protocole WS + types |
| `shared/src/survey.ts` | 7 questions du sondage (utilisées en phases 5 & 9) |
| `backend/src/state.ts` | RuntimeState + publicState() + resetRuntimeState() |
| `backend/src/websocket.ts` | Machine de phases, handlers WS, scheduleAggregatedPlayback |
| `backend/src/scoring/aggregate.ts` | countCorrectPressers() pour le mode voté |
| `backend/src/partitions/normalizeScore.ts` | SOURCE_NAME_TO_PRESET_KEY, buildChromaticLanes, partId format |
| `frontend/src/audio/instrumentPresets.ts` | 13 presets (piano + 12 orchestre), ORCHESTRA_PRESET_KEYS |
| `frontend/src/audio/AudioEngine.ts` | loadPreset(), schedule(), unlock(), copyKey deep-clone |
| `frontend/src/pages/AdminPage.tsx` | Vues généralisées : GroupsView/PracticeView/PerformanceView/SurveyView |
| `frontend/src/styles/global.css` | Layout admin 1430×800, grilles phase6/7/8 (4×3), styles téléphone |

### Ce qui n'a PAS changé

- `NoteHighway.tsx` — inchangé (hit line 84%, leadTime 3000ms)
- `scoring/judge.ts` — logique timing+hold inchangée
- `clock_ping`/`clock_pong` — synchronisation temporelle inchangée
- `GroupPicker.tsx` — filtré dynamiquement selon le scoreId de la phase courante