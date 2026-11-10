const fs=require('fs');eval(fs.readFileSync('engine.js','utf8')+';globalThis.Engine=Engine');
const E=Engine;let f=0;const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b)){f++;console.log('ECHEC',m,'attendu',b,'obtenu',a)}};
const cfg=E.AXLE_CFGS,reg=(o={})=>({season:'normal',tires:'dual',steerRated:6000,...o});
const info=(k,lift,r)=>{const t=E.trailerRig({kingpinX:1100,tandemX:0,trailerTareKg:7000,trailerCogX:6000,wheelbase:4400,fifthWheel:4000,steerTareKg:4600,driveTareKg:3600},cfg[k],10000,lift,r);return [t.cat&&t.cat.id,t.limit]};
// Tableau 1 (p. 24-25)
eq(info('tandem',false,reg()),['E.6',18000],'tandem normal');
eq(info('tandem',false,reg({season:'degel'})),['E.6',15500],'tandem dégel');
eq(info('tridem',false,reg()),['E.8',21000],'E.8');
eq(info('tridem',false,reg({season:'degel'})),['E.8',18000],'E.8 dégel');
eq(info('tridem9',false,reg()),['E.9',24000],'E.9');
eq(info('tridem10',false,reg()),['E.10',26000],'E.10');
eq(info('sa13',false,reg()),['E.13',32000],'E.13');
eq(info('sa13',false,reg({season:'degel'})),['E.13',27500],'E.13 dégel');
eq(info('sa14',false,reg()),['E.14',34000],'E.14');
eq(info('sa14',false,reg({season:'degel'})),['E.14',29500],'E.14 dégel');
eq(info('sa13',true,reg()),['E.9',24000],'E.13 relevé -> tridem E.9');
eq(info('sa14',true,reg()),['E.10',26000],'E.14 relevé -> tridem E.10');
// hypothèse pneus simples : -1000 kg par essieu, autovireur exempté
eq(info('tandem',false,reg({tires:'single'})),['E.6',16000],'tandem pneus simples');
eq(info('sa13',false,reg({tires:'single'})),['E.13',29000],'E.13 pneus simples (3 essieux réduits)');
eq(info('tridem',false,reg({tires:'wide'})),['E.8',21000],'bande large');
// Tableau 2 (p. 30) : somme des essieux = valeur du tableau quand a est suffisant
const tl=E.tractorLimits(reg());eq([tl.steer,tl.steerCap,tl.drive],[6000,5500,18000],'tracteur');
const G=(cat,a,lim)=>E.grossLimit('tandem',cat,a,lim);
eq(G('E.6',4000,5500+18000+18000).limit,41500,'V.21');
eq(G('E.8',4000,5500+18000+21000).limit,44500,'V.22');
eq(G('E.9',4500,5500+18000+24000).limit,47500,'V.23');
eq(G('E.10',5500,5500+18000+26000).limit,49500,'V.24');
eq(G('E.13',6000,5500+18000+32000).limit,55500,'V.26');
eq(G('E.14',5500,5500+18000+34000).limit,57500,'V.27');
eq(G('E.13',5900,1e9).tableMax,54500,'V.26 a<6,0 (ligne 2 du tableau)');
eq(G('E.13',5400,1e9).tableMax,53500,'V.26 a=5,4 (-1000 par tranche complète)');
eq(G('E.6',3400,1e9).tableMax,39500,'V.21 a=3,4');
eq(E.grossLimit('tandem',null,9999,1e9).id,'V.60','hors catégorie');
// Dimensions (p. 9)
eq(E.semiWheelbaseMax(4400),12500,'empattement max B<=6,2');eq(E.semiWheelbaseMax(6500),12330,'B=6,5');eq(E.semiWheelbaseMax(7100),11930,'B=7,1');
eq(E.classifyRear([0,1370,2740,4110],false),null,'4 essieux sans autovireur devant: hors catégorie');
console.log(f?('ÉCHECS: '+f):'RÈGLES CONFORMES AU GUIDE (toutes les vérifications passent)');
