// placement-engine.ts : placement 3D en boîte + charges par essieu. Unités en mm / kg.
// Repère : x = longueur (0 = paroi avant, portes à x = L), y = largeur, z = hauteur.
// Les arrêts les plus tardifs sont chargés en premier (au fond), ceux du 1er arrêt près des portes.

export type Item = { id: string; name: string; l: number; w: number; h: number; kg: number; stackable: boolean; rotate: boolean; stop: number;
  type?: 'colis' | 'machine'; blocked?: boolean };
export type Placed = Item & { x: number; y: number; z: number; pl: number; pw: number; seq: number; zi?: number; locked?: boolean; over?: boolean; overReason?: string };
export type Space = { l: number; w: number; h: number; maxKg: number };
export type Rig = { kingpinX: number; tandemX: number; trailerTareKg: number; trailerCogX: number;
  wheelbase: number; fifthWheel: number; steerTareKg: number; driveTareKg: number };
export type Limits = { steer: number; drive: number; trailer: number };
export type PackOpts = {
  sort?: 'area' | 'kgdesc' | 'kgasc'; // critère secondaire (l'arrêt reste prioritaire)
  fixed?: Placed[];                    // pièces verrouillées, en coordonnées locales de l'espace
};

import { RegCtx, classifyRear, groupLimit } from './regulations-qc';

const ov = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

// ------------------------------------------------------------ Configurations d'essieux
// Positions des essieux du groupe arrière (mm, relatives au 1er essieu). Les limites viennent de regulations-qc.ts.
// Pour l'autovireur (E.13 / E.14) : il est DEVANT le tridem, à b = 2 750 mm du 1er essieu du tridem (guide, p. 24-25).
export type AxleCfg = { key: string; name: string; offsets: number[]; selfSteer?: boolean; axleTareKg: number };
export const AXLE_CFGS: Record<string, AxleCfg> = {
  tandem:   { key: 'tandem',   name: 'Tandem',                     offsets: [0, 1370],                  axleTareKg: 0 },
  tridem:   { key: 'tridem',   name: 'Tridem 2,4 à 3,0 m',         offsets: [0, 1370, 2740],            axleTareKg: 450 },
  tridem9:  { key: 'tridem9',  name: 'Tridem 3,0 à 3,6 m',         offsets: [0, 1650, 3300],            axleTareKg: 450 },
  tridem10: { key: 'tridem10', name: 'Tridem 3,6 à 3,7 m',         offsets: [0, 1830, 3660],            axleTareKg: 450 },
  sa13:     { key: 'sa13',     name: 'Autovireur + tridem',        offsets: [0, 2750, 4350, 5950],      selfSteer: true, axleTareKg: 950 },
  sa14:     { key: 'sa14',     name: 'Autovireur + tridem espacé', offsets: [0, 2750, 4580, 6410],      selfSteer: true, axleTareKg: 950 },
};

// Essieux qui portent : l'autovireur (1er essieu) relevé ne porte plus rien.
export const activeOffsets = (cfg: AxleCfg, lifted: boolean) => (lifted && cfg.selfSteer ? cfg.offsets.slice(1) : cfg.offsets);
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

// Adapte le montage de base (donné pour un tandem) à la configuration choisie. `front` = position du 1er essieu.
// - centroid : centre de charge du groupe (essieux actifs, charge répartie également)
// - turnX : centre de virage effectif (autovireur et essieux relevés exclus, p. 2)
export function trailerRig(base: Rig, cfg: AxleCfg, front: number, lifted: boolean, reg: RegCtx) {
  const act = activeOffsets(cfg, lifted);
  const centroid = front + mean(act);
  const physical = front + mean(cfg.offsets);
  const turnX = front + mean(cfg.selfSteer ? cfg.offsets.slice(1) : cfg.offsets);
  const tare = base.trailerTareKg + cfg.axleTareKg;
  const cog = cfg.axleTareKg ? (base.trailerTareKg * base.trailerCogX + cfg.axleTareKg * physical) / tare : base.trailerCogX;
  const cat = classifyRear(act, !!cfg.selfSteer && !lifted);
  return {
    rig: { ...base, tandemX: centroid, trailerTareKg: tare, trailerCogX: cog },
    cat,
    limit: cat ? groupLimit(cat, reg.season, act.length, reg.tires) : 0,
    count: act.length,
    centroid,
    turnX,
    lastX: front + Math.max(...cfg.offsets),
  };
}

