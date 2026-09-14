/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
// LA REGLA DE LA PROMO, IGUAL EN LOS DOS SITIOS (app v661 · backend 2.7.739)
//
// El 14-sep se vio que el servidor calculaba los totales SIN el 20%, porque la
// promo vive solo aquí, en la pantalla: CA() se la resta al pintar y NO la
// escribe en las filas. Se arregló pasándole al servidor la banderita
// _promoManual de la ficha y copiando allí la regla de qué línea entra y cuál
// no (api/dinero-ficha.js del backend).
//
// Dos copias de una regla de dinero es dos maneras de que un día no digan lo
// mismo. Esta prueba vigila la de aquí: si alguien toca la lista de conceptos
// excluidos, salta, y hay que tocar también la del servidor.
//
// Ejecutar:  node tests/la-promo-no-se-separa.test.js
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log('  ✅ ' + nombre); }
  else { console.log('  ❌ ' + nombre + (detalle ? ' → ' + detalle : '')); fallos++; }
}

console.log('\n💶 LA REGLA DE LA PROMO, IGUAL EN LOS DOS SITIOS\n');

// La lista que TIENE que estar también en el backend (api/dinero-ficha.js).
const ESPERADA = [
  'Cajas/Maletas (max 15kg)',
  'Bultos',
  'Hacer cajas',
  'Caja perchero',
  'Salida',
  'Servicio base: equipo y vehículo'
];

console.log('A · la lista de lo que NO lleva el 20%');

const m = HTML.match(/var PROMO_CONCEPTOS_EXCLUIDOS\s*=\s*\[([^\]]*)\]/);
ok('A1 · la lista sigue estando en index.html', !!m);
let lista = [];
if (m) {
  lista = m[1].split(',').map(function (t) {
    return t.trim().replace(/^['"]|['"]$/g, '').replace(/\\u00[0-9a-f]{2}/gi, function (x) {
      return JSON.parse('"' + x + '"');
    });
  }).filter(Boolean);
}
ok('A2 · tiene los mismos conceptos que el servidor',
  JSON.stringify(lista) === JSON.stringify(ESPERADA),
  JSON.stringify(lista));
ok('A3 · la salida sigue fuera (norma suya del 9-ago)', lista.indexOf('Salida') >= 0);
ok('A4 · las cajas hechas siguen fuera (lo confirmó el 14-sep)', lista.indexOf('Hacer cajas') >= 0);

console.log('\nB · las otras dos exclusiones');
ok('B1 · lo que va ENTRE DOS no lleva promo', /data-2p/.test(HTML));
ok('B2 · la línea del 2º del cambio tampoco', /\(2\[\\u00bao\]|\(2\[ºo\] del cambio\)/.test(HTML));

console.log('\nC · la promo se guarda en la ficha (es lo que lee el servidor)');
ok('C1 · se guarda _promoManual al grabar', (HTML.match(/data\._promoManual\s*=\s*!!window\._promoManual/g) || []).length >= 2);
ok('C2 · y se recupera al abrir la ficha', (HTML.match(/window\._promoManual\s*=\s*!!data\._promoManual/g) || []).length >= 2);

console.log('\nD · la cuenta de la pantalla no ha cambiado');
ok('D1 · sigue restando el 20% por línea al pintar', /var dtoPromo = t \* 0\.20;/.test(HTML));
ok('D2 · y solo a las líneas que entran', /if\(promo && !esExcluido && t > 0\)/.test(HTML));

console.log('\n' + (fallos === 0 ? '✅ TODO BIEN' : '❌ FALLOS: ' + fallos) + '\n');
process.exit(fallos === 0 ? 0 : 1);
