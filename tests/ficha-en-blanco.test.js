'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  LA FICHA NUEVA NACE EN BLANCO  ·  app v561 (1-sep-2026)
//
//  Asier: «cada vez que hago un presupuesto me sale como que tiene la ubicación…
//  como que se precarga en la recogida y en la entrega».
//
//  Y salía. La app tenía DOS puertas para empezar una ficha:
//    · «↺ Limpiar» (RF), que lo dejaba todo a cero,
//    · «Nuevo presupuesto» (newPresupuesto), con una LISTA de campos escrita a mano
//      en la que NO estaba el cuadradito del PISO.
//  Resultado: calle vacía + piso del cliente anterior («6d») = la dirección que se
//  le manda al mapa era «, 6d». Google se enganchaba a lo más parecido y aparecían
//  solos el mapa, los kilómetros y el aviso rojo del desplazamiento.
//
//  🛑 LO QUE PROTEGE ESTE BANCO:
//   · que el piso/puerta se vacíe DE VERDAD (se ejecuta el código real, no se mira),
//   · que la dirección que sale de una ficha en blanco sea VACÍA, no «, 6d»,
//   · que «Nuevo presupuesto» NO vuelva a tener su propia lista de campos,
//   · y que las dos puertas sigan llamando a la MISMA función.
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };

// ── Se cogen las funciones REALES del fichero ────────────────────────────────
function trozo(desde, hasta) {
  const i = H.indexOf(desde);
  const j = H.indexOf(hasta, i);
  if (i < 0 || j < 0) return null;
  return H.slice(i, j);
}
const SRC_BLANCO = trozo('function dejarLaFichaEnBlanco(){', '// «↺ Limpiar»');
const SRC_PISOS = trozo('function limpiarPisos() {', 'function repartirDirecciones');
const SRC_DIRC = trozo('function dirCompleta(p) {', '// Reparte una dirección');

console.log('\n══ A · LAS FUNCIONES ESTÁN DONDE DEBEN ══');
c('A1 · existe la función que deja la ficha en blanco', !!SRC_BLANCO);
c('A2 · y sigue existiendo la que vacía los pisos', !!SRC_PISOS);
c('A3 · y la que arma la dirección entera', !!SRC_DIRC);
if (!SRC_BLANCO || !SRC_PISOS || !SRC_DIRC) { console.log('\n  ' + bien + ' bien · ' + (mal + 1) + ' mal'); process.exit(1); }

// ── Un navegador de mentira, con lo justo ────────────────────────────────────
function campo(id, valor, tipo) {
  return {
    id: id, value: valor === undefined ? '' : valor, tagName: (tipo || 'INPUT'),
    selectedIndex: 3, classList: { add() {} }, setAttribute() {}, getAttribute() { return ''; },
    style: {}, appendChild() {}, querySelectorAll() { return []; }
  };
}
function montarDom(pisoRec, pisoEnt) {
  const els = {
    f_rec: campo('f_rec', ''), f_ent: campo('f_ent', ''),
    f_rec_pta: campo('f_rec_pta', pisoRec), f_ent_pta: campo('f_ent_pta', pisoEnt),
    f_fecha: campo('f_fecha', '2020-01-01'), f_com: campo('f_com', 'Nadie'),
    f_tipo: campo('f_tipo', 'Local', 'SELECT'), f_pago: campo('f_pago', 'Efectivo', 'SELECT'),
    tb: campo('tb'), f_ref: campo('f_ref', '6588')
  };
  const doc = {
    getElementById: id => els[id] || null,
    createElement: () => campo('nuevo'),
    querySelectorAll: sel => (/page-presupuesto/.test(sel)
      ? [els.f_rec, els.f_ent, els.f_rec_pta, els.f_ent_pta, els.f_fecha, els.f_com, els.f_ref]
      : [])
  };
  return { els, doc };
}

function correr(pisoRec, pisoEnt, extra) {
  const { els, doc } = montarDom(pisoRec, pisoEnt);
  const win = Object.assign({
    _currentPlataforma: true, _currentOruga: true, _currentGuardamuebles: true,
    _currentPermuta: true, _gruaTipo: 'grua8', _kmRutaReal: 999, _ultimaRuta: { km: 18.8 },
    _rutaEntera: { x: 1 }, _promoManual: true, _currentPresupuestoRef: '6588'
  }, extra || {});
  // las de verdad, sacadas del index.html
  win.limpiarPisos = new Function('document', SRC_PISOS + '; return limpiarPisos;')(doc);
  const dirCompleta = new Function('document', SRC_DIRC + '; return dirCompleta;')(doc);
  const stub = () => {};
  new Function('window', 'document', 'CA', 'SY', '_comercialActual', 'updateGuardamueblesUI',
    'actualizarBannerPromo', 'soltarTarifaKm', 'setAscensor', 'updatePermutaUI',
    'updatePlataformaUI', 'updateOrugaUI', 'rid',
    SRC_BLANCO + '; dejarLaFichaEnBlanco();')(
    win, doc, stub, stub, () => 'Asier', stub, stub, stub, stub, stub, stub, stub, 0);
  return { els, win, dir: p => dirCompleta(p) };
}

