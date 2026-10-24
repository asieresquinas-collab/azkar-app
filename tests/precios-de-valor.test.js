/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
//  APARATOS A PRECIO SIMBÓLICO: SE AVISA ANTES DE QUE SALGA (app v728)  ·  node tests/precios-de-valor.test.js
//
//  Asier, 24-oct-2026: «no se puede cobrar dos euros por una pantalla que vale doscientos… que se diga ANTES de
//  que salga el presupuesto». Aquí se prueba el trozo DE VERDAD del index.html con una tabla de mentira:
//    A · el ordenador con pantalla a 12 € y la impresora a 2 € salen en el aviso; el mueble de la tele no
//    B · «Cancelar» para el envío y «Aceptar» lo deja seguir; sin aparatos baratos no se pregunta nada
//    C · el aviso está en los dos caminos que mandan el presupuesto (correo y WhatsApp), antes de crear la firma
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path'), vm = require('vm');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = HTML.indexOf('var _RE_VALOR_V728');
const b = HTML.indexOf('async function PA(){', a);
const TROZO = HTML.slice(a, b);
let ok = 0, mal = 0;
function t(n, x, d) { if (x) { ok++; console.log('  OK  ' + n); } else { mal++; console.log('  ❌  ' + n + (d ? '\n      → ' + d : '')); } }
if (a < 0 || b < 0) { console.log('❌ no encuentro el trozo del aviso'); process.exit(1); }

function app(filas, respuesta) {
  const preguntas = [];
  const rows = filas.map(f => ({
    querySelector: (q) => q === 'input[list]' ? { value: f[0] } : null,
    querySelectorAll: (q) => q === 'input[type=number]' ? [{ value: String(f[1]) }, { value: String(f[2]) }, { value: '' }, { value: '' }] : []
  }));
  const win = { document: { querySelectorAll: (q) => q === '#tb .cr' ? rows : [] }, confirm: (m) => { preguntas.push(m); return respuesta; }, String, parseFloat };
  vm.createContext(win);
  vm.runInContext(TROZO, win);
  return { win, preguntas };
}

console.log('\n══ A · QUÉ SALE EN EL AVISO ══');
const A = app([['PC + PANTALLA', 2, 12], ['IMPRESORAS', 1, 2], ['Mueble TV pequeño', 1, 20], ['Televisor grande', 1, 64.63], ['CAJAS/MALETAS', 10, 6.8], ['Portátil', 1, '8,5']], false);
const l = A.win._preciosSimbolicosDeValor();
t('A1 · el ordenador con pantalla a 12 € y la impresora a 2 €', l.indexOf('PC + PANTALLA a 12,00 €') >= 0 && l.indexOf('IMPRESORAS a 2,00 €') >= 0, JSON.stringify(l));
t('A2 · el portátil escrito con tilde y el precio con coma también', l.indexOf('Portátil a 8,50 €') >= 0, JSON.stringify(l));
t('A3 · el mueble de la tele, la tele a su precio y las cajas NO', l.length === 3, JSON.stringify(l));

console.log('\n══ B · LO QUE HACE CADA BOTÓN ══');
t('B1 · «Cancelar» → no se manda', A.win._avisoPreciosDeValor() === false && A.preguntas.length === 1 && /Antes de que salga el presupuesto/.test(A.preguntas[0]) && /PC \+ PANTALLA a 12,00 €/.test(A.preguntas[0]));
const B = app([['PC + PANTALLA', 2, 12]], true);
t('B2 · «Aceptar» → sigue (el precio lo decide quien lo manda)', B.win._avisoPreciosDeValor() === true && B.preguntas.length === 1);
const C0 = app([['SOFA 3 PLAZAS', 1, 60], ['Televisor pequeño', 1, 30]], false);
t('B3 · sin aparatos baratos no se pregunta nada', C0.win._avisoPreciosDeValor() === true && C0.preguntas.length === 0);

console.log('\n══ C · ESTÁ EN LOS DOS CAMINOS, ANTES DE CREAR LA FIRMA ══');
const pa = HTML.slice(HTML.indexOf('async function PA(){'), HTML.indexOf('async function PA(){') + 9000);
t('C1 · mandar por correo (PA): el aviso va antes del PDF y de la firma', pa.indexOf('_avisoPreciosDeValor()') > 0 && pa.indexOf('_avisoPreciosDeValor()') < pa.indexOf("/api/firma/crear") && pa.indexOf('_avisoPreciosDeValor()') < pa.indexOf('savePdfViaServer('));
const wa = HTML.slice(HTML.indexOf('async function enviarPresupuestoWhatsApp() {'), HTML.indexOf('async function enviarPresupuestoWhatsApp() {') + 4000);
t('C2 · mandar por WhatsApp: el aviso va antes de crear el enlace', wa.indexOf('_avisoPreciosDeValor()') > 0 && wa.indexOf('_avisoPreciosDeValor()') < wa.indexOf('_v236EnsureRowsFromLocal'));
t('C3 · la versión es la v728 (la app y el service worker)', /var APP_VERSION = 'v728';/.test(HTML) && /azkar-pwa-v728/.test(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8')));

console.log('\n' + (mal ? '❌ ' : '✅ ') + ok + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
