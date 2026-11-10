// load-space.schema.ts
// Extension du schéma Drizzle pour couvrir conteneurs, remorques fermées,
// plateaux et fardiers avec un modèle unique : Equipment -> Zones.
// Unités : millimètres (mm) et kilogrammes (kg), entiers partout.
// Repère remorque : x = longueur (0 = avant / face au tracteur ou paroi avant),
//                   y = largeur (0 = côté gauche), z = hauteur (0 = sol).

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  real,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ---------------------------------------------------------------- Enums

export const equipmentKind = pgEnum('equipment_kind', [
  'container',     // 20', 40', 40' HC, 45'
  'container_ot',  // open top
  'flat_rack',     // flat rack (OOG)
  'dry_van',       // remorque fermée 48' / 53'
  'flatbed',       // plateau
  'step_deck',     // plateau surbaissé à 2 niveaux
  'double_drop',   // fardier à puits
  'rgn',           // fardier à col de cygne amovible
  'chassis',       // châssis porte-conteneur
  'tractor',       // tracteur routier
]);

export const zoneKind = pgEnum('zone_kind', [
  'cargo_box',   // volume fermé (conteneur, van)
  'deck',        // plancher ouvert
  'well',        // puits (double drop / RGN)
  'upper_deck',  // niveau haut du step deck
  'gooseneck',   // zone col de cygne (non chargeable ou limitée)
]);

export const axleRole = pgEnum('axle_role', [
  'tractor_steer',
  'tractor_drive',
  'trailer_group',
  'dolly_group',
]);

export const equipmentRole = pgEnum('equipment_role', [
  'tractor',
  'trailer',
  'chassis',
  'container',
]);

export const planStatus = pgEnum('plan_status', [
  'draft',
  'validated',
  'issues',     // dépassements ou alertes bloquantes
  'released',
]);

export const itemShape = pgEnum('item_shape', ['box', 'cylinder', 'custom']);

// ------------------------------------------------- Catalogue d'équipements

export const equipmentTypes = pgTable(
  'equipment_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: equipmentKind('kind').notNull(),
    name: text('name').notNull(),            // ex. "Conteneur 40' HC"
    code: text('code').notNull(),            // ex. "CNT-40HC" (unique)
    // Dimensions extérieures hors tout
    lengthMm: integer('length_mm').notNull(),
    widthMm: integer('width_mm').notNull(),
    heightMm: integer('height_mm'),          // null pour les plateaux (voir deck)
    deckHeightMm: integer('deck_height_mm'), // hauteur du plancher / sol
    tareKg: integer('tare_kg').notNull(),
    maxPayloadKg: integer('max_payload_kg').notNull(),
    // Attelage : distance avant -> pivot d'attelage (kingpin), remorques seulement
    kingpinXMm: integer('kingpin_x_mm'),
    // Tandem coulissant : plage de déplacement des essieux arrière
    tandemSlideMinMm: integer('tandem_slide_min_mm'),
    tandemSlideMaxMm: integer('tandem_slide_max_mm'),
    // Portes (fermées) : chargement par l'arrière, ouverture utile
    doorWidthMm: integer('door_width_mm'),
    doorHeightMm: integer('door_height_mm'),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    codeUq: uniqueIndex('equipment_types_code_uq').on(t.code),
    kindIdx: index('equipment_types_kind_idx').on(t.kind),
  }),
);

// Zones chargeables d'un équipement : 1 pour un plateau, 2 pour un step deck, 3 pour un double drop
export const equipmentZones = pgTable(
  'equipment_zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    equipmentTypeId: uuid('equipment_type_id')
      .notNull()
      .references(() => equipmentTypes.id, { onDelete: 'cascade' }),
    kind: zoneKind('kind').notNull(),
    name: text('name').notNull(),
    // Origine et taille de la zone dans le repère de l'équipement
    originXMm: integer('origin_x_mm').notNull(),
    originYMm: integer('origin_y_mm').notNull().default(0),
    originZMm: integer('origin_z_mm').notNull(),
    lengthMm: integer('length_mm').notNull(),
    widthMm: integer('width_mm').notNull(),
    // Hauteur libre disponible. Fermé : hauteur intérieure.
    // Ouvert : null, la limite vient de la hauteur légale de la juridiction.
    clearHeightMm: integer('clear_height_mm'),
    enclosed: boolean('enclosed').notNull().default(false),
    loadable: boolean('loadable').notNull().default(true),
    maxFloorLoadKgPerM2: integer('max_floor_load_kg_per_m2'),
    maxZoneLoadKg: integer('max_zone_load_kg'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    eqIdx: index('equipment_zones_eq_idx').on(t.equipmentTypeId),
  }),
);

