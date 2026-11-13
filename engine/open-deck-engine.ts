// open-deck-engine.ts : plateau, step deck, fardier à puits. Unités en mm / kg.
// Repère remorque : x = 0 à l'avant, y = largeur du plancher, z = hauteur depuis le sol.
// Réutilise pack() par zone, du niveau le plus bas au plus haut (le puits se remplit en premier).
// Chaque pièce placée porte `zi` : l'index de sa zone dans sp.zones.

import { pack, spill, Item, Placed, PackOpts } from './placement-engine';

export type Zone = { name: string; x: number; z: number; l: number; w: number }; // z = hauteur du plancher / sol
export type OpenSpace = { zones: Zone[]; legalH: number; legalW: number; maxKg: number };

export function packOpen(sp: OpenSpace, items: Item[], opts: PackOpts = {}) {
  const fixedAll = opts.fixed ?? [];
  const zones = sp.zones.map((z, i) => ({ ...z, i })).sort((a, b) => (opts.zoneOrder === 'front' ? a.x - b.x || a.z - b.z : a.z - b.z || a.x - b.x));
  let left = [...items];
  let kgLeft = sp.maxKg - fixedAll.reduce((s, f) => s + f.kg, 0);
  const placed: Placed[] = [];

  for (const z of zones) {
    const fixedZ = fixedAll.filter((f) => (f.zi ?? 0) === z.i);
    if (!left.length) { placed.push(...fixedZ); continue; }

    // Les pièces trop larges ou trop hautes sont placées quand même, puis signalées (permis).
    const wNeeded = Math.max(z.w, ...left.map((i) => (i.rotate ? Math.min(i.l, i.w) : i.w)));
    let shift = (wNeeded - z.w) / 2; // débordement réparti de chaque côté du plancher
    for (const f of fixedZ) shift = Math.max(shift, -f.y);
    let w = Math.max(wNeeded, z.w + 2 * shift);
    for (const f of fixedZ) w = Math.max(w, f.y + shift + f.pw);
    const h = Math.max(sp.legalH - z.z, ...left.map((i) => i.h), ...fixedZ.map((f) => f.z - z.z + f.h));

    const fixedKgZ = fixedZ.reduce((s, f) => s + f.kg, 0);
    const fixedLocal = fixedZ.map((f) => ({ ...f, x: f.x - z.x, y: f.y + shift, z: f.z - z.z }));
    const r = pack({ l: z.l, w, h, maxKg: kgLeft + fixedKgZ }, left, { sort: opts.sort, fixed: fixedLocal, floorFirst: opts.floorFirst, single: opts.single, shortFirst: opts.shortFirst });

    // Décalage uniforme : garde les pièces sans chevauchement. Si la zone a été élargie, celles du bord débordent.
    for (const p of r.placed) placed.push({ ...p, x: p.x + z.x, y: p.y - shift, z: p.z + z.z, seq: placed.length + 1, zi: z.i });
    // Les pièces qui tiennent dans la largeur du plancher sont ramenées dessus si cela ne crée pas de chevauchement.
    const zp = placed.filter((q) => q.zi === z.i);
    for (const p of zp) {
      if (p.locked || p.pw > z.w || (p.y >= 0 && p.y + p.pw <= z.w)) continue;
      const ny = Math.min(Math.max(p.y, 0), z.w - p.pw);
      const hit = zp.some((q) => q !== p && q.x < p.x + p.pl && p.x < q.x + q.pl && q.y < ny + p.pw && ny < q.y + q.pw && q.z < p.z + p.h && p.z < q.z + q.h);
      if (!hit) p.y = ny;
    }
    kgLeft -= r.cargoKg - fixedKgZ;
    left = r.rejected.map((x) => x.item);
  }

  const rejected = left.map((item) => ({
    item,
    reason: item.kg > kgLeft ? 'Charge utile dépassée' : opts.single ? 'Plus de place à la queue leu leu' : 'Aucune position valide',
  }));

  return { placed, rejected, cargoKg: placed.reduce((s, p) => s + p.kg, 0), flags: openFlags(placed, sp) };
}

