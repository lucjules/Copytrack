# Garage : comment les véhicules sont vérifiés

Tout ce qui est personnalisable dans le garage est **purement visuel** : la physique ne dépend d'aucun module de personnalisation (`tools/test-cosmetics-physics.mjs` : imports, texte du code, 160 variantes construites, course rejouée bit à bit, constantes `CAR` inchangées).

## Trois niveaux de contrôle

1. **Mesures sur le vrai modèle 3D** (`tools/test-garage-geometry.mjs`, dans `npm test`), pour CHAQUE carrosserie × chaque option :
   - géométrie valide (aucun sommet non fini, aucune forme vide), proportions plausibles (longueur, largeur, hauteur) ;
   - quatre roues, posées au sol, symétriques, dans la longueur de la coque, pas enfoncées dans la caisse ;
   - **ailerons** d'un seul tenant (aucune pièce flottante) et reposant sur le pont arrière (rayon vertical contre la coque) ;
   - **ornements** posés sur la coque (ni flottants, ni cachés dedans), centrés, de taille raisonnable ;
   - **motifs** entièrement sur le flanc, des deux côtés, ni au-dessus d'une caisse basse ni sous le seuil, ni au-delà de la longueur de la caisse ;
   - coût d'affichage : triangles et formes bornés (aucune variante au-delà de 3,2 fois la voiture de base), construction rapide ;
   - traînées (couleur valide, ruban sans valeur invalide) ; aller-retour de sauvegarde à l'identique de tout l'équipement.
   Ces mesures ont trouvé des défauts réels (motifs flottants sur les caisses basses, motifs qui débordaient de la carrosserie) ; chaque mesure a été éprouvée par mutation (aileron ou motif déplacé en l'air : le test échoue).
2. **Captures réelles du garage** (`tools/garage-sheets.mjs`) : une image de chaque carrosserie, finition, roue, aileron, motif, ornement, LED et préréglage, en trois quarts avant, trois quarts arrière et profil, assemblées en planches. Elles servent à REGARDER : c'est ainsi qu'ont été vus l'anneau et la planche de surf qui flottaient, la planche de surf quasi invisible, les finitions qui délavaient la couleur (une lueur blanche sur un rouge profond : les composantes verte et bleue sont presque nulles, un peu de blanc les décuple) et le traîneau sans patins.
   ```bash
   GARAGE_QUALITY=high GARAGE_VIEWS=av,sd node tools/garage-sheets.mjs /tmp/planches body ornament preset
   ```
3. **Navigateur** (`tools/test-browser.mjs`) : palettes, préréglages par thème, éléments saisonniers verrouillés avec leur prix, achat (impossible sans pièces), **sauvegarde dans le profil et équipement retrouvé dans une nouvelle page**, quatre klaxons, les 18 traînées sur une vraie course.

## Limites de la vérification (à connaître)

- Les captures sont faites avec le rendu LOGICIEL de Chromium (SwiftShader), pas avec une carte graphique : les reflets et les ombres y diffèrent. D'une capture à l'autre, **le même modèle peut apparaître plus clair ou plus sombre** (reflets du ciel, ombre de la voiture sur elle-même) sans que le modèle change ; l'outil fige l'heure du décor, coupe les ombres portées et fixe la qualité, ce qui réduit l'écart sans le supprimer. Les finitions (brillante, métallisée, nacrée, chromée…) ne se jugent donc bien que sur un vrai GPU.
- Les **klaxons** sont vérifiés sans erreur ; leur rendu sonore n'est pas jugé.
- Les effets lumineux ne sont pas mesurés en images par seconde réelles (le rendu logiciel n'est pas représentatif) : seul le nombre de formes et de triangles est borné.