// Groupes d'essieux : servent au calcul de répartition des charges
export const axleGroups = pgTable(
  'axle_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    equipmentTypeId: uuid('equipment_type_id')
      .notNull()
      .references(() => equipmentTypes.id, { onDelete: 'cascade' }),
    role: axleRole('role').notNull(),
    name: text('name').notNull(),
    axleCount: integer('axle_count').notNull(),
    // Position du centre du groupe depuis l'avant de l'équipement
    xMm: integer('x_mm').notNull(),
    // Écartement entre essieux du groupe (pour les limites de type "formule")
    spreadMm: integer('spread_mm'),
    // Limite constructeur ; les limites légales viennent de la juridiction
    maxKg: integer('max_kg').notNull(),
    slidable: boolean('slidable').notNull().default(false),
  },
  (t) => ({
    eqIdx: index('axle_groups_eq_idx').on(t.equipmentTypeId),
  }),
);

// -------------------------------------------------------------- Pièces

export const cargoItems = pgTable(
  'cargo_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => loadPlans.id, { onDelete: 'cascade' }),
    reference: text('reference'),            // n° de pièce ou de commande Fives
    name: text('name').notNull(),
    shape: itemShape('shape').notNull().default('box'),
    lengthMm: integer('length_mm').notNull(),
    widthMm: integer('width_mm').notNull(),
    heightMm: integer('height_mm').notNull(),
    weightKg: real('weight_kg').notNull(),
    quantity: integer('quantity').notNull().default(1),
    // Centre de gravité en fraction des dimensions (0.5 = centré)
    cogXRatio: real('cog_x_ratio').notNull().default(0.5),
    cogYRatio: real('cog_y_ratio').notNull().default(0.5),
    cogZRatio: real('cog_z_ratio').notNull().default(0.5),
    // Contraintes de placement
    // Indices de rotation autorisés (0..5 = les 6 orientations d'une boîte)
    allowedRotations: jsonb('allowed_rotations')
      .$type<number[]>()
      .notNull()
      .default(sql`'[0,1]'::jsonb`),
    stackable: boolean('stackable').notNull().default(false),
    maxLoadOnTopKg: integer('max_load_on_top_kg'),
    fragile: boolean('fragile').notNull().default(false),
    // Séquence : arrêt de livraison (1 = premier à décharger)
    deliveryStop: integer('delivery_stop').notNull().default(1),
    // Appuis : surface de contact réelle (pour charge au plancher)
    contactAreaMm2: integer('contact_area_mm2'),
    securementNotes: text('securement_notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    planIdx: index('cargo_items_plan_idx').on(t.planId),
  }),
);

// ----------------------------------------------- Plans de chargement

export const loadPlans = pgTable(
  'load_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    status: planStatus('status').notNull().default('draft'),
    // Code de la juridiction pour la validation (ex. "CA-QC", "US-VT", "US-NY").
    // Référence la table réglementaire existante par code.
    jurisdictionCode: text('jurisdiction_code').notNull().default('CA-QC'),
    // Mode saisonnier (dégel, etc.) : variante appliquée par le validateur
    seasonalMode: text('seasonal_mode'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
);

// Équipements assemblés dans un plan : tracteur + remorque, ou tracteur + châssis + conteneur
export const planEquipment = pgTable(
  'plan_equipment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => loadPlans.id, { onDelete: 'cascade' }),
    equipmentTypeId: uuid('equipment_type_id')
      .notNull()
      .references(() => equipmentTypes.id),
    role: equipmentRole('role').notNull(),
    // Décalage x de cet équipement dans l'assemblage (ex. conteneur sur châssis)
    offsetXMm: integer('offset_x_mm').notNull().default(0),
    // Position du tandem coulissant dans sa plage
    tandemSlideMm: integer('tandem_slide_mm'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    planIdx: index('plan_equipment_plan_idx').on(t.planId),
  }),
);

