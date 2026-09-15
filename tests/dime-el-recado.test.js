/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
// «DIME» — EL RECADO EN VOZ ALTA (app v661 · backend 2.7.742)
//
// Asier, 14-sep: «me ha mandado una notificación que ponía que me tenía que decir
// una cosa, cuatro veces hoy. Lo que tiene que hacer es decírmelo hablado... y que
// le pueda decir en voz "dime" y me lo diga».
//
// Ejecutar:  node tests/dime-el-recado.test.js
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log('  ✅ ' + nombre); }
  else { console.log('  ❌ ' + nombre + (detalle ? ' → ' + detalle : '')); fallos++; }
}
console.log('\n🗣️ «DIME» — EL RECADO EN VOZ ALTA\n');

const m = HTML.match(/var _RE_DIME = new RegExp\('(.*)', 'i'\);/);
ok('A1 · existe la orden «dime»', !!m);
const RE = m ? new RegExp(eval("'" + m[1] + "'"), 'i') : null;
const SI = ['dime', 'Dímelo', 'dimelo', 'oye azkarin, dime', 'qué me tenías que decir', 'que me querias decir', 'qué era eso', 'la notificación', 'qué me has mandado', 'cuéntame'];
const NO = ['dime cuánto vale la grúa', 'dime el total de la ficha 6692', 'dime qué tengo mañana', 'la notificación de ayer decía otra cosa', 'me dijo que sí'];
ok('A2 · pilla todas las formas de pedirlo', RE && SI.every(t => RE.test(t)), SI.filter(t => !RE.test(t)).join(' | '));
ok('A3 · 🛑 y NO se traga una pregunta normal que empieza por «dime»', RE && NO.every(t => !RE.test(t)), NO.filter(t => RE.test(t)).join(' | '));

console.log('\nB · qué hace');
ok('B1 · pide al servidor lo que te tenía que decir (?dime=1)', /companero\?apiKey=[^']*' \+ encodeURIComponent\(window\._apiKey \|\| ''\) \+ '&dime=1/.test(HTML));
ok('B2 · lo lee en voz alta', /chatTTSEnabled = true; chatSpeak\(t\);/.test(HTML));
ok('B3 · y lo enseña en el chat', /addMsg\('bot', \(d && d\.hay \? '👋 ' : ''\) \+ t\)/.test(HTML));
ok('B4 · no gasta motor: se atiende antes de mandar nada', HTML.indexOf("window._pideElRecado(msg)) return;") < HTML.indexOf("chatHistorial.push({ role: 'user', content: msgEnviar });"));
ok('B5 · también en la conversación por voz', /if \(_pideElRecado\(txt\)\) \{ _convLimpiarBuffer\(\); return; \}/.test(HTML));
ok('B6 · si hay un toque esperando, se respeta el de siempre', /if \(window\._azkToque && window\._azkToque\.id\) return false;/.test(HTML));
ok('B7 · una tarjeta pendiente de confirmar tiene prioridad', /if \(msg && !pendingAction && [^\n]*_pideElRecado\(msg\)\) return;/.test(HTML));

console.log('\nC · versión y ayuda');
const _v = (HTML.match(/var APP_VERSION = '(v\d+)'/) || [])[1];
ok('C1 · index.html va en v661 o más nueva', parseInt(String(_v).slice(1), 10) >= 661, _v);
ok('C2 · sw.js dice la misma', new RegExp('azkar-pwa-' + _v).test(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8')));
ok('C3 · version.json dice la misma', JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).version === _v);
ok('C4 · la ayuda lo cuenta', /Di «dime» y te lo dice/.test(HTML) && /La notificación lleva el recado/.test(HTML));

console.log('\n' + (fallos === 0 ? '✅ TODO BIEN' : '❌ FALLOS: ' + fallos) + '\n');
process.exit(fallos === 0 ? 0 : 1);
