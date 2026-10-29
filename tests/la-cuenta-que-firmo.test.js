'use strict';
// ════════════════════════════════════════════════════════════════════════════════════════════════════
//  LA CUENTA QUE FIRMÓ EL CLIENTE  ·  v741 (29-oct-2026, backend 2.7.1142)
//
//  El documento que firmó una clienta descontó el veinte por ciento también a «Hacer cajas» y a «Bultos»; con la
//  cuenta de siempre, las mismas líneas daban más. Asier: «el precio que le queda a un cliente ya no lo cambio; si
//  lleva más cosas se le suma, y si lleva menos se le descuenta» (un precio cerrado no vale: no se movería).
//
//  🛑 LO QUE PROTEGE:
//   · si el documento firmado DEMUESTRA esa cuenta, la ficha se cuenta así en pantalla y en el PDF,
//   · lo que se añada o se quite entra con el mismo descuento,
//   · la salida y el servicio base, nunca; y una ficha sin firmar, o de otra, como siempre,
//   · la misma cuenta que el servidor (api/dinero-ficha.js cuentaFirmada).
//  Datos inventados.
// ════════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fallos = 0;
const ok = (n, x, d) => { console.log((x ? '  ✅ ' : '  ❌ ') + n + (x || !d ? '' : '  →  ' + d)); if (!x) fallos++; };

const trozo = (re) => { const m = HTML.match(re); return m ? m[0] : ''; };
const lista = trozo(/var PROMO_CONCEPTOS_EXCLUIDOS = \[[^\]]*\]/);
const fN = trozo(/function _numEurApp\(x\) \{[\s\S]*?\n\}\n/);
const fB = trozo(/function _baseFilasFirmadas\(rows, promo, cajasConPromo\) \{[\s\S]*?\n\}\n/);
const fC = trozo(/function cuentaFirmadaApp\(data\) \{[\s\S]*?\n\}\n/);
const fX = trozo(/function _cajasConLaPromoFirmada\(nombre, fila\) \{[\s\S]*?\n\}\n/);
ok('A0 · están las piezas', !!(lista && fN && fB && fC && fX));
const win = { _promoCajasFirmada: false };
const API = new Function('window', lista + ';\n' + fN + fB + fC + fX + '\nreturn { cuentaFirmadaApp, _cajasConLaPromoFirmada, _baseFilasFirmadas };')(win);

const R = (a) => a.map(([c, u, p]) => ({ c, u: String(u), p: String(p), d: '' }));
const F = R([['Servicio base: equipo y vehículo', 1, 100], ['Colchón', 1, 19.91], ['CAJAS PERCHERO', 5, 8], ['Hacer cajas', 20, 14], ['Televisores', 3, 40], ['Bultos', 18, 5], ['Armario 3 módulos', 2, 130]]);
const r2 = (x) => Math.round(x * 100) / 100;
const doc = r2((API._baseFilasFirmadas(F, false, false) - 100) * 0.8 * 1.21 + 100 * 1.21);   // el veinte por ciento a todo menos al servicio base
const normal = r2(API._baseFilasFirmadas(F, true, false) * 1.21);
const ficha = (extra) => Object.assign({ rows: F, _rowsFirmadas: F, _promoAlFirmar: true, _promoManual: true, _totalFirmado: String(doc).replace('.', ',') + ' €' }, extra || {});

