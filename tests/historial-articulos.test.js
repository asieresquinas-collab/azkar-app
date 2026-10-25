/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
//  EL HISTORIAL DE LA FICHA DESDE LA APP: QUÉ ARTÍCULOS SE CAMBIARON Y QUIÉN (app v732)  ·  node tests/historial-articulos.test.js
//
//  Asier, 25-oct-2026, 7:48 (Eudes, 6827): «el historial tiene que tener cambios de artículos y quién». La app no apuntaba nada.
//  Aquí se prueba el trozo DE VERDAD del index.html (window._HA) y cómo lo usa el guardado:
//    A · qué cambió entre lo que hay en la nube y lo que sube (añadido, quitado, precio, unidades)
//    B · el apunte lleva quién (quien tiene la sesión), «app» y cuándo; los guardados seguidos se juntan
//    C · los campos de la ficha también; en una ficha nueva, «nació con…»
//    D · el guardado lo manda con su marca, y una copia local subida por otro camino no pisa el historial
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path'), vm = require('vm');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let ok = 0, mal = 0;
function t(n, x, d) { if (x) { ok++; console.log('  OK  ' + n); } else { mal++; console.log('  ❌  ' + n + (d ? '\n      → ' + d : '')); } }
const J = JSON.stringify;
const a = HTML.indexOf('window._HA = (function () {');
const b = HTML.indexOf('})();', a) + 5;
if (a < 0) { console.log('❌ no encuentro window._HA'); process.exit(1); }
const win = { console, Date, Math, Object, Array, String, JSON, parseFloat, isFinite, _comercialActual: () => 'Toni' };
win.window = win;
vm.createContext(win);
vm.runInContext(HTML.slice(a, b), win);
const HA = win._HA;

console.log('\n══ A · QUÉ CAMBIÓ ══');
const nube = { rows: [{ c: 'Sofá tres plazas', u: '1', p: '144', d: '0' }, { c: 'CAJAS', u: '20', p: '3' }, { c: 'Mesa', u: '1', p: '40' }], f_tel: '600111222', f_nom: 'Ana' };
const sube = [{ c: 'CAJAS', u: '30', p: '3' }, { c: 'sofa tres plazas', u: '1', p: '120' }, { c: 'Colchón', u: '1', p: '25' }];
const d = HA.diferencias(nube.rows, sube);
t('A1 · añadido, quitado y cambiado (precio y unidades), sin que cuenten el orden ni las mayúsculas', d.anadidas.length === 1 && d.anadidas[0].c === 'Colchón' && d.quitadas.length === 1 && d.quitadas[0].c === 'Mesa' && d.cambiadas.length === 2 && d.cambiadas.some(x => x.antes.p === 144 && x.despues.p === 120) && d.cambiadas.some(x => x.antes.u === 20 && x.despues.u === 30), J(d));
t('A2 · sin cambios, nada', (function () { var z = HA.diferencias(nube.rows, nube.rows.slice().reverse()); return !z.anadidas.length && !z.quitadas.length && !z.cambiadas.length; })());

console.log('\n══ B · EL APUNTE Y LOS GUARDADOS SEGUIDOS ══');
const ap1 = HA.apuntar('9101', nube, { rows: sube, timestamp: 1 });
const h1 = ap1._historialArticulos;
t('B1 · quién (la sesión de la app), por dónde y cuándo', h1 && h1.length === 1 && h1[0].quien === 'Toni' && h1[0].via === 'app' && /^\d{4}-\d{2}-\d{2}T/.test(h1[0].cuando) && h1[0].sesion === HA.sesion, J(h1));
t('B2 · lo que sumaban las líneas antes y después', h1[0].suma_antes === 244 && h1[0].suma_despues === 235, J([h1[0].suma_antes, h1[0].suma_despues]));
const nube2 = Object.assign({}, nube, { rows: sube, _historialArticulos: h1 });
const ap2 = HA.apuntar('9101', nube2, { rows: [{ c: 'CAJAS', u: '30', p: '3' }, { c: 'sofa tres plazas', u: '1', p: '150' }, { c: 'Colchón', u: '1', p: '25' }] });
const h2 = ap2._historialArticulos;
t('B3 · el guardado seguido se junta en un solo apunte: «144 → 150», no «144 → 120» y «120 → 150»', h2 && h2.length === 1 && h2[0].cambiadas.some(x => x.antes.p === 144 && x.despues.p === 150), J(h2));
const ap3 = HA.apuntar('9101', Object.assign({}, nube2, { _historialArticulos: h2 }), { rows: nube2.rows });
t('B4 · si no cambia nada frente a la nube, no se manda historial', !('_historialArticulos' in ap3) || Array.isArray(ap3._historialArticulos));

