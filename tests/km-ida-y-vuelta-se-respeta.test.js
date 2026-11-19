'use strict';
// v754 · LA «IDA Y VUELTA» QUE PONE AZKARIN NO SE PARTE POR LA MITAD  (node tests/km-ida-y-vuelta-se-respeta.test.js)
//  Examen 2 del 19-nov (F4): una ficha que NO es cambio de muebles con «Desplazamiento (200.0 km ida y vuelta)» 200 × 3,50 = 700 €
//  (la puso Azkarin, 2.7.1387). Al tocar la casilla de recogida o entrega y salir, la app recalculaba la ruta (100 km) y dejaba
//  «Desplazamiento (100.0 km)» 100 × 3,50 = 350 €, sin avisar. Se reproduce aquí con el código de verdad del index.html (sin
//  navegador ni red) y una ficha inventada.
const fs = require('fs'), path = require('path'), vm = require('vm');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ini = H.indexOf('var PRECIO_KM_CERCA = 2.40;');
const fin = H.indexOf('window._pintarDistanciaYKm = pintarDistanciaYKm;');
let bien = 0, mal = 0;
function c(n, ok, d) { if (ok) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + String(d).slice(0, 300) : '')); } }
if (!(ini > 0 && fin > ini)) { console.log('  ❌ no encuentro el bloque de los km'); process.exit(1); }
const BLOQUE = H.slice(ini, fin + 'window._pintarDistanciaYKm = pintarDistanciaYKm;'.length);

