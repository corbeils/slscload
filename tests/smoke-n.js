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

for(const e of ['fb53','sd53'])for(const c of cfgs)for(const season of ['normal','degel']){
 el('eq').value=e;el('cfg').value=c;el('season').value=season;el('auto').checked=true;run('setEq()');
 console.log(e,c,season,'sl',el('sl').min+'-'+el('sl').max,'alertes',run('lastWarn.length'),run('JSON.stringify(lastWarn.slice(0,2))'))}