// ------------------------------------------------------------ Validation d'un plan
// inBounds : la pièce est-elle dans l'espace permis ? floor : hauteur du plancher sous la pièce.
export function validLayout(placed: Placed[], inBounds: (p: Placed) => boolean = () => true, floor: (p: Placed) => number = () => 0) {
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    if (!inBounds(a)) return false;
    const onFloor = a.z === floor(a);
    let support = 0;
    for (let j = 0; j < placed.length; j++) {
      if (i === j) continue;
      const b = placed[j];
      const o = ov(a.x, a.x + a.pl, b.x, b.x + b.pl) * ov(a.y, a.y + a.pw, b.y, b.y + b.pw);
      if (o > 0 && a.z < b.z + b.h && a.z + a.h > b.z) return false; // collision
      if (!onFloor && o > 0 && b.z + b.h === a.z) {
        if (!b.stackable) return false;
        support += o;
      }
    }
    if (!onFloor && support < 0.7 * a.pl * a.pw) return false;       // 70 % d'appui minimum
  }
  return true;
}

// ------------------------------------------------------------ Placement
export function pack(space: Space, items: Item[], opts: PackOpts = {}) {
  const sort = opts.sort ?? 'area';
  const area = (i: Item) => i.l * i.w;
  const sec = (a: Item, b: Item) =>
    sort === 'kgdesc' ? b.kg - a.kg || area(b) - area(a)
    : sort === 'kgasc' ? a.kg - b.kg || area(b) - area(a)
    : area(b) - area(a) || b.kg - a.kg;
  const order = [...items].sort((a, b) => b.stop - a.stop || sec(a, b));

  const fixed = opts.fixed ?? [];
  const placed: Placed[] = [...fixed];
  const rejected: { item: Item; reason: string }[] = [];
  const eps: [number, number, number][] = [[0, 0, 0]];
  for (const f of fixed) eps.push([f.x + f.pl, f.y, f.z], [f.x, f.y + f.pw, f.z], [f.x, f.y, f.z + f.h]);
  let kg = fixed.reduce((s, f) => s + f.kg, 0);

  for (const it of order) {
    if (kg + it.kg > space.maxKg) { rejected.push({ item: it, reason: 'Charge utile dépassée' }); continue; }
    const rots: [number, number][] = it.rotate && it.l !== it.w ? [[it.l, it.w], [it.w, it.l]] : [[it.l, it.w]];

    const fits = (p: number[], pl: number, pw: number) => {
      const [x, y, z] = p;
      if (x + pl > space.l || y + pw > space.w || z + it.h > space.h) return false;
      let support = 0;
      for (const b of placed) {
        const o = ov(x, x + pl, b.x, b.x + b.pl) * ov(y, y + pw, b.y, b.y + b.pw);
        if (o > 0 && z < b.z + b.h && z + it.h > b.z) return false;       // collision
        if (z > 0 && b.z + b.h === z) { if (o > 0 && !b.stackable) return false; support += o; }
      }
      return z === 0 || support >= 0.7 * pl * pw;
    };

    eps.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
    let hit: { p: number[]; pl: number; pw: number } | null = null;
    outer: for (const p of eps) for (const [pl, pw] of rots) if (fits(p, pl, pw)) { hit = { p, pl, pw }; break outer; }

    if (!hit) { rejected.push({ item: it, reason: 'Aucune position valide' }); continue; }
    const [x, y, z] = hit.p;
    placed.push({ ...it, x, y, z, pl: hit.pl, pw: hit.pw, seq: placed.length + 1 });
    kg += it.kg;
    eps.push([x + hit.pl, y, z], [x, y + hit.pw, z], [x, y, z + it.h]);
  }
  return { placed, rejected, cargoKg: kg };
}

