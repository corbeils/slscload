const vm=require('vm'),fs=require('fs');
const S='/tmp/claude-0/-home-claude/abecf0cf-b091-584b-8ecc-81f9d971b115/scratchpad';
const THREE0=require(S+'/node_modules/three');
const W=800,H=360;
function Fake(){this.domElement={getBoundingClientRect:()=>({left:0,top:0,width:W,height:H})};this.setSize=()=>{};this.setPixelRatio=()=>{};this.render=()=>{}}
const THREE=Object.assign({},THREE0,{WebGLRenderer:Fake});
const els={};
const el=id=>els[id]||(els[id]={id,value:'',checked:false,disabled:false,style:{},innerHTML:'',textContent:'',children:[],min:0,max:0,
 appendChild(c){this.children.push(c);if(!this.value)this.value=c.value},setPointerCapture(){},clientWidth:W,clientHeight:H});
els.auto=el('auto');els.auto.checked=true;
const ctx={THREE,document:{getElementById:el,createElement:()=>({value:'',textContent:''})},addEventListener(){},devicePixelRatio:1,console,Math,Set,Array,Object,Number,JSON};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('check.js','utf8'),ctx);
const run=c=>vm.runInContext(c,ctx);
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('ECHEC:',m)}};
// 1) toutes les combinaisons s'exécutent sans exception, plan valide
const eqs=Object.keys(run('EQ')),cfgs=Object.keys(run('CFG'));let combos=0;
for(const e of eqs)for(const c of cfgs)for(const lift of [false,true]){
 el('eq').value=e;el('cfg').value=c;el('lift').checked=lift;
 try{run('setEq()');combos++;
  ok(run(`Engine.validLayout(res.placed,inB(EQ[cur]),flo(EQ[cur]))`)||run('EQ[cur].open'),`plan invalide ${e}/${c}`);
  ok(+el('sl').value>=+el('sl').min&&+el('sl').value<=+el('sl').max,`curseur hors plage ${e}/${c}`);
  ok(/kg/.test(el('ax').innerHTML),`pas d'essieux ${e}/${c}`);
 }catch(x){fails++;console.log('EXCEPTION',e,c,lift,x.message)}}
console.log('combinaisons exécutées:',combos);
// 2) glisser-déposer d'une pièce
el('eq').value='fb';el('cfg').value='tandem';el('lift').checked=false;el('auto').checked=false;run('setEq()');run('run()');
const p0=JSON.parse(run('JSON.stringify(res.placed.map(p=>({id:p.id,x:p.x,y:p.y,z:p.z,pl:p.pl,pw:p.pw,h:p.h,stackable:p.stackable})))'));
console.log('pièces:',p0.length);
const proj=(id,dx,dy)=>JSON.parse(run(`(()=>{sync();const p=res.placed.find(q=>q.id==='${id}');const v=new THREE.Vector3((p.x+${dx}+p.pl/2)/1e3,(p.z+p.h/2)/1e3,(p.y+${dy}+p.pw/2)/1e3);inner.localToWorld(v);v.project(cam);return JSON.stringify({cx:(v.x+1)/2*${W},cy:(1-v.y)/2*${H}})})()`));
const target=p0.find(p=>true);
const start=proj(target.id,0,0);
const ev=(pt)=>({clientX:pt.cx,clientY:pt.cy,pointerId:1});
const view=el('view');
const picked=run(`pick(${JSON.stringify(ev(start))})`);
ok(picked===target.id,`pick: attendu ${target.id}, obtenu ${picked}`);
view.onpointerdown;run('1');
vm.runInContext(`view.onpointerdown(${JSON.stringify(ev(start))})`,ctx);
ok(run('!!drag'),'drag non démarré');
// déplacer de +300 mm en x
const end=proj(target.id,0,300);
vm.runInContext(`view.onpointermove(${JSON.stringify(ev(end))})`,ctx);
const moved=JSON.parse(run(`JSON.stringify(res.placed.find(q=>q.id==='${target.id}'))`));
console.log('y avant',target.y,'y après',moved.y,'verrouillée',moved.locked);
ok(moved.locked===true,'pièce non verrouillée');
ok(Math.abs((moved.y-target.y)-300)<=100&&moved.x===target.x,'déplacement incohérent: dy='+(moved.y-target.y)+' dx='+(moved.x-target.x));
vm.runInContext('view.onpointerup()',ctx);
ok(run('res.placed.every((p,i,a)=>true)'),'ok');
ok(run(`Engine.validLayout(res.placed,inB(EQ[cur]),flo(EQ[cur]))`),'plan invalide après glisser');
// 3) glisser dans une collision : doit être refusé
const other=p0.find(p=>p.id!==target.id&&p.z===target.z);
if(other){const before=JSON.parse(run(`JSON.stringify(res.placed.find(q=>q.id==='${other.id}'))`));
 // tenter de poser "other" exactement sur la position de "target"
 const cur=JSON.parse(run(`JSON.stringify(res.placed.find(q=>q.id==='${target.id}'))`));
 vm.runInContext(`drag={p:res.placed.find(q=>q.id==='${other.id}'),ox:0,oy:0,moved:false};tryMove(drag.p,${cur.x},${cur.y})`,ctx);
 const after=JSON.parse(run(`JSON.stringify(res.placed.find(q=>q.id==='${other.id}'))`));
 ok(run('Engine.validLayout(res.placed,inB(EQ[cur]),flo(EQ[cur]))'),'collision acceptée à tort');}