console.log('\n══ B · 🛑 EL CASO DE ASIER: EL «6d» PEGADO ══');
let r = correr('6d', '6d');
c('B1 · 🛑 el piso de la RECOGIDA se vacía', r.els.f_rec_pta.value === '', JSON.stringify(r.els.f_rec_pta.value));
c('B2 · 🛑 el piso de la ENTREGA se vacía', r.els.f_ent_pta.value === '', JSON.stringify(r.els.f_ent_pta.value));
c('B3 · 🛑 y la dirección de entrega que sale ya NO es «, 6d», es NADA',
  r.dir('ent') === '', JSON.stringify(r.dir('ent')));
c('B4 · 🛑 ni la de recogida', r.dir('rec') === '', JSON.stringify(r.dir('rec')));

console.log('\n══ C · Y NO SE PEGA NADA MÁS DEL CLIENTE ANTERIOR ══');
c('C1 · la ruta ya medida se suelta', r.win._kmRutaReal === null && r.win._ultimaRuta === null);
c('C2 · y el recorrido entero de sus paradas', r.win._rutaEntera === null);
c('C3 · la grúa se apaga', r.win._gruaTipo === '');
c('C4 · la plataforma y la oruga, también', r.win._currentPlataforma === false && r.win._currentOruga === false);
c('C5 · el guardamuebles y el cambio de muebles', r.win._currentGuardamuebles === false && r.win._currentPermuta === false);
c('C6 · la promo del 20% no se hereda', r.win._promoManual === false);
c('C7 · la ficha deja de estar abierta', r.win._currentPresupuestoRef === null);
c('C8 · las dos listas desplegables vuelven a su primera opción',
  r.els.f_tipo.selectedIndex === 0 && r.els.f_pago.selectedIndex === 0);
c('C9 · la fecha es la de hoy', r.els.f_fecha.value === new Date().toISOString().slice(0, 10));
c('C10 · y el comercial es quien está usando la app', r.els.f_com.value === 'Asier');

console.log('\n══ D · UN PISO SANO TAMBIÉN SE VA (la ficha es NUEVA) ══');
let r2 = correr('3º izquierda', '5B');
c('D1 · el de recogida', r2.els.f_rec_pta.value === '');
c('D2 · el de entrega', r2.els.f_ent_pta.value === '');

// ── El vaciado del piso, a solas ─────────────────────────────────────────────
// En la ficha entera el piso se vacía por DOS caminos (la llamada a limpiarPisos
// y el barrido de todos los campos de la página). Aquí se prueba el primero SOLO,
// para que si algún día se rompe se vea aquí y no dentro de meses en una factura.
console.log('\n══ D2 · 🛑 EL VACIADO DEL PISO, PROBADO A SOLAS ══');
(function () {
  const { els, doc } = montarDom('6d', '4ºC');
  const lp = new Function('document', SRC_PISOS + '; return limpiarPisos;')(doc);
  lp();
  c('D2.1 · 🛑 limpiarPisos() vacía la recogida por su cuenta', els.f_rec_pta.value === '', JSON.stringify(els.f_rec_pta.value));
  c('D2.2 · 🛑 y la entrega', els.f_ent_pta.value === '', JSON.stringify(els.f_ent_pta.value));
})();
c('D2.3 · y la ficha en blanco lo llama de verdad',
  /window\.limpiarPisos\) window\.limpiarPisos\(\);/.test(SRC_BLANCO));
c('D2.4 · 🛑 además del barrido de TODOS los campos de la página (el segundo cinturón)',
  /querySelectorAll\('#page-presupuesto input,#page-presupuesto textarea'\)/.test(SRC_BLANCO)
  && /inputs\[i\]\.value\s*=\s*''/.test(SRC_BLANCO));

console.log('\n══ E · 🛑 UNA SOLA PUERTA, PARA QUE NO VUELVAN A SEPARARSE ══');
c('E1 · «Limpiar» llama a la función común',
  /function RF\(\)\{\s*if\(!confirm\([^)]*\)\) return;\s*dejarLaFichaEnBlanco\(\);\s*\}/.test(H));
c('E2 · 🛑 «Nuevo presupuesto» también', /async function newPresupuesto\(\) \{[\s\S]{0,900}?dejarLaFichaEnBlanco\(\);/.test(H));
const _np = H.slice(H.indexOf('async function newPresupuesto() {'), H.indexOf('async function delPresupuesto'));
c('E3 · 🛑 y ya NO tiene su propia lista de campos escrita a mano',
  !/const fields = \['f_ref'/.test(_np));
c('E4 · las entregas de MÁS del cliente anterior se quitan',
  /window\.entregasRestaurar\) window\.entregasRestaurar\(\{\}\)/.test(SRC_BLANCO));

console.log('\n══ F · VERSIÓN Y REGISTRO ══');
const _v = parseInt((H.match(/var APP_VERSION\s*=\s*['"]v?(\d+)/) || [])[1] || '0', 10);
c('F1 · la versión es la de este cambio o más nueva', _v >= 561, 'va por v' + _v);
const _sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
c('F2 · y la caché del sw.js va a la par', new RegExp('azkar-pwa-v' + _v).test(_sw));

console.log('\n──────────────────────────────────────────────');
console.log('  ' + bien + ' bien · ' + mal + ' mal');
console.log('──────────────────────────────────────────────');
process.exit(mal ? 1 : 0);
