// ---- export : plan, PDF 3 vues, vue chargeur
let lastRows=[],lastWarn=[];
const strip=s=>String(s).replace(/<[^>]+>/g,"");
function plan(){const s=EQ[cur],c=cfgNow(),front=+$("sl").value,d=dims(s);
 return{title:($("proj").value||"").trim(),date:new Date().toLocaleDateString("fr-CA"),
  eq:{n:s.n,open:!!s.open,dims:d,zones:s.open?s.zones.map(z=>({name:z.name,x:z.x,z:z.z,l:z.l,w:z.w})):[{name:"Caisse",x:0,z:0,l:s.l,w:s.w}],legalH:s.open?s.legalH:s.h,legalW:s.open?s.legalW:s.w,kingpinX:s.rig.kingpinX},
  cfg:c.name,offsets:c.offsets.map(o=>front+o),selfSteer:!!c.selfSteer,lifted:liftNow(),
  season:$("season").value==="degel"?"période de dégel":"période normale",
  pieces:res.placed.map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,z:p.z,pl:p.pl,pw:p.pw,h:p.h,kg:p.kg,stop:p.stop,zi:p.zi||0,locked:!!p.locked})),
  rejected:res.rejected.map(r=>({id:r.item.id,name:r.item.name,kg:r.item.kg})),
  rows:lastRows,warn:lastWarn,sec:lastSec,permit:lastPerm,td:{n:tdName(),wll:wllNow()},tot:lastTot,units:imp?"imperial":"metric"}}
