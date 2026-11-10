// balance.ts : évaluation réglementaire et équilibrage automatique. Unités en mm / kg.
//
// evaluate() : charges par essieu (tableau 1), masse totale (tableau 2) et dimensions (3.1.6) pour un plan donné.
// Équilibrage (déterministe, rapide) :
//   1. on place les pièces avec 3 ordres de remplissage (grandes d'abord, lourdes d'abord, légères d'abord) ;
//      l'ordre de livraison (arrêts) reste toujours prioritaire pour les boîtes fermées ;
//   2. pour chaque position possible des essieux, on décale chaque zone en bloc le long de la remorque
//      (les relations d'empilage sont conservées, chaque décalage est revalidé) ;
//   3. on garde le plan qui place le plus de pièces, puis qui minimise les dépassements réglementaires.
// Les pièces verrouillées (placées à la main) ne bougent jamais.

import { Item, Placed, Space, Rig, AxleCfg, pack, spill, axles, trailerRig, validLayout } from './placement-engine';
import { packOpen, openFlags, spillDims, OpenSpace } from './open-deck-engine';
import { RegCtx, Check, tractorLimits, grossLimit, semiChecks, turnRange } from './regulations-qc';

export type Ctx = {
  base: Rig;                 // montage de base (tracteur 6x4 + remorque tandem)
  cfg: AxleCfg;              // essieux de la remorque
  lifted: boolean;           // autovireur relevé
  reg: RegCtx;               // saison, pneus, PNBE de la direction
  L: number;                 // longueur de la remorque (du nez à l'arrière)
  slide: [number, number];   // plage de position du 1er essieu du groupe arrière
  override?: boolean;        // true : aucune pièce refusée, celles qui dépassent sont posées hors de la remorque
};

const TRACTOR_TANDEM_SPACING = 1370;

export function evaluate(placed: Placed[], ctx: Ctx, front: number) {
  const t = trailerRig(ctx.base, ctx.cfg, front, ctx.lifted, ctx.reg);
  const tl = tractorLimits(ctx.reg);
  const a = axles(placed, t.rig, { steer: tl.steer, drive: tl.drive, trailer: t.limit }, { name: ctx.cfg.name, count: t.count });
  a.rows[0].name = 'Direction (E.1)';
  a.rows[1].name = 'Motrice (E.6)';
  a.rows[2].name = `${ctx.cfg.name} (${t.cat ? t.cat.id : 'hors catégorie'})`;

  // « a » : dernier essieu du tracteur → 1er essieu du groupe arrière de la semi (tableau 2, p. 30)
  const tractorLastX = ctx.base.kingpinX + (ctx.base.wheelbase - ctx.base.fifthWheel) + TRACTOR_TANDEM_SPACING / 2;
  const dist = front - tractorLastX;
  const g = grossLimit('tandem', t.cat ? t.cat.id : null, dist, tl.steerCap + tl.drive + t.limit);

  const checks: Check[] = semiChecks({
    L: ctx.L, kingpinX: ctx.base.kingpinX, turnX: t.turnX, lastAxleX: t.lastX, B: ctx.base.wheelbase,
    loadMinX: placed.length ? Math.min(...placed.map((p) => p.x)) : 0,
    loadMaxX: placed.length ? Math.max(...placed.map((p) => p.x + p.pl)) : 0,
  });
  if (!t.cat) checks.push({ code: 'NO_CATEGORY', severity: 'error', ref: 'Tableau 1, p. 24-25',
    message: 'Configuration d’essieux hors des catégories du guide (écartement non prévu).' });

  return {
    rows: a.rows, cargoKg: a.cargoKg, cogX: a.cogX, cat: t.cat, checks, turnX: t.turnX,
    gross: { kg: a.gross, limit: g.limit, tableMax: g.tableMax, id: g.id, minA: g.minA, a: dist },
  };
}

