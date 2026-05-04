On a la base du site (les joueurs peuvent se connecter, l'admin aussi), par contre je veux changer beaucoup de chose, je veux que le site suive ça :

Pas besoin de responsive car :
*tout les élèves seront sur téléphone.*
*et l'administrateur sera sur un écran PC de dimensions : width : 1430px, height : 800px.*


je veux que le site fonctionne par phase : 

phase #1 : 
- les élèves se connectent, ils mettent leur prénom, et sont ensuite dans une phase d'attente, il y a un message, en attente de l'administrateur.
- l'administrateur possède un bouton commencer au milieu, au dessus il y a un qr code menant à l'adresse jaffrain.xyz, et en bas il y a le nombre d'élèves connectés.


lorsque le bouton "commencer" est appuyé par l'administrateur, la phase 2 commence :
phase #2:
plus personne ne peut se connecter, à la place d'avoir un champ pour mettre son prénom, ils ont un message : une partie est en cours (les participants ne peuvent se connecter qu'à la phase 1).
- les élèves peuvent choisir leur groupe parmi 4 groupes (les 4 groupes du piano).
- l'administrateur, a un bouton continuer, en dessous se trouve 4 carrés, 1 carré par groupe, l'administrateur peut voir les participants dans chaque groupe dans ces carrés. et en dessous dans un rectangle on voit les utilisateurs qui n'ont pas encore rejoint un groupe.

lorsque le bouton "continuer" est appuyé par l'administrateur, la phase 3 commence :
phase #3 :
cette phase est un phase de test des piano :
- un piano apparaît (piano différent selon le groupe) *voir claude.md*, les élèves peuvent appuyer sur le piano de manière libre, le son sort sur la page web de l'administrateur et ne sort pas du téléphone des élèves.
- l'administrateur, a un bouton continuer tout en haut, sur le reste de la page, il y a 4 carrés, dedans on voit le nom des membres de chaque groupe (1 groupe = 1 carré), l'administrateur peut mute, démute chaque groupe. en cliquant sur un carré, on voit le piano de tout les membre des groupes côte à côte, lorsque une touche est pressé par un élève, ça apparaît (la touche se colore quand elle est pressée), sache que chaque groupe n'aura jamais plus de 8 élèves.

Lorsque le bouton "continuer" est appuyé par l'administrateur, on passe à la phase 4 :
phase #4 : 
C'est dans cette phase que les élèves jouent le morceau issue du fichier : piano_only.json
pour ça on construit la piste audio joué par l'administrateur (rappelle toi que le son des pianos sort chez l'administrateur).
C'est mathématique : on fait la somme des sorties audio de tous les groupes.
pour calculer la sortie audio d'un groupe, on regarde les touches pressés, si une touche est pressé par un seul membre du groupe le son sort avec 30% de velocity, si deux personnes pressent la même touche, ça monte à 70%, 3 : 90%, 4+ : 100%

élève doit voir dessendre toutes les notes de son groupe (précisés dans le fichier JSON) façon piano tiles 2 (déjà bien fait), (note : l'élève voit uniquement les notes de son groupe).

- L'administrateur voit la barre de durée du morceau de piano se remplir (en haut de l'écrant). en dessous, l'administrateur voit 4 carrés, dedans les membres de chaque groupe, avec le nom et le score en %. au dessus de la barre de durée, l'administrateur possède un bouton "continuer".

Lorsque l'admin presse le bouton continuer, on passe à la phase 5:
phase #5 :
Cette phase est un questionnaire (sans bonnes réponses) sur la chanson qu'ils viennent de faire :

Voici les questions :
1 - Quel est le tempo de cette chanson ? réponses possibles : Lent / Modéré / Rapide
2 - Quelle est l'émotion dominante que vous avez ressentie ? réponses possibles : Joie / Tristesse / Colère / Sérénité / Stress
3 - Si vous étiez au volant, comment conduiriez-vous avec ce son ? réponses possibles : Tranquille / Nerveux / Distrait
4 - Pourriez-vous réviser un examen avec cette musique en fond ? réponses possibles : Oui, ça m'aide / Non, impossible de me concentrer
5 - Si vous faisiez du sport, ce morceau vous aiderait-il à tenir plus longtemps ? Grave, ça me motive / Pas du tout, ça me coupe mon rythme
6 - Quel souvenir vous vient à l'esprit en écoutant cela ? une fête / un film / une personne
7 - Si vous deviez faire une tâche répétitive (ménage, rangement), ce morceau vous rendrait-il plus efficace ? Oui / Non

Ces questions s'affichent une à une sur l'écran des élèves.

L'administrateur, voit le bouton continuer, et en bas, il voit 7 lignes, avec les résultats de chaque réponses affichés (pas trop petit).

en appuyant sur continuer ici, on retourne à la phase #1.

Pour la phase 2, phase 3, phase 4, phase 5 : l'adiministrateur a un petit bouton rouge reset tout en bas. si l'admin l'appuis pendant 3 secondes alors, on reviens à la phase #1.


Précisions : 
Le but global de ce projet est de faire faire en sorte qu'une classe puisse jouer un morceau de piano compliqué puis un orchestre compliqué (2 morceaux en tout). pour ce faire on met les notes des morceaux dans plusieurs groupes, les fichiers .json contiennent les notes comprises dans chacun des groupes. La somme des notes de tous les groupes fait le morceaux (comme ça on décomplexifie).
on va prendre un exemple : prenons un élève dans le groupe 1, lorsque l'admin aura lancé le morceau piano, il verra les notes qu'il doit jouer descendre comme sur le jeu pianio tiles 2 (note : l'élève doit voir et jouer seulement les notes de son groupe, ici 82 notes pour 1 minute et 5 secondes).
l'élève du groupe 1 possède un piano qui possède le minimum de touches (on prend la plage des notes qu'il va devoir jouer, imaginons que la note la plus aigu dans sa partition est A et que la plus grave est B, on met toutes le touches de A à B).

*Important : tu noteras que un autre morceau existe, orchestre.json. je veux que tu l'oublie complétement, occupes toi de faire seulement avec piano_only.json (qu'on utilise à la phase 4).
Améliore l'audio du piano, je veux que ça sonne comme un vrai piano (pas sythétique).*