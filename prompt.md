# Réflexion : nouvel algo d'agrégation phase 4 — "intelligence collective"

## Contexte

Dans l'app (voir `CLAUDE.md`), la phase 4 est la performance piano : 4 groupes de 5-7 élèves chacun jouent ensemble une partition. Un "algo d'agrégation" est le code serveur qui décide, à partir des inputs de tous les élèves d'un groupe, **quel son sort pour ce groupe** (et à quel volume).

Les 4 algos actuels (`democratic`, `majority`, `doublure`, `direct`) sont implémentés dans `backend/src/websocket.ts` (fonction `scheduleAggregatedPlayback`) et `backend/src/scoring/aggregate.ts`.

## Le problème à résoudre

**Les algos 1, 2, 3 trichent.** Ils utilisent le fait que le serveur connaît la partition — il sait à quel instant chaque note *doit* être jouée et avec quel MIDI. Ces algos sont donc en réalité des **filtres de validation** : le serveur arme un `setTimeout` pour chaque note attendue, et au moment du tick, compte combien d'élèves ont pressé le bon MIDI dans une fenêtre ±220ms autour du moment attendu. Si seuil atteint → son. Sinon → silence.

L'algo ne "lit" pas le groupe, il vérifie le groupe contre une vérité externe.

## Ce qu'on cherche

Un algo qui **fonctionne sans connaître la partition côté serveur** (ou en tout cas sans utiliser les timestamps attendus). Le serveur doit **écouter** ce que le groupe produit et décider du son à partir de ça seul. L'axe directeur : **révéler l'intelligence collective du groupe**.

Contrainte de taille : 4 groupes, 5-7 personnes par groupe.

## Ce que "intelligence collective" peut vouloir dire ici

Plusieurs sens possibles, à arbitrer :

1. **Synchronisation temporelle émergente** — le groupe converge vers un tempo commun sans métronome. Mesurable via clustering temporel des inputs.
2. **Consensus sur la note** — quand X personnes pressent le même MIDI dans une fenêtre courte, c'est qu'ils "se sont mis d'accord" (visuellement via le NoteHighway, mais sans feedback du serveur sur qui est juste).
3. **Cohésion = qualité sonore** — plus le groupe est serré (en temps + en note), plus le son est net/fort. Dispersé = étouffé ou silencieux.

## 3 pistes proposées

### A. Quorum glissant (le plus simple)
Le serveur maintient un buffer des inputs récents par groupe. Dès que **K élèves pressent le même MIDI dans une fenêtre de W ms**, déclenchement immédiat. Sinon silence.
- Paramètres de départ : K=3 (sur 5-7), W=120ms.
- Joue n'importe quelle note, même fausse, si le groupe est d'accord.
- "Intelligence" mesurée = capacité à se synchroniser sur la même touche au même moment.

### B. Cohésion → vélocité continue
Sur une fenêtre glissante de ~150ms, on regarde tous les inputs du groupe. Si ≥2 personnes pressent **la même note**, on joue ; vélocité = `f(nombre_d'accord, étalement_temporel)`. Très serré et 6/7 d'accord → fort. 2/7 et étalé → murmure.
- Plus continu, moins binaire que A.
- Risque : peut devenir un bruit constant si seuil trop bas.

### C. Détection de "battement" collectif
Le serveur ne joue rien tant qu'il ne détecte pas une **rafale** d'inputs (≥3 dans 80ms). Quand ça arrive, il joue la note majoritaire de la rafale. Entre les rafales, silence.
- Force le groupe à produire des "events" rythmiques clairs.
- Plus musical : silence par défaut, son seulement quand le groupe "frappe ensemble".

## Questions à trancher avant de coder

1. **Fausses notes** : si tout le groupe presse un Do alors que la partition dit Ré, on joue Do ou rien ? (Intuition : on joue Do — c'est tout l'intérêt d'écouter le groupe.)
2. **Solo** : que se passe-t-il si une seule personne joue ? Silence total ? Son très faible ? (Détermine si l'algo punit ou tolère l'individualisme.)
3. **Feedback fausse note actuel** (`WRONG_NOTE_TOLERANCE_MS` dans `handleInputDown`) : on le garde ou on l'enlève ? Il utilise aussi la partition côté serveur — pas cohérent avec un algo "aveugle".
4. **Scoring individuel** (`judgeNote`, l'affichage des scores en perf) : il continue d'utiliser la partition, c'est OK ? Ou on repense aussi ?

## Intuition de l'auteur (Claude précédent)

- **C (rafales)** : le plus expressif musicalement, le plus proche de "intelligence collective" au sens fort.
- **A (quorum)** : le plus lisible pour les élèves ("on a fait sortir un son ensemble").
- **B** : élégant mais risque d'être brouillon.

## Mécanique technique à respecter pour intégration

Voir section "Framework d'algorithmes d'agrégation" et "Recette : ajouter un algo" dans `CLAUDE.md`. En résumé :

1. Étendre `aggregationAlgorithmSchema` dans `shared/src/protocol.ts`.
2. Pas de changement à `RuntimeState` sauf si l'algo a un paramètre persistant.
3. Brancher dans `backend/src/websocket.ts`. Attention : les algos actuels reposent sur un `setTimeout` par note attendue (le serveur sait quand fire). **Un algo "aveugle" n'utilise pas ces timeouts** — il doit réagir en flux dans `handleInputDown` et maintenir un buffer/fenêtre glissante par groupe.
4. Ajouter une option dans `ALGORITHM_OPTIONS` (`frontend/src/pages/AdminPage.tsx`) + styles.
5. Diffuser le son via `broadcastToAdmins({ type: "group_play_note", playAtServerMs, midi, velocity, durationMs, ... })`. Ne pas oublier `OUTPUT_DELAY_MS` si on veut une latence cohérente avec les autres algos (ou pas, à discuter).

## À discuter avec l'utilisateur avant de coder

Choisir la piste (A, B, C, ou une 4e), trancher les 4 questions ci-dessus, et seulement ensuite passer au code.
