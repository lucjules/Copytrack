// Dictionnaire anglais : l'assemblage des dictionnaires par domaine (js/i18n/en/*.js). Chargé à la demande (voir i18n/boot.js).
// Quand une même clé française existe dans deux fichiers, le dernier gagne ; tools/test-i18n.mjs signale les doublons qui ne disent pas la même chose.
import shell from './en/shell.js';
import race from './en/race.js';
import online from './en/online.js';
import editor from './en/editor.js';
import pieces from './en/pieces.js';
import data from './en/data.js';
import tracks from './en/tracks.js';
import custom from './en/custom.js';
import hub from './en/hub.js';

export const PARTS = { shell, race, online, editor, pieces, data, tracks, custom, hub };
export default Object.assign({}, ...Object.values(PARTS));
