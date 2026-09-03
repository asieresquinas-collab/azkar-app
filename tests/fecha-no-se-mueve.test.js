'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  LA FECHA DEL PRESUPUESTO NO SE MUEVE  ·  app v571 (3-sep-2026)
//
//  Asier, con la lista delante: fichas de ayer (6617, 6626) con el presupuesto ya
//  mandado salían con fecha de HOY. Desde la v109, updateFechaModificacion() ponía la
//  fecha de hoy en cada recálculo (CA/CT saltan al abrir la ficha, tocar una línea,
//  marcar EN MARCHA…). La fecha impresa en el PDF que el cliente ya tiene cambiaba sola.
//  Aquí se ejecuta la función REAL sacada del index.html.
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };
const i = H.indexOf('function updateFechaModificacion(){'), j = H.indexOf('\n}\n', i);
const SRC = H.slice(i, j + 3);
c('A1 · la función existe', i > 0 && j > i);
function corre(fecha, ref, cargando) {
  const els = { f_fecha: { value: fecha }, f_ref: { value: ref } };
  const fn = new Function('document', 'window', SRC + '\nupdateFechaModificacion(); return document.getElementById("f_fecha").value;');
  return fn({ getElementById: id => els[id] || null }, { _presupuestoLoading: !!cargando });
}
const HOY = new Date().toISOString().slice(0, 10);
c('A2 · 🛑 una ficha con fecha de ayer y presupuesto mandado NO cambia de fecha al recalcular', corre('2026-09-02', '6626') === '2026-09-02', corre('2026-09-02', '6626'));
c('A3 · una ficha nueva sin fecha sí coge la de hoy', corre('', '6700') === HOY, corre('', '6700'));
c('A4 · sin referencia no se toca nada', corre('', '') === '');
c('A5 · mientras se carga una ficha, tampoco', corre('', '6700', true) === '');
c('A6 · CA y CT siguen llamándola (por si acaso: la protección está DENTRO)', (H.match(/updateFechaModificacion\(\);/g) || []).length >= 2);
const V = (H.match(/var APP_VERSION = 'v(\d+)'/) || [])[1];
c('A7 · la app va por v571 o más', Number(V) >= 571, 'v' + V);
c('A8 · la Ayuda lo cuenta', /LA FECHA DEL PRESUPUESTO YA NO SE MUEVE/.test(H));
console.log('\n  ' + bien + ' bien · ' + mal + ' mal');
process.exit(mal ? 1 : 0);