// Alertes de surdimension et de débordement, recalculables après un déplacement manuel.
export function openFlags(placed: Placed[], sp: OpenSpace) {
  const totalL = Math.max(...sp.zones.map((z) => z.x + z.l));
  const flags: string[] = [];
  for (const p of placed) {
    const z = sp.zones[p.zi ?? 0];
    const over = Math.max(-p.y, p.y + p.pw - z.w);
    if (over > 0) flags.push(`${p.id} ${p.name} : déborde latéralement du plancher (${Math.round(over)} mm).`);
    if (p.pw > sp.legalW) flags.push(`${p.id} ${p.name} : largeur ${p.pw} mm > ${sp.legalW} mm, permis de surdimension requis.`);
    if (p.z + p.h > sp.legalH) flags.push(`${p.id} ${p.name} : hauteur ${p.z + p.h} mm > ${sp.legalH} mm, permis requis.`);
    if (p.x + p.pl > totalL) flags.push(`${p.id} ${p.name} : dépasse l’arrière de la remorque.`);
  }
  return flags;
}

// Arrimage selon le Guide des normes d'arrimage des charges (MTMD, éd. 2017 en anglais, pp. 13-23, 55-56) :
//  - nombre minimal d'attaches selon la longueur et le poids de la pièce (sans calage vers l'avant) :
//    <= 1,52 m : 1 (<= 500 kg) ou 2 ; 1,52 à 3,04 m : 2 ; au-delà : 2 pour les 3,04 premiers m, puis 1 par tranche de 3,04 m ou fraction ;
//  - pièce calée vers l'avant : 1 attache jusqu'à 3,04 m, puis 1 par tranche de 3,04 m ou fraction ;
//  - capacité totale des attaches >= 50 % du poids ;
//  - machine ou équipement de 4 500 kg et plus : au moins 4 attaches, chacune d'au moins 2 268 kg ;
//  - poutre frontale : hauteur >= le plus petit entre la hauteur qui bloque la pièce et 1 220 mm.
// À valider avec l'édition en vigueur (le guide est indicatif).
export type SecOpts = { wllKg: number; front?: { heightMm: number } | null; zones: { x: number; z: number }[] };
export const MACHINE_MIN_KG = 4500, MACHINE_MIN_WLL = 2268, MACHINE_MIN_N = 4;

// Rangs d'arrimage : les pièces côte à côte (ou empilées) dans la même zone sont attachées ensemble.
// Deux pièces font partie du même rang si elles se chevauchent sur au moins la moitié de la longueur de la plus courte.
// Une machine de 4 500 kg et plus reste seule (4 attaches directes), tout comme une pièce posée hors de la remorque.
const isHeavy = (p: Placed) => p.type === 'machine' && p.kg >= MACHINE_MIN_KG;
export function securementRows(placed: Placed[]): Placed[][] {
  const rows: Placed[][] = [];
  const pool = placed.filter((p) => !p.over && !isHeavy(p));
  const done = new Set<Placed>();
  for (const p of placed) {
    if (p.over || isHeavy(p)) { rows.push([p]); continue; }
    if (done.has(p)) continue;
    const row = [p];
    done.add(p);
    for (let i = 0; i < row.length; i++) {
      for (const q of pool) {
        if (done.has(q) || (q.zi ?? 0) !== (row[i].zi ?? 0)) continue;
        const o = Math.min(row[i].x + row[i].pl, q.x + q.pl) - Math.max(row[i].x, q.x);
        if (o >= 0.5 * Math.min(row[i].pl, q.pl)) { done.add(q); row.push(q); }
      }
    }
    rows.push(row);
  }
  return rows.sort((a, b) => Math.min(...a.map((p) => p.x)) - Math.min(...b.map((p) => p.x)));
}