console.log('\n══ C · LOS CAMPOS Y LA FICHA NUEVA ══');
const ap4 = HA.apuntar('9101', nube, { f_tel: '659820225', f_nom: 'Ana', timestamp: 2 });
t('C1 · el teléfono cambiado, con quién', ap4._historialCampos && ap4._historialCampos.length === 1 && ap4._historialCampos[0].campo === 'f_tel' && ap4._historialCampos[0].antes === '600111222' && ap4._historialCampos[0].despues === '659820225' && ap4._historialCampos[0].quien === 'Toni', J(ap4));
const ap5 = HA.apuntar('9102', null, { rows: [{ c: 'Mesa', u: '1', p: '40' }], f_nom: 'Luis' });
t('C2 · una ficha nueva: «nació con una línea» y sin apuntar cada campo', ap5._historialArticulos && ap5._historialArticulos[0].creada === true && ap5._historialArticulos[0].anadidas.length === 1 && !ap5._historialCampos, J(ap5));
t('C3 · los campos que se siguen', HA.campoSeguido('f_obs') && HA.campoSeguido('_promoManual') && !HA.campoSeguido('f_ref') && !HA.campoSeguido('_app'));

console.log('\n══ D · CÓMO SE SUBE ══');
t('D1 · el guardado mira la nube y apunta antes de subir, con su marca', /if \(_leidaHA && window\._HA\) \{ var _apHA = window\._HA\.apuntar\(ref, _nubeHA, fbData\);/.test(HTML) && /fbData\.__conHistorial = true;/.test(HTML));
t('D2 · si no se pudo mirar la nube, no se apunta a ciegas', /_leidaHA = true;/.test(HTML));
const i = HTML.indexOf('var _setDocHA = function (refDoc, data, opts) {');
const trozo = HTML.slice(i, HTML.indexOf('};', i) + 2);
let escrito = null;
const w2 = { setDoc: function (r, dd) { escrito = dd; } };
vm.createContext(w2);
vm.runInContext(trozo + '\nthis._f = _setDocHA;', w2);
w2._f({ path: 'presupuestos/9101' }, { rows: [], _historialArticulos: [{ viejo: true }], _historialCampos: [], f_nom: 'x' }, { merge: true });
t('D3 · una copia local entera subida por otro camino no manda su historial (no pisa el de otros)', escrito && !('_historialArticulos' in escrito) && !('_historialCampos' in escrito) && escrito.f_nom === 'x', J(escrito));
w2._f({ path: 'presupuestos/9101' }, { rows: [], _historialArticulos: [{ nuevo: true }], __conHistorial: true }, { merge: true });
t('D4 · el guardado con su marca sí lo manda (y la marca no sube)', escrito && escrito._historialArticulos && escrito._historialArticulos[0].nuevo && !('__conHistorial' in escrito), J(escrito));
w2._f({ path: 'otra/1' }, { _historialArticulos: [1] });
t('D5 · fuera de las fichas no se toca nada', escrito && escrito._historialArticulos);
t('D6 · las subidas de copias locales al sincronizar van por el mismo sitio', !/await setDoc\(doc\(firestoreDB, 'presupuestos', p\.id\), p, \{ merge: true \}\);/.test(HTML) && !/await setDoc\(doc\(window\._fb\.db, 'presupuestos', p\.id\), p, \{ merge: true \}\);/.test(HTML));
const V = (HTML.match(/var APP_VERSION = '(v\d+)'/) || [])[1];
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const VJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).version;
t('E1 · la app, el service worker y version.json dicen la misma versión', V && SW.indexOf("'azkar-pwa-" + V + "'") >= 0 && VJ === V);
console.log('\n' + (mal ? '❌ ' : '✅ ') + ok + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
