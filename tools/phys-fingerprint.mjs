// Empreinte de la physique : garde-fou de PHYS_VER et du déterminisme (node tools/phys-fingerprint.mjs).
// Le calcul est dans tools/fingerprint-core.mjs (voir son en-tête pour le principe).
//
//   node tools/phys-fingerprint.mjs            vérifie (npm test)
//   node tools/phys-fingerprint.mjs --update   réécrit tools/phys-fingerprint.json (après avoir incrémenté PHYS_VER dans js/version.js)
//   node tools/phys-fingerprint.mjs --print    affiche l'empreinte (sert à comparer deux moteurs : node, deno, navigateur)
//   deno run -A tools/phys-fingerprint.mjs     même programme sous Deno, le moteur de la fonction serveur
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { computeFingerprint } from './fingerprint-core.mjs';

const FILE = new URL('./phys-fingerprint.json', import.meta.url);

// ---- Programme principal ---------------------------------------------------------------------------------------------------------------
{
  const args = process.argv.slice(2);
  const t0 = Date.now();
  const now = computeFingerprint();
  const ms = Date.now() - t0;
  if (args.includes('--print')) {
    console.log(JSON.stringify(now, null, 1));
  } else if (args.includes('--update')) {
    writeFileSync(FILE, JSON.stringify(now, null, 1) + '\n');
    console.log(`phys-fingerprint.json écrit : PHYS_VER ${now.version}, ${Object.keys(now.scenarios).length} scénarios, empreinte ${now.combined} (${ms} ms)`);
  } else {
    if (!existsSync(FILE)) { console.log('FAIL tools/phys-fingerprint.json absent : node tools/phys-fingerprint.mjs --update'); process.exit(1); }
    const ref = JSON.parse(readFileSync(FILE, 'utf8'));
    if (ref.version !== now.version) {
      console.log(`FAIL PHYS_VER vaut ${now.version} mais l'empreinte enregistrée date de la version ${ref.version} : node tools/phys-fingerprint.mjs --update`);
      process.exit(1);
    }
    const changed = Object.keys(now.scenarios).filter((k) => k in ref.scenarios && now.scenarios[k] !== ref.scenarios[k]);
    const added = Object.keys(now.scenarios).filter((k) => !(k in ref.scenarios));
    const bad = changed;
    const gone = Object.keys(ref.scenarios).filter((k) => !(k in now.scenarios));
    // Un circuit AJOUTÉ crée de nouveaux scénarios sans toucher aux anciens : la physique n'a pas changé, PHYS_VER ne bouge pas (les records et fantômes existants restent valables) ;
    // il faut seulement ajouter ces scénarios à l'empreinte de référence.
    if (!bad.length && !gone.length && added.length) {
      console.log(`FAIL ${added.length} nouveau(x) scénario(s) (circuit ajouté ?) : ${added.slice(0, 8).join(', ')}${added.length > 8 ? ' …' : ''}`);
      console.log('  Les anciens scénarios sont identiques : la physique n\'a PAS changé, ne touche pas à PHYS_VER. Enregistre-les :  node tools/phys-fingerprint.mjs --update');
      process.exit(1);
    }
    if (bad.length || gone.length) {
      console.log(`FAIL la physique a changé sans que PHYS_VER (${now.version}) soit incrémenté : ${bad.length} scénario(s) différent(s)` + (gone.length ? `, ${gone.length} disparu(s)` : ''));
      console.log('  ' + bad.slice(0, 12).join(', ') + (bad.length > 12 ? ` … (+${bad.length - 12})` : ''));
      console.log('  Si c\'est voulu : incrémenter PHYS_VER dans js/version.js, puis  node tools/phys-fingerprint.mjs --update  (et npm run build:function, node tools/golden.mjs --update).');
      process.exit(1);
    }
    console.log(`  ok   empreinte de la physique identique (PHYS_VER ${now.version}, ${Object.keys(now.scenarios).length} scénarios, ${ms} ms)`);
  }
}