// Pénalise fortement tout dépassement, puis cherche la plus faible utilisation maximale.
export function score(placed: Placed[], ctx: Ctx, front: number) {
  const e = evaluate(placed, ctx, front);
  let s = 0, mx = 0;
  for (const r of e.rows) {
    if (r.kg > r.limit) s += (r.kg - r.limit) * 1000;
    if (r.kg < 0) s += -r.kg * 1000;
    mx = Math.max(mx, r.kg / Math.max(1, r.limit));
  }
  if (e.gross.kg > e.gross.limit) s += (e.gross.kg - e.gross.limit) * 1000;
  s += e.checks.filter((c) => c.severity === 'error').length * 1e5;
  return s + mx;
}

// Plage de position du 1er essieu : empattement de la semi ≤ max, porte-à-faux ≤ 35 %, essieux dans la remorque.
export function slideRange(ctx: Omit<Ctx, 'slide'>): [number, number] {
  const o = ctx.cfg.offsets, turn = ctx.cfg.selfSteer ? o.slice(1) : o;
  const turnOff = turn.reduce((s, v) => s + v, 0) / turn.length;
  const [tLo, tHi] = turnRange(ctx.L, ctx.base.kingpinX, ctx.base.wheelbase);
  let lo = Math.max(tLo - turnOff, ctx.base.kingpinX + 600);
  let hi = Math.min(tHi - turnOff, ctx.L - 300 - Math.max(...o));
  if (hi < lo) hi = lo; // impossible sur cette remorque : evaluate() le signale
  return [Math.round(lo), Math.round(hi)];
}

function slides(ctx: Ctx, step = 300) {
  const [a, b] = ctx.slide;
  const out = new Set<number>();
  for (let v = a; v <= b; v += step) out.add(Math.round(v));
  out.add(Math.round(b));
  return [...out];
}

// Décale chaque zone en bloc (pièces non verrouillées) pour minimiser le score.
function shiftOptimize(
  placed: Placed[],
  zones: { x: number; l: number }[],
  ev: (p: Placed[]) => number,
  floor: (p: Placed) => number,
  step = 200,
) {
  let cur = placed.map((p) => ({ ...p }));
  let best = ev(cur);
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (let zi = 0; zi < zones.length; zi++) {
      const idx = new Set<number>();
      cur.forEach((p, i) => { if ((p.zi ?? 0) === zi && !p.locked && !p.over) idx.add(i); });
      if (!idx.size) continue;
      const g = [...idx].map((i) => cur[i]);
      const lo = zones[zi].x - Math.min(...g.map((p) => p.x));
      const hi = zones[zi].x + zones[zi].l - Math.max(...g.map((p) => p.x + p.pl));
      if (hi < lo) continue;
      const cand = new Set<number>([Math.round(lo), Math.round(hi)]);
      for (let d = lo; d <= hi; d += step) cand.add(Math.round(d));
      let bestD = 0;
      for (const d of cand) {
        if (d === 0) continue;
        const trial = cur.map((p, i) => (idx.has(i) ? { ...p, x: p.x + d } : p));
        if (!validLayout(trial, () => true, floor)) continue;
        const s = ev(trial);
        if (s < best - 1e-9) { best = s; bestD = d; }
      }
      if (bestD) { cur = cur.map((p, i) => (idx.has(i) ? { ...p, x: p.x + bestD } : p)); moved = true; }
    }
    if (!moved) break;
  }
  return { placed: cur, score: best };
}


