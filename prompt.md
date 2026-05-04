le piano sur téléphone est mal implémenté.
il va falloir faire des changements pour améliorer ça.

part du principe que les élèves seront sur leur téléphone en mode paysage, donc width entre 700px et 900px.
Je veux que sur l'écran des élèves il y ai 12 touches de piano. pas plus, en ce moment c'est plus de 40 je crois bien (pour le groupe 1), donc on va devoir faire des changements.
Important : les 12 touches doivent prendre tout l'écran, tu fais en % du width.

pour ça j'ai une idée, on leur met la plage de touche optimale, c'est à dire la plage des 12 touches les plus utilisés. et *pour chaque groupe : les notes qui ne tombent pas dans la plage associé au groupe, on les fait jouer par l'ordinateur* (respecte le timing et la durée).
pense aussi que puisque tu supprime des touches et que tu changes la largeur des touches, il faut aussi modifier les "notes qui tombent" façon piano tiles 2.
voici la plage des touches pour chaque groupe pour le morceau piano_only :
Voici l'analyse pour chaque groupe afin de maximiser les notes conservées dans une fenêtre de 12 demi-tons consécutifs :

Groupe 1
* Plage optimale conservée : E4 à D#5 

Groupe 2
* Plage optimale conservée : D#4 à D5

Groupe 3
* Plage optimale conservée : D#4 à D5

Groupe 4
* Plage optimale conservée : D3 à C#4

Voici la plage des touches pour chaque instruments pour le morceau orchestre :
Important : ici pas besoin de jouer le sons automatiquement sur les notes qui ne sont pas dans la plage optimale, puisque pour l'orchestre on triche, on ne met pas le son des élèves mais direct le son de l'ordinateur.


Flûte
Plage optimale : B5 à A#6

Hautbois (Oboe)
Plage optimale : B4 à A#5

Clarinette
Plage optimale : B3 à A#4

Basson
Plage optimale : C3 à B3

Cor (Horn)
Plage optimale : A3 à G#4

Trompette
Plage optimale : G3 à F#4

Timbales (Timpani)
Plage optimale : G2 à F#3

Violons I
Plage optimale : G#4 à G5

Violons II
Plage optimale : C#4 à C5

Altos (Violas)
Plage optimale : C3 à B3

Violoncelles
Plage optimale : D2 à C#3

Contrebasses
Plage optimale : F#1 à F2