async function saveFile(name,blob){
 let dl=null;try{dl=window.claude&&await window.claude.use("downloads")}catch(e){}
 if(dl){try{await dl.save({filename:name,data:blob});return}catch(e){if(e&&e.code==="declined")return;if(e&&e.code!=="unavailable"&&e.code!=="not_granted"){msg("Enregistrement impossible : "+(e.message||e.code));return}}}
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body&&document.body.appendChild(a);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}
const fname=(P,ext)=>((P.title||"plan-de-chargement").replace(/[^\w\-.]+/g,"_")+"."+ext);
function loaderHTML(P){return LOADER_TPL.replace("/*PLAN*/null",()=>JSON.stringify(P).replace(/</g,"\\u003c"))}
async function exportLoader(){const P=plan();if(!P.pieces.length){msg("Aucune caisse placée à exporter.");return}msg("");await saveFile(fname(P,"html"),new Blob([loaderHTML(P)],{type:"text/html"}))}
function buildPDF(P){
 const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:"landscape",unit:"mm",format:"letter"}),PW=279.4,PH=215.9,M=10,CW=PW-2*M;
 const IM=P.units==="imperial",cv=s=>IM?convText(s):s,fl=v=>IM?fmtLen(v):String(v);
 const rgb=[[0,0,0],[224,122,63],[63,143,224],[79,176,109]],mm=v=>(v/1000).toFixed(2).replace(".",",");
 const D=P.eq.dims,pcs=P.pieces;
 let ymin=0,ymax=D.w,zmax=P.eq.legalH;
 for(const p of pcs){ymin=Math.min(ymin,p.y);ymax=Math.max(ymax,p.y+p.pw);zmax=Math.max(zmax,p.z+p.h)}
 if(P.eq.open)ymax=Math.max(ymax,P.eq.legalW);
 const W=ymax-ymin,Hh=zmax,Lx=Math.max(D.l,...pcs.map(p=>p.x+p.pl));
 const sc=Math.min(CW/(Lx+200),138/(W+2*Hh));
 let pg=1;
 const head=()=>{doc.setFillColor(140,219,0);doc.rect(0,0,PW,2.2,"F");doc.setFont("helvetica","bold");doc.setFontSize(7.5);doc.setTextColor(14,17,19);doc.text("STEVE CORBEIL",PW-M-34,M+1.5,{align:"right"});doc.setTextColor(90,154,0);doc.text("STRATÈGE LOGISTIQUE",PW-M,M+1.5,{align:"right"});doc.setFont("helvetica","bold");doc.setFontSize(15);doc.setTextColor(0);doc.setTextColor(0);doc.text(P.title||"Plan de chargement",M,M+5);
  doc.setFont("helvetica","normal");doc.setFontSize(9.5);doc.setTextColor(80);
  doc.text(cv(P.eq.n+"  |  "+P.cfg+"  |  "+P.season+"  |  "+P.date+"  |  "+pcs.length+" caisses, "+pcs.reduce((a,b)=>a+b.kg,0)+" kg"),M,M+11);doc.setTextColor(0)};
 const foot=()=>{doc.setFontSize(7);doc.setTextColor(110);doc.text("Règles : Guide des normes de charges et dimensions, édition 2026 (MTMD Québec), indicatif : le règlement fait foi. Arrimage à vérifier selon la norme en vigueur.",M,PH-5);doc.text("Page "+pg,PW-M,PH-5,{align:"right"});doc.setTextColor(0)};
 const lab=(t,x,y)=>{doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(60);doc.text(t,x,y);doc.setFont("helvetica","normal");doc.setTextColor(0)};
 const box=(x,y,w,h,p,alpha)=>{doc.setGState(new doc.GState({opacity:alpha}));doc.setFillColor(...rgb[p.stop]);doc.rect(x,y,w,h,"F");doc.setGState(new doc.GState({opacity:1}));
  doc.setDrawColor(0);doc.setLineWidth(.25);doc.rect(x,y,w,h,"S");
  let fs=Math.min(14,Math.max(4.5,h*2.2));doc.setFont("helvetica","bold");doc.setFontSize(fs);const tw=doc.getTextWidth(p.id);if(tw>w*.92){fs=Math.max(4,fs*w*.92/tw);doc.setFontSize(fs)}
  doc.setTextColor(0);doc.text(p.id,x+w/2,y+h/2,{align:"center",baseline:"middle"});doc.setFont("helvetica","normal")};
 head();
 // 1) vue de dessus
 const X0=M+(CW-(Lx+200)*sc)/2+100*sc;let y0=M+16;
 lab("VUE DE DESSUS   (avant à gauche, portes à droite)",M,y0);y0+=3;
 const ty=y0+3,tx=v=>X0+v*sc;
 doc.setDrawColor(120);doc.setLineWidth(.3);
 if(P.eq.open){for(const z of P.eq.zones){doc.setFillColor(225,224,218);doc.rect(tx(z.x),ty+(0-ymin)*sc,z.l*sc,z.w*sc,"FD")}}else doc.rect(tx(0),ty+(0-ymin)*sc,D.l*sc,D.w*sc,"S");
 [...pcs].sort((a,b)=>a.z-b.z).forEach(p=>box(tx(p.x),ty+(p.y-ymin)*sc,p.pl*sc,p.pw*sc,p,1));
 doc.setDrawColor(44,111,214);doc.setLineWidth(.6);doc.line(tx(P.eq.kingpinX),ty-2,tx(P.eq.kingpinX),ty+W*sc+2);
 P.offsets.forEach((o,i)=>{doc.setDrawColor(...(P.selfSteer&&i===0?[224,160,32]:[214,58,44]));doc.line(tx(o),ty-2,tx(o),ty+W*sc+2)});
 doc.setFontSize(7);doc.setTextColor(90);doc.text("Côté passager",M,ty+2);doc.text("Côté conducteur",M,ty+W*sc-1);doc.setTextColor(0);
 // 2) vue de côté
 let sy=ty+W*sc+9;lab("VUE DE CÔTÉ   (hauteur depuis le sol)",M,sy);sy+=3;
 const base=sy+4+Hh*sc,zy=v=>base-v*sc;
 doc.setDrawColor(0);doc.setLineWidth(.4);doc.line(tx(-100),base,tx(Lx+100),base);
 if(P.eq.open){doc.setLineWidth(.8);for(const z of P.eq.zones)doc.line(tx(z.x),zy(z.z),tx(z.x+z.l),zy(z.z))}else{doc.setLineWidth(.3);doc.rect(tx(0),zy(D.h),D.l*sc,D.h*sc,"S")}
 doc.setGState(new doc.GState({opacity:1}));
 [...pcs].sort((a,b)=>b.y-a.y).forEach(p=>box(tx(p.x),zy(p.z+p.h),p.pl*sc,p.h*sc,p,.78));
 doc.setDrawColor(200,40,40);doc.setLineWidth(.25);doc.setLineDashPattern([1.5,1.5],0);doc.line(tx(-100),zy(P.eq.legalH),tx(Lx+100),zy(P.eq.legalH));doc.setLineDashPattern([],0);
 doc.setFontSize(7);doc.setTextColor(200,40,40);doc.text(cv((P.eq.open?"hauteur légale ":"hauteur utile ")+mm(P.eq.legalH)+" m"),tx(Lx+100),zy(P.eq.legalH)-1,{align:"right"});doc.setTextColor(0);
 doc.setDrawColor(44,111,214);doc.setLineWidth(.6);doc.line(tx(P.eq.kingpinX),base,tx(P.eq.kingpinX),base+2.5);
 P.offsets.forEach((o,i)=>{doc.setDrawColor(...(P.selfSteer&&i===0?[224,160,32]:[214,58,44]));doc.line(tx(o),base,tx(o),base+2.5)});
 // 3) vue arrière + résumé
 let ry0=base+9;lab("VUE ARRIÈRE   (vue depuis les portes)",M,ry0);ry0+=3;
 const rb=ry0+4+Hh*sc,rx0=M+4,rxv=v=>rx0+(ymax-v)*sc,rz=v=>rb-v*sc;
 doc.setDrawColor(0);doc.setLineWidth(.4);doc.line(rx0-2,rb,rx0+W*sc+2,rb);
 if(P.eq.open){doc.setLineWidth(.8);doc.line(rxv(P.eq.legalW),rz(P.eq.zones[0].z),rxv(0),rz(P.eq.zones[0].z))}else{doc.setLineWidth(.3);doc.rect(rxv(D.w),rz(D.h),D.w*sc,D.h*sc,"S")}
 [...pcs].sort((a,b)=>b.x-a.x).forEach(p=>box(rxv(p.y+p.pw),rz(p.z+p.h),p.pw*sc,p.h*sc,p,.78));
 doc.setDrawColor(200,40,40);doc.setLineWidth(.25);doc.setLineDashPattern([1.5,1.5],0);doc.line(rx0-2,rz(P.eq.legalH),rx0+W*sc+2,rz(P.eq.legalH));
 if(P.eq.open){doc.line(rxv(0),rz(0),rxv(0),rz(P.eq.legalH));doc.line(rxv(P.eq.legalW),rz(0),rxv(P.eq.legalW),rz(P.eq.legalH))}doc.setLineDashPattern([],0);
 doc.setFontSize(7);doc.setTextColor(90);doc.setFontSize(6.5);doc.text("Conducteur",rx0,rb+4);doc.text("Passager",rx0+W*sc,rb+4,{align:"right"});doc.setFontSize(7);doc.setTextColor(0);
 // résumé à droite de la vue arrière
 let sx=rx0+W*sc+14,syy=ry0+2;doc.setFontSize(8.5);
 doc.setFont("helvetica","bold");doc.text("Charges",sx,syy);doc.setFont("helvetica","normal");syy+=4.5;
 for(const r of P.rows){doc.setTextColor(...(r.ok?[0,0,0]:[190,30,30]));doc.text(strip(r.n),sx,syy);doc.text(cv(r.kg+" / "+r.lim+" kg"),sx+88,syy,{align:"right"});syy+=4.2}
 doc.setTextColor(80);doc.setFontSize(7.5);doc.text(doc.splitTextToSize(cv(P.tot),95),sx,syy+1);doc.setTextColor(0);
 let lx=sx+108,ly=ry0+2;doc.setFontSize(8.5);doc.setFont("helvetica","bold");doc.text("Légende",lx,ly);doc.setFont("helvetica","normal");ly+=4.5;
 [1,2,3].forEach(k=>{doc.setFillColor(...rgb[k]);doc.setDrawColor(0);doc.rect(lx,ly-3,4,4,"FD");doc.text("Arrêt "+k+(k===1?" (livré en premier)":""),lx+6,ly);ly+=4.5});
 doc.setDrawColor(44,111,214);doc.setLineWidth(.6);doc.line(lx,ly-1,lx+4,ly-1);doc.text("Pivot d’attelage",lx+6,ly);ly+=4.5;
 doc.setDrawColor(214,58,44);doc.line(lx,ly-1,lx+4,ly-1);doc.text("Essieux de la semi",lx+6,ly);ly+=4.5;
 if(P.selfSteer){doc.setDrawColor(224,160,32);doc.line(lx,ly-1,lx+4,ly-1);doc.text("Autovireur"+(P.lifted?" (relevé)":""),lx+6,ly)}
 foot();
 // page 2+ : liste de chargement
 const newPage=()=>{doc.addPage();pg++;head();foot();return M+18};
 let y=newPage();doc.setFontSize(11);doc.setFont("helvetica","bold");doc.text("Liste de chargement",M,y);y+=5;
 doc.setFontSize(7.5);const cols=[["#",M,0],["N°",M+9,0],["Désignation",M+34,0],["Arrêt",M+78,0],["L × l × H ("+(IM?"pi-po":"mm")+")",M+92,0],[IM?"lb":"kg",M+146,1],["Position",M+148,0],["Att.",PW-M-17,1],["Chargée",PW-M-4,1]];
 const hdr=()=>{doc.setFont("helvetica","bold");doc.setTextColor(90);cols.forEach(c=>doc.text(c[0],c[1],y,{align:c[2]?"right":"left"}));doc.setDrawColor(150);doc.setLineWidth(.2);doc.line(M,y+1.5,PW-M,y+1.5);doc.setTextColor(0);doc.setFont("helvetica","normal");y+=5.5};
 hdr();
 const ord=[...pcs].sort((a,b)=>b.stop-a.stop||a.x-b.x||a.z-b.z);
 ord.forEach((p,i)=>{if(y>PH-16){y=newPage();hdr()}
  const z=P.eq.zones[p.zi]||P.eq.zones[0],pos=(P.eq.open?z.name+", ":"")+cv(mm(p.x)+" m")+" du nez"+(p.z-z.z>5?", empilée":"")+(p.locked?", fixée":"");
  doc.setFontSize(8);doc.text(String(i+1),M,y);doc.setFont("helvetica","bold");doc.text(p.id,M+9,y);doc.setFont("helvetica","normal");
  doc.text(doc.splitTextToSize(p.name,40)[0],M+34,y);doc.setFillColor(...rgb[p.stop]);doc.rect(M+78,y-2.6,3,3,"F");doc.text(String(p.stop),M+83,y);
  doc.text(fl(p.pl)+" × "+fl(p.pw)+" × "+fl(p.h),M+92,y);doc.text(IM?String(Math.round(p.kg*IMP_K)):String(p.kg),M+146,y,{align:"right"});doc.text(doc.splitTextToSize(pos,PW-M-14-8-(M+148))[0],M+148,y);const sq=(P.sec||[]).find(q=>q.id===p.id);if(sq){doc.setFont("helvetica","bold");doc.text(String(sq.n)+(sq.type==="machine"?" M":""),PW-M-17,y,{align:"right"});doc.setFont("helvetica","normal")}
  doc.setDrawColor(0);doc.setLineWidth(.2);doc.rect(PW-M-7,y-3,3.6,3.6,"S");
  doc.setDrawColor(225);doc.line(M,y+1.6,PW-M,y+1.6);y+=5.2});
 y+=3;
 if(P.sec&&P.sec.length){if(y>PH-50)y=newPage();doc.setFontSize(9);doc.setFont("helvetica","bold");doc.text("Arrimage",M,y);doc.setFont("helvetica","normal");y+=4.5;doc.setFontSize(8);
  doc.text(cv("Attache : "+P.td.n+" · capacité "+P.td.wll+" kg · total "+P.sec.reduce((a,q)=>a+q.n,0)+" attaches. « M » = machine (4 attaches min. de 2 268 kg)."),M,y,{maxWidth:CW});y+=5;
  P.sec.forEach(q=>{const ls=doc.splitTextToSize(cv(q.id+" "+q.name+" : "+q.n+" attache(s)"+(q.blocked?" (calée vers l’avant)":"")+(q.notes.length?" — "+q.notes.join(" ; "):"")),CW);if(y+ls.length*3.8>PH-12)y=newPage();doc.setTextColor(...(q.warn?[190,30,30]:[0,0,0]));doc.text(ls,M,y);y+=ls.length*3.8});doc.setTextColor(0);y+=2}
 if(P.permit){if(y>PH-40)y=newPage();doc.setFontSize(9);doc.setFont("helvetica","bold");doc.setTextColor(...(P.permit.need?[190,30,30]:[0,0,0]));doc.text(P.permit.need?"Permis spécial de circulation requis":"Permis spécial : aucun requis",M,y);doc.setTextColor(0);doc.setFont("helvetica","normal");y+=4.5;doc.setFontSize(7.5);
  P.permit.lines.forEach(r=>{const ls=doc.splitTextToSize("• "+cv(r),CW);if(y+ls.length*3.6>PH-12)y=newPage();doc.text(ls,M,y);y+=ls.length*3.6});y+=3}
 if(y>PH-36)y=newPage();doc.setFontSize(8.5);doc.setFont("helvetica","bold");doc.text("Rappels d’arrimage",M,y);doc.setFont("helvetica","normal");y+=4.2;doc.setFontSize(7.5);
 REMINDERS.forEach(r=>{const ls=doc.splitTextToSize("• "+cv(r),CW);if(y+ls.length*3.6>PH-12)y=newPage();doc.text(ls,M,y);y+=ls.length*3.6});y+=3;
 doc.setFontSize(7.5);doc.setTextColor(90);doc.text("Ordre suggéré : dernier arrêt d’abord (au nez), puis de l’avant vers l’arrière, puis du bas vers le haut.",M,y);doc.setTextColor(0);y+=7;
 if(P.rejected.length){if(y>PH-20)y=newPage();doc.setFontSize(9);doc.setFont("helvetica","bold");doc.setTextColor(190,30,30);doc.text(cv("Non placées : "+P.rejected.map(r=>r.id+" "+r.name+" ("+r.kg+" kg)").join(", ")),M,y,{maxWidth:CW});doc.setTextColor(0);doc.setFont("helvetica","normal");y+=8}
 if(P.warn.length){if(y>PH-30)y=newPage();doc.setFontSize(9);doc.setFont("helvetica","bold");doc.text("Alertes",M,y);doc.setFont("helvetica","normal");y+=4.5;doc.setFontSize(8);
  doc.setTextColor(190,30,30);P.warn.forEach(w=>{const ls=doc.splitTextToSize(cv("• "+w),CW);if(y+ls.length*4>PH-12){y=newPage()}doc.text(ls,M,y);y+=ls.length*4});doc.setTextColor(0)}
 return doc}
async function exportPDF(){const P=plan();if(!P.pieces.length){msg("Aucune caisse placée à exporter.");return}
 if(!window.jspdf){msg("Bibliothèque PDF non chargée (connexion requise).");return}
 try{msg("");const doc=buildPDF(P);await saveFile(fname(P,"pdf"),doc.output("blob"))}catch(e){msg("Échec du PDF : "+(e.message||e))}}
