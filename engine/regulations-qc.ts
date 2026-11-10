// regulations-qc.ts : règles de charges et dimensions, Québec.
// Source : « Guide des normes de charges et dimensions des véhicules routiers », Édition 2026,
// ministère des Transports et de la Mobilité durable. Le guide est INDICATIF : le règlement fait foi.
// Les références (p. xx) sont les numéros de page imprimés du guide. Unités : mm et kg.
// Portée : tracteur + semi-remorque de type 1 (section 3.1.6, tableau 1, tableau 2 V.19 à V.27).

export const RULES_SOURCE = 'Guide des normes de charges et dimensions, édition 2026 (MTMD Québec)';
export type Season = 'normal' | 'degel';
// 'single' = pneus simples non « bande large » : HYPOTHÈSE, voir groupLimit().
export type Tires = 'dual' | 'single' | 'wide';
export type RegCtx = { season: Season; tires: Tires; steerRated: number };

// ------------------------------------------------------------ Tableau 1 : charge axiale (p. 24-25)
export type AxleCat = { id: string; label: string; normal: number; degel: number };
const c = (id: string, label: string, normal: number, degel: number): [string, AxleCat] => [id, { id, label, normal, degel }];
export const CATS: Record<string, AxleCat> = Object.fromEntries([
  c('E.1', 'Directeur simple', 9000, 9000),
  c('E.4', 'Essieu simple', 10000, 8000),
  c('E.5', 'Tandem d < 1,2 m', 10000, 8000),
  c('E.6', 'Tandem', 18000, 15500),
  c('E.8', 'Tridem 2,4 à 3,0 m', 21000, 18000),
  c('E.9', 'Tridem 3,0 à 3,6 m', 24000, 21000),
  c('E.10', 'Tridem 3,6 à 3,7 m', 26000, 22000),
  c('E.11', '3 essieux d < 1,2 m', 10000, 8000),
  c('E.12', '3 essieux d ≥ 1,2 m', 18000, 15500),
  c('E.13', 'Autovireur + tridem', 32000, 27500),
  c('E.14', 'Autovireur + tridem espacé', 34000, 29500),
]);

// Catégorie d'un groupe d'essieux arrière, à partir des positions des essieux (mm, relatives au 1er essieu).
// d = écartement (centre du 1er au centre du dernier essieu). Pour E.13 / E.14 (autovireur DEVANT le tridem) :
// b = distance autovireur → 1er essieu du tridem (2,5 < b ≤ 3,0 m), c = écartement du tridem.
// Retourne null si la configuration est hors des catégories du guide.
export function classifyRear(offsets: number[], selfSteerFront = false): AxleCat | null {
  const o = [...offsets].sort((a, b) => a - b), n = o.length, spread = o[n - 1] - o[0];
  if (n === 1) return CATS['E.4'];
  if (n === 2) return spread < 1200 ? CATS['E.5'] : CATS['E.6'];
  if (n === 3) {
    if (spread < 1200) return CATS['E.11'];
    if (spread < 2400) return CATS['E.12'];
    if (spread < 3000) return CATS['E.8'];
    if (spread < 3600) return CATS['E.9'];
    return spread <= 3700 ? CATS['E.10'] : null;
  }
  if (n === 4 && selfSteerFront) {
    const b = o[1] - o[0], cc = o[3] - o[1];
    if (b > 2500 && b <= 3000) {
      if (cc >= 3000 && cc < 3600) return CATS['E.13'];
      if (cc >= 3600 && cc <= 3700) return CATS['E.14'];
    }
  }
  return null;
}

// Limite d'un groupe arrière selon la saison (p. 24) et l'article 4.2.4 (p. 26).
// L'article 4.2.4 impose −1 000 kg par essieu (E.4 à E.20), sauf essieu à pneus « bande large » et sauf
// l'autovireur de E.13 (pneus ≥ 365 mm) / E.14 (≥ 385 mm). Le guide n'énonce pas la condition qui déclenche
// cette réduction ; ses exemptions sont les mêmes que celles de la règle des pneus simples (10 kg/mm, art. 4.1).
// On l'applique donc aux pneus SIMPLES non « bande large » (tires = 'single'), à faire confirmer dans le règlement.
export function groupLimit(cat: AxleCat, season: Season, activeAxles: number, tires: Tires) {
  const base = season === 'degel' ? cat.degel : cat.normal;
  if (tires !== 'single') return base;
  const exempt = cat.id === 'E.13' || cat.id === 'E.14' ? 1 : 0;
  return base - 1000 * Math.max(0, activeAxles - exempt);
}

// Tracteur à tandem arrière (6x4) : direction E.1, motrice E.6.
// Direction : limite 9 000 kg (tableau 1), mais capacité retenue = la plus élevée entre 5 500 kg et le PNBE de l'essieu (art. 4.1, p. 23).
// Pour la masse totale, l'essieu avant compte au plus 5 500 kg (art. 5.1, p. 27).
export function tractorLimits(reg: RegCtx) {
  return {
    steer: Math.min(9000, Math.max(5500, reg.steerRated)),
    steerCap: 5500,
    drive: groupLimit(CATS['E.6'], reg.season, 2, reg.tires),
  };
}

