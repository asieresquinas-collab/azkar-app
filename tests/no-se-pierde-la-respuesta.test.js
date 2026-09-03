'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  «CAMBIO DE APLICACIÓN Y SE PARA»  ·  app v574 · backend 2.7.602 (3-sep-2026)
//
//  Asier, de noche: «me pasa una cosa con Azkarin: igual le pregunto algo y cambio de
//  aplicación mientras espero en el móvil, y se para».
//  Y es verdad: el móvil CONGELA la página en cuanto te vas a otra app; la petición se
//  corta y la respuesta se iba al vacío aunque el servidor hubiera terminado el trabajo.
//  Arreglo: el servidor guarda la respuesta de cada turno media hora (el «buzón») y la
//  app la recoge sola al volver — sin reenviar la pregunta y sin repetir el trabajo.
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };
function trozo(desde, hasta) { const i = H.indexOf(desde); const j = H.indexOf(hasta, i); return (i < 0 || j < 0) ? null : H.slice(i, j); }

console.log('\n══ A · EL RESCATE, CON CÓDIGO REAL ══');
const SRC = trozo('  function _pintarDelBuzon(d) {', '  // Al VOLVER a la app');
c('A1 · la función que pinta lo recogido existe', !!SRC);
if (SRC) {
  const pintados = [];
  const fn = new Function('addMsg', 'chatHistorial', SRC + '\nreturn _pintarDelBuzon;')((quien, t) => pintados.push(t), []);
  c('A2 · pinta la respuesta que estaba guardada', fn({ respuesta: { mensaje: 'El 6626 está EN MARCHA' }, hace_segundos: 12 }) === true && /6626 está EN MARCHA/.test(pintados[0]));
  c('A3 · y le dice por qué llega ahora, sin culpar a nadie', /saliste de la aplicación/.test(pintados[0]) && /recogido del servidor/.test(pintados[0]));
  pintados.length = 0;
  fn({ respuesta: { mensaje: 'Listo' }, hace_segundos: 600 });
  c('A4 · si terminó hace rato, se dice cuánto', /terminó hace 10 min/.test(pintados[0]), pintados[0]);
  pintados.length = 0;
  c('A5 · sin nada en el buzón, no se inventa un mensaje', fn(null) === false && fn({}) === false && pintados.length === 0);
  pintados.length = 0;
  fn({ respuesta: { tipo: 'resultado' }, aviso: 'llevaba un PDF pesado' });
  c('A6 · si la respuesta no se puede repintar, lo dice claro', /no se puede repintar/.test(pintados[0]) && /PDF pesado/.test(pintados[1] || ''));
}

console.log('\n══ B · CUÁNDO SE RECOGE ══');
c('B1 · al volver a la app (visibilitychange)', /visibilitychange[\s\S]{0,90}_recogerTurnoPendiente\(\)/.test(H));
c('B2 · al volver el foco', /addEventListener\('focus', function \(\) \{ _recogerTurnoPendiente\(\); \}\)/.test(H));
c('B3 · y al abrir la app, por si Android la mató', /setTimeout\(_recogerTurnoPendiente, 2500\)/.test(H));
c('B4 · el turno pendiente se guarda también en el móvil (aguanta que la maten)', /localStorage\.setItem\(_TURNO_PEND_K/.test(H));
c('B5 · 🛑 y se BORRA en cuanto llega la respuesta (si no, se repetiría sola)', /var data = await resp\.json\(\);\s*\n\s*_turnoResuelto\(_turnoId\);/.test(H));
c('B6 · un turno de hace más de media hora se descarta (el buzón ya no lo tiene)', /Date\.now\(\) - \(pend\.ts \|\| 0\) > 30 \* 60 \* 1000/.test(H));
c('B7 · 🛑 NO se reenvía la pregunta: solo se recoge', !/_recogerTurnoPendiente[\s\S]{0,700}chatbot\/message/.test(H));

console.log('\n══ C · LOS DOS CAMINOS DEL CHAT ══');
c('C1 · el chat normal marca su turno', /_marcarTurnoPendiente\(_turnoId, msgEnviar\)/.test(H));
c('C2 · y rescata si la petición se corta', /_esperarBuzon\(_turnoId,/.test(H));
c('C3 · el botón de confirmar, igual', /_marcarTurnoPendiente\(_turnoIdC/.test(H) && /_esperarBuzon\(_turnoIdC,/.test(H));
c('C4 · el aviso viejo de «he cortado la espera» sigue de último recurso', /He cortado la espera/.test(H));

console.log('\n══ D · EL BUZÓN DEL SERVIDOR ══');
const RAIZ = ['azkar-presupuestos', 'azkar-backend-temp'].map(d => path.resolve(__dirname, '..', '..', d)).find(d => fs.existsSync(path.join(d, 'api/chatbot.js')));
if (!RAIZ) { c('D · (saltada: no encuentro el repo del servidor)', false, 'pon AZKAR_BACKEND'); }
else {
  const CB = fs.readFileSync(path.join(RAIZ, 'api', 'chatbot.js'), 'utf8');
  const SV = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  c('D1 · la respuesta de cada turno se guarda', /function guardarRespuestaTurno\(turnoId, usuario, payload\)/.test(CB));
  c('D2 · y se guarda desde la propia ruta del chat (todos los caminos)', /chatbotApi\.guardarRespuestaTurno\(_tid, req\.usuario, payload\)/.test(SV));
  c('D3 · 🛑 solo se la lleva QUIEN preguntó', /if \(e\.quien && e\.quien !== _quienDelTurno\(req\.usuario\)\) return res\.json\(salida\);/.test(CB));
  c('D4 · el buzón dura media hora', /limBuzon = Date\.now\(\) - 30 \* 60 \* 1000/.test(CB));
  c('D5 · una respuesta con un PDF enorme se aligera y se avisa', /_BUZON_MAX_BYTES/.test(CB) && /no lo he guardado en el buzón/.test(CB));
  c('D6 · el buzón NUNCA puede tumbar una respuesta', /el buzón nunca puede tumbar una respuesta/.test(SV));
  c('D7 · la versión del servidor va por 2.7.602 o más', Number(String((SV.match(/const VERSION = '([\d.]+)'/) || [])[1] || '0').split('.').pop()) >= 602);
}

console.log('\n══ E · LA APP AL DÍA ══');
const V = (H.match(/var APP_VERSION = 'v(\d+)'/) || [])[1];
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const VJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
c('E1 · la app va por v574 o más', Number(V) >= 574, 'v' + V);
c('E2 · y sw.js y version.json dicen lo mismo', SW.indexOf('azkar-pwa-v' + V) >= 0 && VJ.version === 'v' + V);
c('E3 · la Ayuda lo cuenta', /SI SALES DE LA APLICACIÓN/.test(H));

console.log('\n──────────────────────────────────────────────');
console.log('  ' + bien + ' bien · ' + mal + ' mal');
console.log('──────────────────────────────────────────────');
process.exit(mal ? 1 : 0);
