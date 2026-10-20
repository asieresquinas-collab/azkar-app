'use strict';
// v697 · Asier, 20-oct: «le hablo en llamada continua y no me contesta». Un recado del compañero con la app
// abierta ponía la conversación en «solo si dices Azkarin» (y tiraba lo demás), incluso si ya estaba encendida.
const path = require('path'), fs = require('fs');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const i = H.indexOf('  window.__azkarinAvisoDeVoz = function'), j = H.indexOf('  // ── v695 · EL COMPAÑERO HABLA');
const SRC = (i > 0 && j > i) ? H.slice(i, j) : null;
c('A0 · el aviso de voz está', !!SRC);
function prueba(estado) {
  const win = Object.assign({ _apiKey: 'x' }, estado.win);
  const doc = { visibilityState: estado.vis, getElementById: () => ({ classList: { contains: () => true, add() {} }, style: {} }) };
  win.chatbotConvToggle = function (on) { win._azkarinConv = on; };
  const partes = []; win._vozParte = (e, d) => partes.push([e, d]);
  new Function('window', 'document', 'RAILWAY_API', 'fetch', 'addMsg', 'chatSpeak', 'setTimeout', 'chatTTSEnabled',
    SRC)(win, doc, 'https://s', () => Promise.resolve({}), () => {}, () => {}, (f) => f(), true);
  win.__azkarinAvisoDeVoz('Oye, ¿te puedo decir una cosa?', 'toque:1', 'toque', estado.op);
  return { win, partes };
}
if (SRC) {
  let r = prueba({ win: { _azkarinConv: true, _convPorPalabraClave: false }, vis: 'visible' });
  c('B1 · ya en conversación a mano: sigue escuchándolo todo', r.win._convPorPalabraClave === false && r.win._azkarinConv === true);
  r = prueba({ win: { _azkarinConv: false }, vis: 'visible', op: { en_la_app: true } });
  c('B2 · con la app abierta: abre la conversación y lo escucha todo', r.win._azkarinConv === true && r.win._convPorPalabraClave === false);
  r = prueba({ win: { _azkarinConv: false }, vis: 'hidden' });
  c('B3 · con el móvil bloqueado: solo si dice «Azkarin» (como siempre)', r.win._azkarinConv === true && r.win._convPorPalabraClave === true);
  c('B4 · deja el parte aviso_abre', r.partes.some(p => p[0] === 'aviso_abre'));
  c('B5 · el que pregunta con la app abierta lo dice', /__azkarinAvisoDeVoz\(String\(d\.texto\), d\.id \|\| '', d\.tipo \|\| '', \{ en_la_app: true \}\)/.test(H));
}
console.log('\n' + (mal ? '❌ ' + mal + ' mal, ' : '✅ ') + bien + ' bien');
process.exitCode = mal ? 1 : 0;