// ------------------------------------------------------------ Tableau 2 : masse totale en charge (p. 30)
// « a » = distance entre le dernier essieu du tracteur et le premier essieu du groupe arrière de la semi
// (autovireur compris), lue sur les schémas V.25 à V.27 : à confirmer dans le règlement.
type Row = { id: string; tractor: 'single' | 'tandem'; semi: string; max: number; minA?: number };
const TABLE2: Row[] = [
  { id: 'V.19', tractor: 'single', semi: 'E.4', max: 25500 },
  { id: 'V.20', tractor: 'tandem', semi: 'E.4', max: 35500 },
  { id: 'V.20', tractor: 'single', semi: 'E.6', max: 35500 },
  { id: 'V.21', tractor: 'tandem', semi: 'E.6', max: 41500, minA: 4000 },
  { id: 'V.22', tractor: 'tandem', semi: 'E.8', max: 44500, minA: 4000 },
  { id: 'V.23', tractor: 'tandem', semi: 'E.9', max: 47500, minA: 4500 },
  { id: 'V.24', tractor: 'tandem', semi: 'E.10', max: 49500, minA: 5500 },
  { id: 'V.26', tractor: 'tandem', semi: 'E.13', max: 55500, minA: 6000 },
  { id: 'V.27', tractor: 'tandem', semi: 'E.14', max: 57500, minA: 5500 },
];

// Lecture du tableau : la 2e ligne (a < distance prescrite) porte déjà −1 000 kg, puis −1 000 kg par tranche
// complète de 0,5 m sous la distance prescrite (note 1). Hors catégories : V.60 = 41 500 kg.
// Limite finale = la plus petite entre le tableau 2 et la somme des charges axiales maximales (art. 5.1).
export function grossLimit(tractor: 'single' | 'tandem', semiCat: string | null, a: number, axleSum: number) {
  const row = semiCat ? TABLE2.find((r) => r.tractor === tractor && r.semi === semiCat) : undefined;
  let tableMax = row ? row.max : 41500;
  if (row && row.minA && a < row.minA) tableMax -= 1000 + 1000 * Math.floor((row.minA - a) / 500);
  return { id: row ? row.id : 'V.60', tableMax, minA: row?.minA, byAxles: axleSum, limit: Math.min(tableMax, axleSum) };
}

// ------------------------------------------------------------ Dimensions : tracteur / semi-remorque type 1 (3.1.6, p. 9)
// Empattement maximal de la semi selon l'empattement du tracteur B (mm).
const SEMI_EMP: [number, number][] = [[6200, 12500], [6300, 12470], [6400, 12400], [6500, 12330], [6600, 12270], [6700, 12200],
  [6800, 12130], [6900, 12070], [7000, 12000], [7100, 11930], [7200, 11870]];
export function semiWheelbaseMax(B: number) {
  for (const [b, m] of SEMI_EMP) if (B <= b) return m;
  return 0;
}

export type Check = { code: string; severity: 'warning' | 'error'; message: string; ref: string };

export type SemiGeom = {
  L: number;          // longueur de la semi (du nez à l'arrière)
  kingpinX: number;   // pivot d'attelage, depuis le nez
  turnX: number;      // centre de virage effectif (autovireurs et essieux relevés exclus)
  lastAxleX: number;  // dernier essieu
  B: number;          // empattement du tracteur
  loadMinX: number;
  loadMaxX: number;
};

export function semiChecks(g: SemiGeom): Check[] {
  const out: Check[] = [];
  const emp = g.turnX - g.kingpinX;
  const maxEmp = semiWheelbaseMax(g.B);
  const front = Math.min(0, g.loadMinX), rear = Math.max(g.L, g.loadMaxX);
  const m = (v: number) => (v / 1000).toFixed(2).replace('.', ',');
  if (g.lastAxleX > g.L) out.push({ code: 'AXLE_BEYOND', severity: 'error', ref: 'p. 9',
    message: `Configuration d'essieux trop longue : dernier essieu à ${m(g.lastAxleX)} m, remorque de ${m(g.L)} m.` });
  if (emp > maxEmp) out.push({ code: 'SEMI_WHEELBASE', severity: 'error', ref: '§3.1.6, p. 9',
    message: `Empattement de la semi ${m(emp)} m > ${m(maxEmp)} m (tracteur de ${m(g.B)} m).` });
  if (rear - front > 16200) out.push({ code: 'SEMI_LENGTH', severity: 'error', ref: '§3.1.6, p. 9',
    message: `Longueur de la semi, charge comprise, ${m(rear - front)} m > 16,20 m.` });
  if (g.kingpinX - front > 2000) out.push({ code: 'KINGPIN_OFFSET', severity: 'error', ref: '§3.1.6, p. 9',
    message: `Décalage du pivot d'attelage ${m(g.kingpinX - front)} m > 2,00 m.` });
  if (rear - g.turnX > 0.35 * emp) out.push({ code: 'REAR_OVERHANG', severity: 'error', ref: '§3.1.6, p. 9',
    message: `Porte-à-faux arrière effectif ${m(rear - g.turnX)} m > 35 % de l'empattement (${m(0.35 * emp)} m).` });
  return out;
}

// Plage permise du centre de virage effectif : empattement ≤ max, et porte-à-faux arrière ≤ 35 % de l'empattement.
export function turnRange(L: number, kingpinX: number, B: number): [number, number] {
  return [(L + 0.35 * kingpinX) / 1.35, kingpinX + semiWheelbaseMax(B)];
}
