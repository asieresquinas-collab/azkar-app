/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
//  TIEMPOS REALES EN LA APP: UN TIEMPO PARA CADA LÍNEA Y EL FACTOR DE LOS PARTES (app v732)  ·  node tests/tiempos-reales.test.js
//
//  Asier, 25-oct-2026, 8:20: «que los tiempos de la app sean tiempos reales como los que vamos a poner ahora, contando todo».
//    A · la tabla de la app es la misma que la del servidor
//    B · lo que no está en la tabla lleva su tiempo (puertas, cajas, familia, medio) — el trozo DE VERDAD del index.html
//    C · las filas se rellenan con él, y el total se corrige con el factor medido en los partes (config/tiempos_reales)
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path'), vm = require('vm');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let ok = 0, mal = 0;
function t(n, x, d) { if (x) { ok++; console.log('  OK  ' + n); } else { mal++; console.log('  ❌  ' + n + (d ? '\n      → ' + d : '')); } }
const J = JSON.stringify;
const i = HTML.indexOf('var TIEMPOS_BASE = {'), j = HTML.indexOf('function TL_LOOKUP(inp)', i);
const ctx = { console }; ctx.window = ctx;
vm.createContext(ctx); vm.runInContext(HTML.slice(i, j), ctx);

console.log('\n══ A · LA MISMA TABLA QUE EL SERVIDOR ══');
let srv = null;
try { srv = require('/home/claude/azkar-presupuestos/api/catalogo-precios').TIEMPOS_BASE; } catch (e) { srv = null; }
if (srv) {
  const faltan = Object.keys(srv).filter(k => !(k in ctx.TIEMPOS_BASE)), distintos = Object.keys(srv).filter(k => k in ctx.TIEMPOS_BASE && J(srv[k]) !== J(ctx.TIEMPOS_BASE[k]));
  t('A1 · ninguna cosa de la tabla del servidor falta en la app, y con los mismos minutos', !faltan.length && !distintos.length, J({ faltan, distintos }));
} else t('A1 · (sin el servidor a mano: no se compara)', true);
t('A2 · los armarios por puertas están en la app', ctx.TIEMPOS_BASE['Armario 3 puertas'] && ctx.TIEMPOS_BASE['Mesilla'] && ctx.TIEMPOS_BASE['Cama estructura']);

console.log('\n══ B · UN TIEMPO PARA CADA COSA ══');
const e = ctx.tiempoEstimadoApp;
t('B1 · la tabla, aunque venga sin tilde o con paréntesis', e('sofa tres plazas').total === 20 && e('Mesilla (alta)').total === 5 && e('Sofá tres plazas').como === 'tabla');
t('B2 · el armario de 10 puertas = 5 de 2 puertas (125 + 100)', e('Armario de material de 10 puertas').total === 225 && e('Armario de material de 10 puertas').como === 'puertas');
t('B3 · las cajas 3 min; hacerlas 13', e('Cajas de ropa y varios').total === 3 && e('Hacer cajas en cocina').total === 13);
t('B4 · la mesa de escritorio es un escritorio (25); la L grande, la mesa mayor (30)', e('Mesa de escritorio').total === 25 && e('Mesa L grande').total === 30, J([e('Mesa de escritorio'), e('Mesa L grande')]));
t('B5 · lo que no se parece a nada: el tiempo medio, y nunca cero', e('Corchos de pared').como === 'medio' && ['Corchos de pared', 'Taquillas', 'Fichero', 'Calefactor', 'Patinetes', 'Colgador'].every(x => e(x).total > 0));
t('B6 · vacío → nada', e('') === null);

console.log('\n══ C · LAS FILAS Y EL TOTAL ══');
t('C1 · al crear una fila sin minutos se rellena con la tabla o con el tiempo medio', /var t=TIEMPOS_BASE\[c\] \? \{ total: TIEMPOS_BASE\[c\]\[0\]\+TIEMPOS_BASE\[c\]\[1\] \} : tiempoEstimadoApp\(c\);/.test(HTML) && /if\(t && t\.total>0\) div\.querySelector\('\.tiempo-input'\)\.value=t\.total;/.test(HTML));
t('C2 · y al escribir el concepto también', /var t=TIEMPOS_BASE\[name\] \? \{ total: TIEMPOS_BASE\[name\]\[0\]\+TIEMPOS_BASE\[name\]\[1\] \} : tiempoEstimadoApp\(name\);/.test(HTML));
t('C3 · el total del servicio va × el factor de los partes reales, y se dice', /var tiempoTrabajoReal=Math\.ceil\(totalMin\*_fReal\/ops\);/.test(HTML) && /según los partes reales/.test(HTML) && /aún sin partes para corregir/.test(HTML));
t('C4 · el factor se lee de config/tiempos_reales al conectar la nube', /window\._fb\.doc\(window\._fb\.db,'config','tiempos_reales'\)/.test(HTML) && /try \{ _ttCargarFactor\(\); \} catch \(e\) \{\}/.test(HTML));
ctx.window._tiemposReales = null; t('C5 · sin factor, 1', ctx._ttFactor() === 1);
ctx.window._tiemposReales = { factor: 2.3 }; t('C6 · con factor, el factor', ctx._ttFactor() === 2.3);
console.log('\n' + (mal ? '❌ ' : '✅ ') + ok + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