// Petites unités : étale les rangées de pièces sur toute la longueur de chaque zone (écarts égaux, y compris aux extrémités)
// pour répartir le poids également. Les rangées gardent leur ordre (donc l'ordre de livraison). Appliqué seulement si toutes les
// rangées de la zone sont courtes et qu'aucune pièce n'est verrouillée ; refusé si le résultat est moins conforme.
const SMALL_ROW_MM = 2000;
export function spreadSmall(
  placed: Placed[],
  zones: { x: number; l: number }[],
  ctx: Ctx,
  front: number,
  floor: (p: Placed) => number,
): { placed: Placed[]; front: number } {
  let cur = placed.map((p) => ({ ...p }));
  let changed = false;
  for (let zi = 0; zi < zones.length; zi++) {
    const ps = cur.filter((p) => (p.zi ?? 0) === zi && !p.over);
    if (ps.length < 2 || ps.some((p) => p.locked)) continue;
    const left = new Set(ps), rows: Placed[][] = [];
    while (left.size) {
      const first = left.values().next().value as Placed;
      left.delete(first);
      const cl = [first];
      for (let i = 0; i < cl.length; i++) for (const q of [...left]) if (q.x < cl[i].x + cl[i].pl && cl[i].x < q.x + q.pl) { left.delete(q); cl.push(q); }
      rows.push(cl);
    }
    const ext = rows.map((r) => ({ r, lo: Math.min(...r.map((p) => p.x)), hi: Math.max(...r.map((p) => p.x + p.pl)) }));
    if (ext.length < 2 || ext.some((e) => e.hi - e.lo > SMALL_ROW_MM)) continue;
    ext.sort((a, b) => a.lo - b.lo);
    const used = ext.reduce((s, e) => s + (e.hi - e.lo), 0), free = zones[zi].l - used;
    if (free <= 0) continue;
    const gap = free / (ext.length + 1);
    let x = zones[zi].x + gap;
    for (const e of ext) {
      const d = Math.round((x - e.lo) / 10) * 10;
      for (const p of e.r) p.x += d;
      x += e.hi - e.lo + gap;
    }
    changed = true;
  }
  if (!changed || !validLayout(cur, () => true, floor)) return { placed, front };
  const s1 = score(placed, ctx, front);
  let bf = front, bs = Infinity;
  for (const f of slides(ctx)) { const s = score(cur, ctx, f); if (s < bs) { bs = s; bf = f; } }
  return Math.floor(bs) <= Math.floor(s1) ? { placed: cur, front: bf } : { placed, front };
}

type Best = { pen: number; placed: Placed[]; rejected: { item: Item; reason: string }[]; front: number };
const SORTS = ['area', 'kgdesc', 'kgasc'] as const;

// Boîte fermée : conteneur, remorque fermée. `items` = pièces à placer (non verrouillées), `locked` = déjà placées à la main.
export function balanceClosed(space: Space, items: Item[], locked: Placed[], ctx: Ctx) {
  let best: Best | null = null;
  for (const sort of SORTS) {
    const packed = pack(space, items, { sort, fixed: locked });
    const base = ctx.override ? spill(packed, { l: space.l, w: space.w, h: space.h, x0: space.l, z: 0 }) : packed;
    for (const front of slides(ctx)) {
      const r = shiftOptimize(base.placed, [{ x: 0, l: space.l }], (p) => score(p, ctx, front), () => 0);
      const pen = r.score + base.rejected.length * 1e8; // d'abord placer le plus de pièces
      if (!best || pen < best.pen) best = { pen, placed: r.placed, rejected: base.rejected, front };
    }
  }
  const b = best as Best;
  const sp2 = spreadSmall(b.placed, [{ x: 0, l: space.l }], ctx, b.front, () => 0);
  return { placed: sp2.placed, rejected: b.rejected, front: sp2.front, flags: [] as string[] };
}

// Plateau, step deck, fardier : mêmes principes, par zone.
export function balanceOpen(sp: OpenSpace, items: Item[], locked: Placed[], ctx: Ctx) {
  const zones = sp.zones.map((z) => ({ x: z.x, l: z.l }));
  const floor = (p: Placed) => sp.zones[p.zi ?? 0].z;
  let best: Best | null = null;
  for (const sort of SORTS) {
    const packed = packOpen(sp, items, { sort, fixed: locked });
    const base = ctx.override ? spill(packed, spillDims(sp)) : packed;
    for (const front of slides(ctx)) {
      const r = shiftOptimize(base.placed, zones, (p) => score(p, ctx, front), floor);
      const pen = r.score + base.rejected.length * 1e8;
      if (!best || pen < best.pen) best = { pen, placed: r.placed, rejected: base.rejected, front };
    }
  }
  const b = best as Best;
  const sp2 = spreadSmall(b.placed, zones, ctx, b.front, floor);
  return { placed: sp2.placed, rejected: b.rejected, front: sp2.front, flags: openFlags(sp2.placed, sp) };
}
