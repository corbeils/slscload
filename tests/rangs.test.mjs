// Tests des moteurs : arrimage par rang et étalement du poids. Usage : npm test
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const r = await build({ entryPoints: ['engine/entry.ts'], bundle: true, format: 'cjs', write: false });
const f = path.join(mkdtempSync(path.join(tmpdir(), 'slsc-')), 'engine.cjs');
writeFileSync(f, r.outputFiles[0].text);
const E = createRequire(import.meta.url)(f);

const zones = [{ x: 0, z: 1500 }];
const pc = (id, x, y, kg, o = {}) => ({ id, name: 'Caisse', l: 1500, w: 1200, h: 1200, kg, stackable: false, rotate: false, stop: 1,
  x, y, z: 1500, pl: 1500, pw: 1200, seq: 1, zi: 0, ...o });
const sec = (ps, wll = 2268) => E.securement(ps, { wllKg: wll, front: null, zones });

// 2 pièces de 5 000 lb (2 268 kg) côte à côte = un rang de 10 000 lb
let s = sec([pc('A', 3000, 100, 2268), pc('B', 3000, 1300, 2268), pc('C', 8000, 100, 2268)]);
assert.equal(s.length, 2);
assert.deepEqual(s[0].ids, ['A', 'B']);
assert.equal(s[0].kg, 4536);
assert.equal(s[0].byWll, 1);           // 50 % de 4 536 kg = 2 268 kg : 1 attache de 2 268 kg suffit pour le poids
assert.equal(s[0].n, 2);               // mais la longueur en demande 2
assert.deepEqual(s[1].ids, ['C']);

// Le poids combiné fait monter le nombre d'attaches : 2 x 6 000 kg avec des attaches de 2 268 kg
s = sec([pc('A', 3000, 100, 6000), pc('B', 3000, 1300, 6000)]);
assert.equal(s.length, 1);
assert.equal(s[0].byWll, 3);           // 6 000 kg à retenir / 2 268
assert.equal(s[0].n, 3);

// Une pièce empilée compte dans le rang ; une pièce plus loin sur la remorque non
s = sec([pc('A', 3000, 100, 2000, { stackable: true }), pc('H', 3000, 100, 1000, { z: 2700 }), pc('Z', 4400, 1300, 500)]);
assert.deepEqual(s.map((q) => q.ids), [['A', 'H'], ['Z']]);
assert.equal(s[0].kg, 3000);

// Une machine de 4 500 kg et plus reste seule : 4 attaches directes
s = sec([pc('M', 3000, 100, 5000, { type: 'machine' }), pc('B', 3000, 1300, 1000)]);
assert.equal(s.length, 2);
assert.equal(s.find((q) => q.ids[0] === 'M').n, 4);

// Étalement : step deck 53', rien d'empilé tant qu'il reste du plancher, et aucun groupe d'essieux saturé
const TR = { wheelbase: 4400, fifthWheel: 4000, steerTareKg: 4600, driveTareKg: 3600 };
const sp = { legalH: 4150, legalW: 2600, maxKg: 19000,
  zones: [{ name: 'Niveau haut', x: 0, z: 1600, l: 3350, w: 2600 }, { name: 'Niveau bas', x: 3350, z: 1100, l: 12800, w: 2600 }] };
const items = [['01', 4500, 1800, 1900, 6500, 0, 0, 2], ['02', 1800, 1200, 1300, 2200, 0, 1, 2], ['03', 2200, 1100, 1100, 1800, 0, 1, 1],
  ['04', 2200, 1100, 1100, 1800, 0, 1, 1], ['05', 3000, 1400, 1500, 4200, 0, 0, 1], ['06', 1200, 1000, 1000, 600, 1, 1, 3],
  ['07', 1200, 1000, 1000, 600, 1, 1, 3], ['08', 800, 600, 700, 180, 1, 1, 3]]
  .map((a) => ({ id: a[0], name: 'P', l: a[1], w: a[2], h: a[3], kg: a[4], stackable: !!a[5], rotate: !!a[6], stop: a[7] }));
const ctx = { base: { kingpinX: 1100, tandemX: 14300, trailerTareKg: 8400, trailerCogX: 8400, ...TR }, cfg: E.AXLE_CFGS.tandem, lifted: false,
  reg: { season: 'normal', tires: 'dual', steerRated: 6000 }, L: 16150 };
ctx.slide = E.slideRange(ctx);
const b = E.balanceOpen(sp, items, [], ctx);
assert.equal(b.rejected.length, 0);
assert.ok(b.placed.every((p) => p.z === sp.zones[p.zi].z), 'aucune pièce empilée');
assert.ok(E.validLayout(b.placed, () => true, (p) => sp.zones[p.zi].z), 'plan valide');
const rows = E.evaluate(b.placed, ctx, b.front).rows;
assert.ok(rows.every((x) => x.ok));
assert.ok(rows[2].kg / rows[2].limit < 0.9, 'essieux de la remorque sous 90 %');
console.log('OK : arrimage par rang et étalement.');

// « Étendre le voyage » : pièces à la queue leu leu (aucune côte à côte, aucune empilée), plan toujours conforme
{
  const one = E.balanceOpen(sp, items, [], { ...ctx, single: true });
  const ps = one.placed;
  assert.ok(ps.length >= 6, 'la plupart des pièces tiennent en file');
  assert.ok(ps.every((p) => p.z === sp.zones[p.zi].z), 'rien d’empilé');
  for (const a of ps) for (const b of ps) if (a !== b) assert.ok(a.x + a.pl <= b.x || b.x + b.pl <= a.x, `${a.id} et ${b.id} côte à côte`);
  assert.equal(ps.length + one.rejected.length, items.length);
  // boîte fermée
  const box = E.balanceClosed({ l: 16000, w: 2480, h: 2700, maxKg: 20000 }, items.slice(1), [], { ...ctx, L: 16000, single: true });
  for (const a of box.placed) for (const b of box.placed) if (a !== b) assert.ok(a.x + a.pl <= b.x || b.x + b.pl <= a.x);
  assert.ok(box.placed.every((p) => p.z === 0));
  console.log('OK : étendre le voyage (' + ps.length + ' placées, ' + one.rejected.length + ' sans place).');
}
