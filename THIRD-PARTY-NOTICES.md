# Composants tiers

Le jeu (code, décors, véhicules, pièces, circuits officiels, icônes) est publié sous licence MIT ([LICENSE](LICENSE)). La musique et les sons sont
synthétisés par le jeu ([js/AudioEngine.js](js/AudioEngine.js)) : aucun fichier audio. Les composants suivants gardent leur propre licence ; ils sont
aussi listés dans le jeu (menu › Crédits et licences, ou [legal.html?p=credits](legal.html?p=credits)).

| Composant | Où | Licence | Titulaire |
|---|---|---|---|
| three.js r170 (`three.module.min.js`) et TransformControls | `js/vendor/` | MIT ([THREE_LICENSE.txt](js/vendor/THREE_LICENSE.txt)) | © 2010-2024 three.js authors |
| Chakra Petch 500, 700, 700 italique (latin, latin étendu) | `assets/fonts/` | SIL Open Font License 1.1 ([OFL.txt](assets/fonts/OFL.txt)) | © 2018 The Chakra Petch Project Authors |
| Unbounded 500, 700, 800 (wiki) | `wiki/fonts/` | SIL Open Font License 1.1 ([OFL.txt](wiki/fonts/OFL.txt)) | © 2022 The Unbounded Project Authors |
| IBM Plex Sans 400, 500, 600, 400 italique ; IBM Plex Mono 400, 500 (wiki) | `wiki/fonts/` | SIL Open Font License 1.1 ([OFL.txt](wiki/fonts/OFL.txt)) | © 2017-2019 IBM Corp. |

Les polices viennent des paquets `@fontsource/*` 5.3.0 (fichiers WOFF2 inchangés). Elles sont servies par le site : aucune requête vers un service de
polices tiers.

Pour ajouter un composant : le déposer avec sa licence, l'ajouter à ce tableau et à la page « Crédits et licences » (`js/legal.js`) ; `tools/test-legal.mjs`
vérifie que chaque fichier de `js/vendor/`, `assets/` et `wiki/fonts/` y est déclaré.