// ------------------------------------------------------------ Charges par essieu
// Équilibre de moments : groupe d'essieux de la remorque, attelage (kingpin), puis essieux du tracteur.
// rig.tandemX = centre du groupe d'essieux actifs (voir trailerRig).
export function axles(placed: Placed[], rig: Rig, lim: Limits, grp: { name: string; count: number } = { name: 'Tandem', count: 2 }) {
  const cargo = placed.reduce((s, p) => s + p.kg, 0);
  const moment = placed.reduce((s, p) => s + p.kg * (p.x + p.pl / 2), 0) + rig.trailerTareKg * rig.trailerCogX;
  const total = cargo + rig.trailerTareKg;
  const group = (moment - total * rig.kingpinX) / (rig.tandemX - rig.kingpinX);
  const kingpin = total - group;
  const steerShare = (kingpin * (rig.wheelbase - rig.fifthWheel)) / rig.wheelbase;
  const steer = rig.steerTareKg + steerShare;
  const drive = rig.driveTareKg + kingpin - steerShare;
  const row = (name: string, kg: number, limit: number) => ({ name, kg: Math.round(kg), limit, ok: kg <= limit && kg >= 0 });
  return {
    cargoKg: cargo,
    cogX: cargo ? placed.reduce((s, p) => s + p.kg * (p.x + p.pl / 2), 0) / cargo : 0,
    rows: [
      row('Direction (tracteur)', steer, lim.steer),
      row('Motrice (tracteur)', drive, lim.drive),
      { ...row(`${grp.name} (remorque)`, group, lim.trailer), perAxle: Math.round(group / grp.count) },
    ],
    gross: Math.round(total + rig.steerTareKg + rig.driveTareKg),
  };
}

// Aucune pièce n'est refusée : celles qui ne rentrent pas sont posées derrière l'arrière de la remorque,
// marquées `over`, et signalées en rouge par l'application (dimensions ou poids dépassés).
export type SpillDims = { l: number; w: number; h: number; x0: number; z: number; zi?: number };
export function spill<R extends { placed: Placed[]; rejected: { item: Item; reason: string }[] }>(r: R, d: SpillDims): R {
  if (!r.rejected.length) return r;
  let cx = d.x0 + 300, seq = r.placed.length;
  const extra: Placed[] = r.rejected.map(({ item }) => {
    const why: string[] = [];
    if (item.l > d.l) why.push('longueur');
    if ((item.rotate ? Math.min(item.w, item.l) : item.w) > d.w) why.push('largeur');
    if (item.h > d.h) why.push('hauteur');
    const p: Placed = { ...item, x: cx, y: 0, z: d.z, pl: item.l, pw: item.w, seq: ++seq, zi: d.zi, over: true,
      overReason: why.length ? 'dépasse en ' + why.join(', ') : 'espace insuffisant' };
    cx += item.l + 200;
    return p;
  });
  return { ...r, placed: [...r.placed, ...extra], rejected: [] };
}
export function packAny(space: Space, items: Item[], opts: PackOpts = {}) {
  return spill(pack(space, items, opts), { l: space.l, w: space.w, h: space.h, x0: space.l, z: 0 });
}

// Centrage latéral par défaut : une pièce (avec ce qui est empilé dessus) qui n'a aucune autre pièce
// à côté d'elle (même plage de x) est centrée sur la largeur du plancher. Les pièces fixées à la main sont laissées telles quelles.
export function centerY(placed: Placed[], zones: { z: number; w: number }[]): void {
  const byZone = new Map<number, Placed[]>();
  for (const p of placed) {
    if (p.over) continue;
    const k = p.zi ?? 0;
    (byZone.get(k) ?? byZone.set(k, []).get(k)!).push(p);
  }
  for (const [zi, ps] of byZone) {
    const zn = zones[zi] ?? zones[0];
    if (!zn) continue;
    const left = new Set(ps);
    while (left.size) {
      const cl: Placed[] = [];
      const first = left.values().next().value as Placed;
      left.delete(first);
      cl.push(first);
      for (let i = 0; i < cl.length; i++) {
        for (const q of [...left]) {
          if (q.x < cl[i].x + cl[i].pl && cl[i].x < q.x + q.pl) { left.delete(q); cl.push(q); }
        }
      }
      if (cl.some((p) => p.locked)) continue;
      const floor = cl.filter((p) => p.z <= zn.z + 5);
      if (floor.length !== 1) continue;
      const d = (zn.w - floor[0].pw) / 2 - floor[0].y;
      if (Math.abs(d) < 1) continue;
      for (const p of cl) p.y = Math.round(p.y + d);
    }
  }
}
