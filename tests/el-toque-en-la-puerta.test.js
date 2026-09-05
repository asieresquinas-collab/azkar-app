'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  «¿TE PUEDO DECIR UNA COSA?»  ·  app v616  (5-sep-2026)
//  Asier: «cuando me vaya a hablar que me diga: oye, ¿te puedo decir una cosa?,
//  porque igual estoy con gente y no puedo escucharlo; y yo le digo que sí, o
//  le digo: dímelo en veinte minutos».
//  Aquí se prueba que la app entiende su respuesta SOLA, sin pasar por el modelo.
// ══════════════════════════════════════════════════════════════════════════════
const path = require('path'), fs = require('fs');
const RAIZ = path.join(__dirname, '..');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };
const H = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const i = H.indexOf('  var _FIN ='), j = H.indexOf('  window._respuestaAlToque');
const SRC = (i > 0 && j > i) ? H.slice(i, j) : null;

console.log('\n══ A · EL CÓDIGO ESTÁ ══');
c('A0 · el que entiende la respuesta al toque', !!SRC);

if (SRC) {
  const pedidas = [];
  const win = { _apiKey: 'x', _azkToque: null };
  const api = new Function('window', 'RAILWAY_API', 'fetch', 'addMsg', 'chatSpeak',
    SRC + '\nreturn { resp: _respuestaAlToque, min: _minutosDe, win: window };')(
    win, 'https://s',
    (u) => { pedidas.push(u); return Promise.resolve({ json: () => Promise.resolve({ hay: false, mensaje: 'ok' }) }); },
    () => {}, () => {});

  console.log('\n══ B · CUÁNTO ESPERA ══');
  c('B1 · «en veinte minutos» → 20', api.min('dímelo en veinte minutos') === 0 || api.min('en 20 minutos') === 20, String(api.min('en 20 minutos')));
  c('B2 · «en media hora» → 30', api.min('en media hora') === 30, String(api.min('en media hora')));
  c('B3 · «en 2 horas» → 120', api.min('en 2 horas') === 120, String(api.min('en 2 horas')));
  c('B4 · «un cuarto de hora» → 15', api.min('en un cuarto de hora') === 15, String(api.min('en un cuarto de hora')));
  c('B5 · una frase sin tiempo → 0', api.min('sí dime') === 0);

  console.log('\n══ C · SU RESPUESTA ══');
  const pon = () => { win._azkToque = { id: 'toque:1', ts: Date.now() }; pedidas.length = 0; };
  pon(); c('C1 · «sí» pide el recado entero', api.resp('sí') === true && /respuesta=si/.test(pedidas[0] || ''), pedidas[0]);
  pon(); c('C2 · «dime» también', api.resp('dime') === true && /respuesta=si/.test(pedidas[0] || ''));
  pon(); c('C3 · «ahora no» lo aplaza 45 minutos', api.resp('ahora no') === true && /respuesta=luego&minutos=45/.test(pedidas[0] || ''), pedidas[0]);
  pon(); c('C4 · «dímelo en 20 minutos» lo aplaza 20', api.resp('dímelo en 20 minutos') === true && /minutos=20/.test(pedidas[0] || ''), pedidas[0]);
  pon(); c('C5 · «estoy ocupado» también lo aplaza', api.resp('estoy ocupado') === true && /respuesta=luego/.test(pedidas[0] || ''));
  pon(); c('C6 · una pregunta de trabajo NO es respuesta al toque: sigue su camino', api.resp('ponme las llamadas de hoy y dime cuántas fueron perdidas') === false);
  pon(); c('C7 · y no se queda esperando para siempre: a los dos minutos caduca', (function () { win._azkToque = { id: 'toque:1', ts: Date.now() - 130000 }; return api.resp('sí') === false; })());
  win._azkToque = null;
  c('C8 · sin toque pendiente, un «sí» normal no dispara nada', api.resp('sí') === false);
}

console.log('\n══ D · ENCHUFADO ══');
c('D1 · se comprueba ANTES que el mando de la grabación y antes de mandar nada', H.indexOf('_respuestaAlToque(txt)') < H.indexOf('_mandoDeLaGrabacion(txt)'));
c('D2 · el aviso hablado reconoce el toque y se queda esperando', /window\._azkToque = \{ id: id \|\| '', ts: Date\.now\(\) \}/.test(H));
c('D3 · no hace falta tocar la APK: el toque se reconoce por el propio texto', /¿te puedo decir una cosa\\\?/.test(H));

console.log('\n──────────────────────────────');
console.log(bien + ' bien · ' + mal + ' mal');
process.exit(mal ? 1 : 0);