// Une ligne par rang : le nombre d'attaches se calcule sur la longueur et le poids combinés du rang
// (2 pièces de 2 268 kg côte à côte = 4 536 kg à retenir).
export function securement(placed: Placed[], o: SecOpts) {
  const first = o.zones.reduce((bi, z, i, a) => (z.x < a[bi].x ? i : bi), 0);
  return securementRows(placed).map((row) => {
    const zi = row[0].zi ?? 0, z = o.zones[zi] ?? o.zones[0];
    const notes: string[] = [];
    let warn = false;
    const lo = Math.min(...row.map((p) => p.x)), hi = Math.max(...row.map((p) => p.x + p.pl));
    const len = hi - lo, kg = row.reduce((s, p) => s + p.kg, 0);
    const floor = row.filter((p) => Math.abs(p.z - z.z) < 5);
    // calage automatique : pièce posée sur le plancher, collée à la poutre frontale
    const autoOf = (p: Placed) => {
      if (!o.front || zi !== first || Math.abs(p.x - o.zones[first].x) > 25) return false;
      const need = Math.min(p.h, 1220);
      if (o.front.heightMm >= need) return true;
      notes.push(`${p.id} : poutre frontale trop basse (min. ${need} mm)`); warn = true;
      return false;
    };
    const autos = floor.map(autoOf);
    const auto = floor.length > 0 && autos.every(Boolean);
    const blocked = floor.length > 0 && floor.every((p, i) => !!p.blocked || autos[i]);
    if (auto) notes.push('calée contre la poutre frontale');
    else if (blocked) notes.push('calage déclaré, à confirmer');
    if (row.length > 1) notes.push(`rang de ${row.length} pièces attachées ensemble : poids combiné ${kg} kg`);
    const byLen = blocked
      ? (len <= 3040 ? 1 : 1 + Math.ceil((len - 3040) / 3040))
      : (len <= 1520 ? (kg <= 500 ? 1 : 2) : len <= 3040 ? 2 : 2 + Math.ceil((len - 3040) / 3040));
    const byWll = Math.ceil((0.5 * kg) / o.wllKg - 1e-9);
    const heavy = isHeavy(row[0]);
    const machine = row.length === 1 && row[0].type === 'machine';
    if (heavy) {
      notes.push(`machine de 4 500 kg et plus : 4 attaches minimum, chacune d'au moins ${MACHINE_MIN_WLL} kg`);
      if (o.wllKg < MACHINE_MIN_WLL) { notes.push(`attache choisie sous ${MACHINE_MIN_WLL} kg`); warn = true; }
    } else if (machine) notes.push('machine sous 4 500 kg : règles générales');
    const byType = heavy ? MACHINE_MIN_N : 0;
    const ids = row.map((p) => p.id);
    return { id: ids.join(' + '), ids, name: row.length === 1 ? row[0].name : `(rang de ${row.length} pièces)`, kg, lenMm: len,
      type: machine ? 'machine' : 'colis', blocked, auto, byLen, byWll, byType, n: Math.max(byLen, byWll, byType), notes, warn };
  });
}

export function spillDims(sp: OpenSpace) {
  const last = sp.zones.map((z, i) => ({ z, i })).sort((a, b) => b.z.x + b.z.l - (a.z.x + a.z.l))[0];
  return { l: last.z.x + last.z.l, w: sp.legalW, h: sp.legalH - last.z.z, x0: last.z.x + last.z.l, z: last.z.z, zi: last.i };
}
export function packOpenAny(sp: OpenSpace, items: Item[], opts: PackOpts = {}) {
  const r = spill(packOpen(sp, items, opts), spillDims(sp));
  return { ...r, cargoKg: r.placed.reduce((s, p) => s + p.kg, 0), flags: openFlags(r.placed, sp) };
}
