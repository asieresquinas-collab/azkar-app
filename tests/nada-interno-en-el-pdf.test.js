'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  EL INTERRUPTOR DE LA ORUGA, IMPRESO EN EL PRESUPUESTO DEL CLIENTE
//  app v640  ·  8-sep-2026, 16:11
//
//  Asier mandó un presupuesto y en el PDF, entre las líneas y los totales, salía
//  esto: «🛠️ INCLUYE ORUGA SALVAESCALERAS — Activa para añadir la cláusula 20ª…»
//  con su interruptor. Y encima apagado.
//
//  Causa: la lista de «esto no se imprime» del @media print nombra los
//  interruptores UNO A UNO —guardamuebles, permuta, plataforma— y cuando se
//  añadió el de la ORUGA nadie lo metió en la lista. Un interruptor de oficina
//  en el papel que lee el cliente.
//
//  Arreglo: se añade el de la oruga Y una regla que caza a TODOS los que vengan
//  después ([id^='toggle-'][id$='-wrap']), para que esto no dependa de acordarse.
//  Comprobado además con un navegador de verdad (Chrome sin ventana): en pantalla
//  el interruptor sale y al imprimir su display es «none».
// ══════════════════════════════════════════════════════════════════════════════
const path = require('path'), fs = require('fs');
const RAIZ = path.join(__dirname, '..');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };
const H = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

// el bloque de «ocultar UI» al imprimir
const i = H.indexOf('@media print{\n/* Ocultar UI */');
const BLOQUE = i >= 0 ? H.slice(i, i + 1000) : '';

console.log('\n══ A · EL INTERRUPTOR DE LA ORUGA ══');
c('A1 · el interruptor existe en la app (es de oficina, no del cliente)', /id='toggle-oruga-wrap'/.test(H));
c('A2 · 🛑 y NO se imprime: está en la lista', BLOQUE.indexOf('#toggle-oruga-wrap') >= 0, BLOQUE.slice(0, 120));

console.log('\n══ B · Y LOS QUE VENGAN DESPUÉS, TAMPOCO ══');
c('B1 · 🛑 hay una regla que caza TODOS los interruptores, no uno a uno',
  BLOQUE.indexOf("[id^='toggle-'][id$='-wrap']") >= 0);
const toggles = Array.from(new Set((H.match(/id='toggle-[a-z0-9-]+-wrap'/g) || []).map(x => x.slice(4, -1))));
c('B2 · hay al menos cuatro interruptores en la app', toggles.length >= 4, toggles.join(', '));
c('B3 · 🛑 TODOS quedan tapados al imprimir (por nombre o por la regla general)',
  toggles.every(id => BLOQUE.indexOf('#' + id) >= 0) || BLOQUE.indexOf("[id^='toggle-'][id$='-wrap']") >= 0,
  toggles.filter(id => BLOQUE.indexOf('#' + id) < 0).join(', '));

console.log('\n══ C · LO QUE YA ESTABA TAPADO SIGUE TAPADO ══');
for (const id of ['topnav', 'page-parte', 'page-fichaje', 'page-ayuda', 'btn-pedir-autonomos', 'toggle-plataforma-wrap', 'toggle-guardamuebles-wrap', 'toggle-permuta-wrap']) {
  c('C · ' + id, BLOQUE.indexOf('#' + id) >= 0);
}

console.log('\n══ D · LA VERSIÓN SUBE EN LOS TRES SITIOS ══');
const v = (H.match(/var APP_VERSION = '(v\d+)'/) || [])[1] || '';
const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
const vj = JSON.parse(fs.readFileSync(path.join(RAIZ, 'version.json'), 'utf8'));
c('D1 · va por la v640 o más nueva', parseInt(String(v).slice(1), 10) >= 640, v);
c('D2 · el guardián de la copia lleva la misma', sw.indexOf('azkar-pwa-' + v) >= 0, v);
c('D3 · y la ficha de versión también', vj.version === v, JSON.stringify(vj));

console.log('\n──────────────────────────────────────────────');
console.log('  ' + bien + ' bien · ' + mal + ' mal');
console.log('──────────────────────────────────────────────');
process.exit(mal ? 1 : 0);
