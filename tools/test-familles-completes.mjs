// Familles de pièces COMPLÈTES (0.12.0) : node tools/test-familles-completes.mjs   (npm test)
// Pour chaque famille de l'éditeur, TOUTES les combinaisons de caractéristiques sont parcourues : chacune est une pièce, ou elle est écartée par une règle
// écrite ici avec sa raison (celle que l'éditeur affiche). Une combinaison ni posable ni expliquée fait échouer le test : c'est une pièce qui manque.
// Et toute pièce posable de la palette appartient à une famille (sauf les quelques pièces uniques listées).
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { PIECES, PIECE_ORDER, LEGACY_TILE } from '../js/pieces.js';
import { FAMILIES, FAMILY_ORDER, resolve, familyOf, REPLACED_BY_OPTION, missingReason } from '../js/families.js';
import { Track } from '../js/track.js';
import { extendPlan } from '../js/extend.js';
import { checkTrack } from '../js/editorTools.js';
import { continuityIssues } from '../js/continuity.js';
import { centerlineWorld } from '../js/ribbons.js';
import { CarPhysics } from '../js/physics.js';
import { RaceLogic, placeAtStart } from '../js/raceLogic.js';
import { Autopilot } from '../js/autopilot.js';

const combos = (traits) => traits.reduce((acc, t) => acc.flatMap((c) => t.values.map(([v]) => ({ ...c, [t.id]: v }))), [{}]);

test('chaque combinaison de chaque famille est une pièce, ou une exclusion expliquée (aucune pièce ne manque)', () => {
  const holes = [];
  let total = 0, members = 0;
  for (const fam of FAMILY_ORDER) {
    const F = FAMILIES[fam];
    for (const c of combos(F.traits)) {
      total++;
      const type = resolve(fam, c), why = missingReason(fam, c);
      if (type) { members++; assert.equal(why, '', `${fam} ${JSON.stringify(c)} : pièce ${type}, mais aussi une raison d'exclusion`); }
      else if (!why) holes.push(`${fam} ${JSON.stringify(c)}`);
    }
  }
  assert.deepEqual(holes, [], `${holes.length} combinaison(s) sans pièce ni raison`);
  console.log(`       (${members} pièces, ${total - members} combinaisons écartées avec leur raison)`);
});

test('les raisons d’exclusion sont celles qu’on attend', () => {
  assert.match(missingReason('turn', { w: 'N', size: 's', bank: '1', incl: '0', dir: 'R' }), /serré relevé/);
  assert.match(missingReason('turn', { w: 'w', size: 's', bank: '0', incl: '1', dir: 'R' }), /large/);
  assert.match(missingReason('turn', { w: 'n', size: 'm', bank: '1', incl: '0', dir: 'R' }), /relevé/);
  assert.match(missingReason('turn', { w: 'N', size: 'm', bank: '0', incl: '0', dir: 'L' }), /tourné/);
  assert.match(missingReason('chicane', { len: '2', shift: '2', dir: 'R' }), /quarts de tour/);
  assert.match(missingReason('roll', { de: '0', vers: '3', forme: 's' }), /deux transitions/);
  assert.match(missingReason('roll', { de: '0', vers: '0', forme: 's' }), /même orientation/);
  assert.match(missingReason('roll', { de: '0', vers: '4', forme: 'l' }), /45°/);
  assert.match(missingReason('tube', { forme: 'mid', dir: 'L' }), /symétrique/);
});

test('familles demandées : la montée existe en route étroite et en route large ; virages, courbes et raccords aussi', () => {
  for (const w of ['n', 'w']) for (const incl of ['0.5', '1', '2', '4', '-0.5', '-1', '-2', '-4']) assert.ok(resolve('straight', { w, incl }), `ligne droite ${w} ${incl}`);
  for (const w of ['N', 'n', 'w']) for (const sens of ['u', 'd']) for (const incl of ['0.5', '1', '2', '4']) for (const prof of ['i', 'o', 's']) assert.ok(resolve('courbe', { w, sens, incl, prof }), `courbe ${w}${sens}${incl}${prof}`);
  assert.ok(resolve('largeur', { w: 'nw' }), 'étroite → large');
  // Une route large en montée 1 a la même pente qu'une pente 1 (trois niveaux sur trois cases).
  assert.equal(PIECES.wslU1.rise / PIECES.wslU1.size, PIECES.slope.rise / PIECES.slope.size);
});

test('toute pièce posable de la palette appartient à une famille (sauf les pièces uniques : départ, arrivée, anneau turbo, vrille)', () => {
  const ALONE = new Set(['start', 'finish', 'ring', 'twist']);
  const orphan = PIECE_ORDER.filter((t) => PIECES[t] && !LEGACY_TILE[t] && !REPLACED_BY_OPTION.has(t) && !ALONE.has(t) && !familyOf(t));
  assert.deepEqual(orphan, []);
});

test('« Prolonger » avec les nouvelles pièces : les raccords de largeur se posent tout seuls et dans le bon sens ; le circuit se vérifie sans remarque et le pilote le finit', () => {
  const tr = new Track('mixte');
  let last = tr.add({ t: 'start', x: 0, z: 0, l: 2, r: 0 });
  const seq = ['straight', 'wide', 'wslU1', 'wcro1', 'wbigcurve', 'wcvBig1', 'wide', 'straight', 'bankU1', 'straight', 'ncurve', 'ncrs1', 'ncvBig1', 'narrow', 'straight', 'cvHuge2', 'straight', 'finish'];
  const added = [];
  for (const type of seq) {
    const r = extendPlan(tr, last, type, {});
    assert.ok(r.tile, `${type} : ${r.why}`);
    for (const t of r.chain || [r.tile]) { last = tr.add(t); added.push(t.t + (r.reverse ? '↺' : '')); }
  }
  assert.deepEqual(added.filter((t) => /narrowIn|wideIn/.test(t)), ['wideIn', 'wideIn', 'narrowIn', 'narrowIn'], 'quatre raccords insérés : vers large, retour, vers étroite, retour');
  assert.deepEqual(checkTrack(tr).filter((i) => i.level !== 'info').map((i) => i.msg), []);
  assert.deepEqual(continuityIssues(tr).filter((i) => i.level !== 'info').map((i) => i.code), []);
  const path = [];
  for (const t of tr.tiles) { const pts = centerlineWorld(t, PIECES[t.t].size >= 2 ? 12 : 6); if (path.length) pts.shift(); path.push(...pts); }
  tr.path = path;
  const ph = new CarPhysics(tr), lg = new RaceLogic(tr); placeAtStart(ph, lg); ph.graceT = 0;
  const bot = new Autopilot(path); bot.reset(ph);
  let done = null;
  for (let i = 0; i < 120 * 90 && !done; i++) {
    ph.clock = i; ph.step({ steer: bot.control(ph).steer, throttle: ph.speed * 3.6 < 130, brake: ph.speed * 3.6 > 160 });
    assert.ok(!ph.lost, 'voiture perdue');
    const e = lg.update(ph); if (e && e.type === 'finish') done = lg.time;
  }
  assert.ok(done, 'arrivée franchie');
});

finish('Toutes les familles de pièces sont complètes.');