// Un DOM de juguete: lo justo para la caja de km y las filas del presupuesto
function el(tag, id) {
  const e = { tagName: tag, id: id || '', textContent: '', innerHTML: '', style: { cssText: '' }, className: '', children: [], parentNode: null, value: '' };
  e.appendChild = (h) => { h.parentNode = e; e.children.push(h); return h; };
  e.removeChild = (h) => { e.children = e.children.filter(x => x !== h); h.parentNode = null; };
  return e;
}
function app(filas, o) {
  o = o || {};
  const avisos = [], arAnadidas = [];
  const rows = [];
  const fila = (vals) => { const ins = vals.map(v => ({ value: String(v) })); return { ins, querySelectorAll: () => ins, querySelector: () => ins[0] }; };
  (filas || []).forEach(f => rows.push(fila(f)));
  const fijos = { 'dist-km': el('div', 'dist-km'), 'dist-coste': el('div', 'dist-coste'), 'dist-ruta': el('div', 'dist-ruta'), 'dist-tiempo': el('div', 'dist-tiempo') };
  const buscar = (raiz, id) => { if (raiz.id === id) return raiz; for (const h of raiz.children || []) { const r = buscar(h, id); if (r) return r; } return null; };
  const doc = {
    querySelectorAll: (sel) => (sel === '#tb .cr' ? rows : []),
    querySelector: () => null,
    getElementById: (id) => fijos[id] || buscar(fijos['dist-ruta'], id) || null,
    createElement: (t) => el(t),
    body: el('body')
  };
  const ctx = {
    document: doc, console,
    AR: (cc, z, u, p, d) => { arAnadidas.push([cc, u, p]); rows.push(fila([cc, u, p, d])); },
    CA: () => {},
    showSyncStatus: (m) => avisos.push(String(m)),
    selloDeFicha: () => o.sello || '9999'
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(BLOQUE, ctx);
  ctx._kmRutaBase = o.ruta;
  ctx._currentPermuta = !!o.permuta;
  ctx.fijarTarifaKmDeFicha(o.tarifa);
  const linea = () => { const f = rows.find(r => /^Desplazamiento/i.test(r.ins[0].value)); return f ? { c: f.ins[0].value, u: parseFloat(f.ins[1].value), p: parseFloat(f.ins[2].value), imp: Math.round(parseFloat(f.ins[1].value) * parseFloat(f.ins[2].value) * 100) / 100 } : null; };
  return { ctx, avisos, arAnadidas, linea, fijos, doc };
}

// ══ 1 · EL CASO DEL EXAMEN: 200 km ida y vuelta × 3,50 = 700 €, y se toca la recogida (la ruta da 100 km) ══
let A = app([['Servicio base: equipo y vehículo', '1', '100', '0'], ['Desplazamiento (200.0 km ida y vuelta)', '200', '3.50', '0']], { ruta: 100, tarifa: 3.5 });
A.ctx.pintarDistanciaYKm();   // lo mismo que hace salir de la casilla de recogida (calcularDistancia → pintarDistanciaYKm)
let L = A.linea();
c('1 · 🛑 sigue en 200 km ida y vuelta × 3,50 = 700 € (antes se quedaba en 100 km = 350 €)', L && L.u === 200 && L.p === 3.5 && L.imp === 700 && /ida y vuelta/.test(L.c), JSON.stringify(L));
c('2 · la caja de km también lo dice (200.0 km, ida y vuelta) y no habla de «cambio de muebles»', /^200\.0 km \(ida y vuelta\)/.test(A.fijos['dist-km'].textContent) && /ida y vuelta, como dice la línea/.test(A.fijos['dist-ruta'].innerHTML) && !/cambio de muebles/.test(A.fijos['dist-ruta'].innerHTML), A.fijos['dist-km'].textContent + ' | ' + A.fijos['dist-ruta'].innerHTML);
c('3 · como la cuenta sale igual, no hay aviso ni pregunta', A.avisos.length === 0 && !A.doc.getElementById('aviso-km-linea'), A.avisos.join(' | '));

// ══ 2 · LA DIRECCIÓN CAMBIA DE VERDAD (la ruta pasa a 150 km): no se pisa, se avisa y se pregunta ══
A = app([['Desplazamiento (200.0 km ida y vuelta)', '200', '3.50', '0']], { ruta: 150, tarifa: 3.5 });
A.ctx.pintarDistanciaYKm();
L = A.linea();
const caja = A.doc.getElementById('aviso-km-linea');
c('4 · 🛑 la línea se queda en 700 € hasta que Asier diga', L && L.imp === 700 && L.u === 200, JSON.stringify(L));
c('5 · y sale el aviso con los dos números y la barra lo dice', caja && /No he tocado la línea/.test(caja.innerHTML) && /700,00 €/.test(caja.innerHTML) && /300 km ida y vuelta × 3,50 € = 1050,00 €/.test(caja.innerHTML) && A.avisos.some(m => /NO la he tocado/.test(m)), caja && caja.innerHTML);
const btn = A.doc.getElementById('btn-km-linea-cambiar');
c('6 · el aviso es solo de pantalla (no-pdf)', caja && caja.className === 'no-pdf');
btn && btn.onclick();
L = A.linea();
c('7 · con su botón, se cambia a 300 km ida y vuelta × 3,50 = 1050 € y la barra lo cuenta', L && L.u === 300 && L.imp === 1050 && /300\.0 km ida y vuelta/.test(L.c) && A.avisos.some(m => /He rehecho los km: 300 km ida y vuelta × 3,50 € = 1050,00 € \(antes 700,00 €\)/.test(m)), JSON.stringify(L) + ' | ' + A.avisos.join(' | '));
A = app([['Desplazamiento (200.0 km ida y vuelta)', '200', '3.50', '0']], { ruta: 150, tarifa: 3.5, sello: '1111' });
A.ctx.pintarDistanciaYKm();
A.ctx.selloDeFicha = () => '2222';   // mientras tanto se ha abierto OTRA ficha
const b8 = A.doc.getElementById('btn-km-linea-cambiar'); if (b8) b8.onclick();
c('8 · 🛑 si entre medias se abre otra ficha, el botón no toca nada', A.linea().imp === 700);

// ══ 3 · TARIFA DICHA POR ASIER Y POCOS KM: no pasa a «SIN CARGO» en silencio ══
A = app([['Desplazamiento (12.0 km)', '12', '1.50', '0']], { ruta: 10, tarifa: 1.5 });
A.ctx.pintarDistanciaYKm();
L = A.linea();
c('9 · 🛑 12 km × 1,50 (lo dijo él) no se convierte en SIN CARGO sin preguntar', L && L.imp === 18 && !/SIN CARGO/.test(L.c) && A.doc.getElementById('aviso-km-linea') && /sin cargo/.test(A.doc.getElementById('aviso-km-linea').innerHTML), JSON.stringify(L));
A = app([['Desplazamiento (40.0 km)', '40', '1.50', '0']], { ruta: 40.4, tarifa: 1.5 });
A.ctx.pintarDistanciaYKm();
c('10 · su precio y casi los mismos km: se deja tal cual, sin aviso', A.linea().imp === 60 && A.avisos.length === 0);

// ══ 4 · LO DE SIEMPRE SIGUE IGUAL ══
A = app([['Servicio base: equipo y vehículo', '1', '100', '0']], { ruta: 40 });
A.ctx.pintarDistanciaYKm();
c('11 · ficha sin línea: se añade la línea como siempre (40 km × 2,40)', A.arAnadidas.length === 1 && A.arAnadidas[0][0] === 'Desplazamiento (40.0 km)' && A.arAnadidas[0][2] === '2.40', JSON.stringify(A.arAnadidas));
A = app([['Desplazamiento (30.0 km)', '30', '2.40', '0']], { ruta: 45, tarifa: 2.4 });
A.ctx.pintarDistanciaYKm();
L = A.linea();
c('12 · una línea normal de la casa se rehace como antes (45 km × 2,40) y ahora la barra lo dice', L && L.u === 45 && L.p === 2.4 && A.avisos.some(m => /He rehecho los km: 45 km × 2,40 € = 108,00 € \(antes 72,00 €\)/.test(m)), JSON.stringify(L) + ' | ' + A.avisos.join(' | '));
A = app([['Desplazamiento (60.0 km)', '60', '2.40', '0']], { ruta: 50, permuta: true, tarifa: 2.4 });
A.ctx.pintarDistanciaYKm();
L = A.linea();
c('13 · con cambio de muebles se cuenta doble, como siempre (100 km ida y vuelta)', L && L.u === 100 && /100\.0 km ida y vuelta/.test(L.c) && /cambio de muebles/.test(A.fijos['dist-ruta'].innerHTML), JSON.stringify(L));
A = app([['Desplazamiento (100.0 km ida y vuelta)', '100', '2.40', '0']], { ruta: 50, permuta: false, tarifa: 2.4 });
A.ctx._kmQuitarIdaYVuelta = true; A.ctx._kmLoDecideElUsuario = true;   // lo que deja apagarPermuta() tras su «¿Seguimos?»
A.ctx.pintarDistanciaYKm();
L = A.linea();
c('14 · al QUITAR el cambio de muebles (él lo confirma), vuelve a solo la ida, como siempre, y avisa', L && L.u === 50 && !/ida y vuelta/.test(L.c) && A.avisos.some(m => /He rehecho los km/.test(m)), JSON.stringify(L));
A.ctx._kmRutaBase = 50; A.ctx.pintarDistanciaYKm();
c('15 · el permiso de «quitar la ida y vuelta» es de un solo uso', A.ctx._kmQuitarIdaYVuelta === false && A.ctx._kmLoDecideElUsuario === false);

// ══ 5 · CABLEADO ══
c('16 · apagar y poner el cambio de muebles, y la ida entera, dejan su permiso antes de repintar', /window\._kmQuitarIdaYVuelta = true; window\._kmLoDecideElUsuario = true;[^\n]*\s*if \(window\._pintarDistanciaYKm\) window\._pintarDistanciaYKm\(\);\s*if \(typeof showSyncStatus === 'function'\) showSyncStatus\('🔄 Cambio de muebles quitado'\)/.test(H) && /window\._kmLoDecideElUsuario = true;[^\n]*\s*if \(window\._pintarDistanciaYKm\) window\._pintarDistanciaYKm\(\);\s*if \(typeof showSyncStatus === 'function'\) showSyncStatus\('🔄 Cambio de muebles: 2º mueble/.test(H) && /window\._kmEnteroOn = !!si;\s*window\._kmLoDecideElUsuario = true;/.test(H));
c('17 · las direcciones siguen recalculando al salir de la casilla (no se ha quitado nada)', /fRecField\.addEventListener\('blur', function\(\) \{ clearTimeout\(distTimer\); calcularDistancia\(\); \}\);/.test(H) && /fEntField2\.addEventListener\('blur', function\(\) \{ clearTimeout\(distTimer\); calcularDistancia\(\); \}\);/.test(H));

console.log('\n══ KM IDA Y VUELTA (v754) ══\nOK: ' + bien + '  ·  FALLOS: ' + mal);
process.exit(mal ? 1 : 0);