// Placement d'une pièce (ou d'une unité d'une pièce) dans une zone
export const placements = pgTable(
  'placements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => loadPlans.id, { onDelete: 'cascade' }),
    cargoItemId: uuid('cargo_item_id')
      .notNull()
      .references(() => cargoItems.id, { onDelete: 'cascade' }),
    unitIndex: integer('unit_index').notNull().default(0), // 0..quantity-1
    planEquipmentId: uuid('plan_equipment_id')
      .notNull()
      .references(() => planEquipment.id, { onDelete: 'cascade' }),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => equipmentZones.id),
    // Coin minimal de la boîte, repère de l'équipement
    xMm: integer('x_mm').notNull(),
    yMm: integer('y_mm').notNull(),
    zMm: integer('z_mm').notNull(),
    rotation: integer('rotation').notNull().default(0), // 0..5
    loadSequence: integer('load_sequence'),             // ordre de chargement
    lockedByUser: boolean('locked_by_user').notNull().default(false),
  },
  (t) => ({
    planIdx: index('placements_plan_idx').on(t.planId),
    itemUnitUq: uniqueIndex('placements_item_unit_uq').on(t.cargoItemId, t.unitIndex),
  }),
);

// Résultat du dernier calcul : on garde l'historique pour comparer des variantes
export const planResults = pgTable(
  'plan_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => loadPlans.id, { onDelete: 'cascade' }),
    totalWeightKg: real('total_weight_kg').notNull(),
    grossWeightKg: real('gross_weight_kg').notNull(), // avec tares
    cogXMm: real('cog_x_mm'),
    cogYMm: real('cog_y_mm'),
    cogZMm: real('cog_z_mm'),
    totalHeightMm: integer('total_height_mm'),        // sol -> sommet de la charge
    isOog: boolean('is_oog').notNull().default(false),
    // [{ axleGroupId, loadKg, limitKg, ok }]
    axleLoads: jsonb('axle_loads').$type<
      { axleGroupId: string; loadKg: number; limitKg: number; ok: boolean }[]
    >(),
    // [{ code, severity: 'info'|'warning'|'error', message, refs? }]
    warnings: jsonb('warnings').$type<
      { code: string; severity: 'info' | 'warning' | 'error'; message: string; refs?: string[] }[]
    >(),
    engineVersion: text('engine_version'),
    computedAt: timestamp('computed_at').notNull().defaultNow(),
  },
  (t) => ({
    planIdx: index('plan_results_plan_idx').on(t.planId, t.computedAt),
  }),
);

// ------------------------------------------------------------ Relations

export const equipmentTypesRelations = relations(equipmentTypes, ({ many }) => ({
  zones: many(equipmentZones),
  axleGroups: many(axleGroups),
}));

export const equipmentZonesRelations = relations(equipmentZones, ({ one }) => ({
  equipmentType: one(equipmentTypes, {
    fields: [equipmentZones.equipmentTypeId],
    references: [equipmentTypes.id],
  }),
}));

export const axleGroupsRelations = relations(axleGroups, ({ one }) => ({
  equipmentType: one(equipmentTypes, {
    fields: [axleGroups.equipmentTypeId],
    references: [equipmentTypes.id],
  }),
}));

export const loadPlansRelations = relations(loadPlans, ({ many }) => ({
  equipment: many(planEquipment),
  items: many(cargoItems),
  placements: many(placements),
  results: many(planResults),
}));

export const planEquipmentRelations = relations(planEquipment, ({ one }) => ({
  plan: one(loadPlans, { fields: [planEquipment.planId], references: [loadPlans.id] }),
  equipmentType: one(equipmentTypes, {
    fields: [planEquipment.equipmentTypeId],
    references: [equipmentTypes.id],
  }),
}));

export const placementsRelations = relations(placements, ({ one }) => ({
  plan: one(loadPlans, { fields: [placements.planId], references: [loadPlans.id] }),
  item: one(cargoItems, { fields: [placements.cargoItemId], references: [cargoItems.id] }),
  planEquipment: one(planEquipment, {
    fields: [placements.planEquipmentId],
    references: [planEquipment.id],
  }),
  zone: one(equipmentZones, { fields: [placements.zoneId], references: [equipmentZones.id] }),
}));