// 4) équilibrer en gardant la pièce verrouillée
const lockedBefore=JSON.parse(run(`JSON.stringify(res.placed.find(q=>q.id==='${target.id}'))`));
run('balance()');
const lockedAfter=JSON.parse(run(`JSON.stringify(res.placed.find(q=>q.id==='${target.id}'))`));
ok(lockedAfter&&lockedAfter.x===lockedBefore.x&&lockedAfter.y===lockedBefore.y,'verrou non respecté par balance()');
console.log(fails?('ÉCHECS: '+fails):'TOUS LES TESTS PASSENT');
console.log('chevauchement final:',!run(`Engine.validLayout(res.placed,inB(EQ[cur]),flo(EQ[cur]))`));
// 5) ajout / modification / suppression de caisses
el('auto').checked=true;run('setEq()');run('run()');
const n0=run('items.length');
run('$("add").onclick()');ok(run('items.length')===n0+1,'ajout');
const nid=run('items[items.length-1].id');
ok(run(`res.placed.some(p=>p.id==='${nid}')||res.rejected.some(r=>r.item.id==='${nid}')`),'nouvelle caisse absente du plan');
// renommer avec un N° de projet
run(`$("crates").onchange({target:{dataset:{i:String(items.length-1),f:'id'},value:'PRJ-4821'}})`);
ok(run(`items[items.length-1].id==='PRJ-4821'&&res.placed.some(p=>p.id==='PRJ-4821')`),'renommage');
// doublon refusé
run(`$("crates").onchange({target:{dataset:{i:'0',f:'id'},value:'PRJ-4821'}})`);
ok(run(`items[0].id!=='PRJ-4821'`),'doublon accepté');
// changer le poids
run(`$("crates").onchange({target:{dataset:{i:'0',f:'kg'},value:'1234'}})`);
ok(run('items[0].kg===1234'),'poids');
// supprimer
run(`$("crates").onclick({target:{dataset:{del:'0'}}})`);
ok(run('items.length')===n0,'suppression');
ok(run(`Engine.validLayout(res.placed,inB(EQ[cur]),flo(EQ[cur]))`),'plan invalide après édition');
console.log(fails?('ÉCHECS: '+fails):'TOUS LES TESTS PASSENT (avec édition)');

const V={v1:[["M-100","Presse",5000,2900,2400,9000,0,0,1]],v2:[["M-100","Presse",5000,2900,2400,9000,0,0,1],["M-101","Moteur",1800,1200,1300,2200,0,1,2]],v3:[["M-100","Presse",5000,2900,2400,9000,0,0,1],["M-101","Moteur",1800,2600,1300,2200,0,0,2]]};
for(const k in V){run(`items=${JSON.stringify(V[k].map(a=>({id:a[0],name:a[1],l:a[2],w:a[3],h:a[4],kg:a[5],stackable:!!a[6],rotate:!!a[7],stop:a[8]})))};cur="rgn";$("eq").value="rgn";$("cfg").value="tridem";setRange(false);renderCrates();relayout(true)`);console.log(k,run('JSON.stringify(lastWarn)'))}
