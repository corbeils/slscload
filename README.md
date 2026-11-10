# SLSC LOAD PLANNER

Planificateur de chargement (conteneurs, plateaux, step decks, fardiers/RGN, remorques fermées) selon les règles du Québec (MTMD).

## Contenu
- `engine/` : moteurs TypeScript (mm / kg en interne). Règlements (`regulations-qc.ts`), placement, plateaux ouverts et arrimage (`open-deck-engine.ts`), équilibrage des essieux (`balance.ts`), schéma de base (`load-space.schema.ts`).
- `app/demo-template.html` : la page (React-free, three.js, jsPDF). Le marqueur `/*ENGINE*/` reçoit le bundle des moteurs au build.
- `app/export-part.js`, `loader-template.html`, `conv.js` : sources du PDF, de la vue chargeur et de la conversion métrique/impérial. Ils sont déjà intégrés dans `demo-template.html`; il faut les y réinjecter après modification.
- `tests/` : tests de fumée (Node, DOM simulé).

## Construire
```
npm install
npm run build        # écrit dist/planificateur.html
npm run typecheck
```

## Fonctions
Équipements et attaches gérés dans l'onglet Admin (base de données de la page), projets sauvegardés, override poids/dimensions par équipement, métrique/impérial, thème sombre, PDF 3 vues, vue chargeur partageable, arrimage (guide MTMD) et permis spécial (C-24.2, r. 35).

Sources réglementaires : Guide des normes de charges et dimensions (2026), Guide des normes d'arrimage (2017), Règlement sur le permis spécial de circulation (C-24.2, r. 35). Indicatif : le règlement fait foi.
