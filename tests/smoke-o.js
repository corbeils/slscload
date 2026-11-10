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

function t(eq,cfg,list){for(const o of [false,true]){run(`setOvr(${o},false)`);el('eq').value=eq;el('cfg').value=cfg;el('auto').checked=true;run(`cur="${eq}";$("eq").value="${eq}";$("cfg").value="${cfg}";setRange(false)`);
 run(`items=${JSON.stringify(list)};renderCrates();relayout(true)`);
 console.log(eq,'OVR',o,'placées',run('res.placed.length'),'/',list.length,'refusées',run('res.rejected.length'),'hors:',run('res.placed.filter(p=>p.over).length'));
 console.log(' ovr',o,run('JSON.stringify(lastWarn)').slice(0,330))}}
const mk=(id,l,w,h,kg,st=1)=>({id,name:'Caisse',l,w,h,kg,stackable:false,rotate:false,stop:st});
t('c20','tandem',[mk('A',3000,1500,1500,3000),mk('B',7000,1500,1500,1000),mk('C',2000,1500,3000,900),mk('D',2000,3000,1500,500)]);
t('fb','tandem',[mk('P1',5000,1800,1500,15000),mk('P2',5000,1800,1500,15000),mk('P3',20000,1500,1500,500),mk('P4',3000,1500,5000,800)]);
t('v53','tandem',Array.from({length:6},(_,i)=>mk('X'+i,1200,1000,1100,6000)));
