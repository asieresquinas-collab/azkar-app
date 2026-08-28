'use strict';
const fs=require('fs');
const path=require('path');
const h=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let bien=0,mal=0; const c=(n,x,d)=>{ if(x){bien++;console.log('  ✅ '+n);} else {mal++;console.log('  ❌ '+n+(d?'  →  '+d:''));} };

// se toman las líneas REALES del fichero: las dos del principio y las cuatro de las casillas
const i=h.indexOf('var _refAntes = String(((');
const j=h.indexOf('if (typeof updatePermutaUI', i);
const trozo=h.slice(i,j);
const lineas=trozo.split('\n').map(l=>l.trim())
  .filter(l=>/^var (_refAntes|_mismaFicha|isGuarda|isPlat|isOru|isPerm) =/.test(l));
if(lineas.length!==6){ console.log('❌ no encuentro las 6 líneas, encontré '+lineas.length); process.exit(1); }
const cuerpo=lineas.join('\n');

function simula(refAbierta, globales, data){
  const win = Object.assign({}, globales);
  const doc = { getElementById: id => id==='f_ref' ? { value: refAbierta } : null };
  return new Function('window','document','data', cuerpo +
    '; return {isGuarda:!!isGuarda,isPlat:!!isPlat,isOru:!!isOru,isPerm:!!isPerm,mismaFicha:!!_mismaFicha};')(win,doc,data);
}

console.log('\n══ EL CASO DE ASIER: LA CASILLA PEGADA ══');
let r = simula('6588', {_currentPlataforma:true,_currentOruga:true,_currentGuardamuebles:true,_currentPermuta:true}, {f_ref:'6589'});
c('1 · 🛑 la PLATAFORMA ya no se pega de la ficha anterior', r.isPlat===false, JSON.stringify(r));
c('2 · 🛑 ni la ORUGA', r.isOru===false);
c('3 · ni el guardamuebles ni la permuta', r.isGuarda===false && r.isPerm===false);

console.log('\n══ LO QUE LA FICHA SÍ TIENE, SE RESPETA ══');
r = simula('6588', {}, {f_ref:'6589', _plataforma:true});
c('4 · si la ficha nueva lleva plataforma, sale marcada', r.isPlat===true && r.isOru===false);
r = simula('6588', {}, {f_ref:'6589', _oruga:true});
c('5 · y si lleva oruga, la oruga', r.isOru===true && r.isPlat===false);
r = simula('6588', {}, {f_ref:'6589', _plataforma:true, _oruga:true});
c('6 · y si lleva las dos, las dos', r.isPlat===true && r.isOru===true);

console.log('\n══ LA MISMA FICHA (una sync a media faena) NO PIERDE LO MARCADO ══');
r = simula('6589', {_currentOruga:true}, {f_ref:'6589'});
c('7 · 🛑 recargando LA MISMA, lo que acababa de marcar sigue puesto', r.isOru===true && r.mismaFicha===true);
r = simula('', {_currentOruga:true}, {f_ref:'6589'});
c('8 · viniendo del formulario vacío, no se pega nada', r.isOru===false);

console.log('\n══ NADA DE MEDIAS TINTAS ══');
c('9 · 🛑 un «false» de texto no marca la casilla', simula('6588',{},{f_ref:'6589',_oruga:'false'}).isOru===false);
c('10 · ni un cero, ni una cadena vacía', simula('6588',{},{f_ref:'6589',_oruga:0}).isOru===false && simula('6588',{},{f_ref:'6589',_oruga:''}).isOru===false);

console.log('\n  '+bien+' bien · '+mal+' mal');
process.exit(mal?1:0);