console.log('\n══ A · CUÁNDO SE CUENTA COMO LO FIRMÓ ══');
ok('A1 · el documento cuadra con el veinte por ciento también en cajas y bultos (y con la de siempre no): sí', API.cuentaFirmadaApp(ficha()) === true && doc < normal, JSON.stringify({ doc, normal }));
ok('A2 · el documento da lo de siempre: no (como siempre)', API.cuentaFirmadaApp(ficha({ _totalFirmado: String(normal).replace('.', ',') })) === false);
ok('A3 · sin firmar, con la copia de su -B o sin la promoción al firmar: no', API.cuentaFirmadaApp({ rows: F, _promoManual: true }) === false && API.cuentaFirmadaApp(ficha({ _firmadoVariante: '7000-B' })) === false && API.cuentaFirmadaApp(ficha({ _promoAlFirmar: false })) === false);
win._promoCajasFirmada = true;
ok('A4 · con la cuenta firmada, las cajas y los bultos llevan la promoción; la salida, el servicio base y lo de «entre dos», nunca',
  API._cajasConLaPromoFirmada('Hacer cajas', null) && API._cajasConLaPromoFirmada('Bultos', null) && !API._cajasConLaPromoFirmada('Salida', null) && !API._cajasConLaPromoFirmada('Servicio base: equipo y vehículo', null)
  && !API._cajasConLaPromoFirmada('Hacer cajas', { getAttribute: (k) => (k === 'data-2p' ? '1' : null) }) && !API._cajasConLaPromoFirmada('Colchón', null));
win._promoCajasFirmada = false;
ok('A5 · sin ella, nada cambia', !API._cajasConLaPromoFirmada('Hacer cajas', null));

console.log('\n══ B · ENGANCHADA DONDE TOCA ══');
ok('B1 · las tres decisiones de la promoción (la cuenta, el aviso de «no quita nada» y el PDF) la miran', (HTML.match(/if \(esExcluido && _cajasConLaPromoFirmada\(nombre, rows\[i\]\)\) esExcluido = false;/g) || []).length === 2 && /if \(excluido && typeof _cajasConLaPromoFirmada === 'function' && _cajasConLaPromoFirmada\(nombre, cr\)\) excluido = false;/.test(HTML));
const _CALC = "window._promoCajasFirmada = typeof cuentaFirmadaApp === 'function' && cuentaFirmadaApp(data);";
const _iR = HTML.indexOf('function restoreFormData(data) {'), _iLD = HTML.indexOf(_CALC);   // el de LD va antes en el fichero
ok('B2 · se calcula al abrir una ficha (por los dos caminos) antes de contar, y se quita al dejarla en blanco',
  /^function restoreFormData\(data\) \{\s*if \(!data\) return;\s*$/.test(HTML.slice(_iR, HTML.indexOf(_CALC, _iR))) && _iLD > 0 && _iLD < _iR
  && /^[^\n]*\n\s*window\._promoManual=!!data\._promoManual;\s*\n\s*CA\(\); SY\(\); CT\(\);/.test(HTML.slice(_iLD + _CALC.length))
  && /function dejarLaFichaEnBlanco\(\)\{[\s\S]{0,260}window\._promoCajasFirmada = false;/.test(HTML));

console.log('\n══ C · LA MISMA CUENTA QUE EL SERVIDOR ══');
const RAIZ = ['azkar-presupuestos', 'azkar-backend-temp'].map(d => path.resolve(__dirname, '..', '..', d)).find(d => fs.existsSync(path.join(d, 'api/dinero-ficha.js')));
if (RAIZ) {
  const D = require(path.join(RAIZ, 'api/dinero-ficha.js'));
  const casos = [ficha(), ficha({ _totalFirmado: String(normal).replace('.', ',') }), ficha({ _firmadoVariante: '7000-B' }), { rows: F, _promoManual: true }];
  ok('C1 · el servidor decide lo mismo en los mismos casos', casos.every(x => D.cuentaFirmada(x).cajasConPromo === API.cuentaFirmadaApp(x)));
  ok('C2 · y con la cuenta firmada, la ficha da lo firmado en los dos', r2(D.baseDeFicha(ficha()) * 1.21) === doc);
} else ok('C0 · (sin el servidor al lado no se compara)', true);

console.log('\n══ D · VERSIÓN ══');
const ver = (HTML.match(/var APP_VERSION = '(v\d+)';/) || [])[1];
ok('D1 · v741 o más', ver && Number(ver.slice(1)) >= 741, ver);

console.log('\n' + (fallos ? '❌ ' + fallos + ' fallos' : '✅ la cuenta que firmó: todo bien'));
process.exit(fallos ? 1 : 0);
