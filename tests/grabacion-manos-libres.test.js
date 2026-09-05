'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  LA GRABACIÓN, SIN TOCAR EL MÓVIL  ·  app v588  (4-sep-2026)
//
//  Asier: «necesito decirle con la pantalla bloqueada que me mande el mp3 de un cliente y
//  poder decirle que le dé al play para escucharlo, así no tengo que tocar el móvil».
//
//  Este banco ejecuta el CÓDIGO REAL del mando de voz de index.html.
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };
function trozo(a, b) { const i = H.indexOf(a), j = H.indexOf(b, i); return (i < 0 || j < 0) ? null : H.slice(i, j); }

const SRC = trozo('  var _RE_LL_PLAY', '  function _convRecibirHabla(txt) {');
c('A0 · el mando de voz está donde toca', !!SRC);

function monta() {
  const audio = { paused: true, ended: false, currentTime: 40, duration: 300, playbackRate: 1,
    play() { this.paused = false; }, pause() { this.paused = true; } };
  const avisos = [];
  // v607: la grabación acaba de cargarse (por eso está «viva» aunque esté en pausa)
  const win = { _llAudio: audio, _llActivaTs: Date.now(), _llVel(v) { audio.playbackRate = v; } };
  const mando = new Function('window', '_convAvisoCorto', SRC + '\nreturn _mandoDeLaGrabacion;')(win, m => avisos.push(m));
  return { audio, mando, avisos, win };
}

console.log('\n══ A · LAS ÓRDENES ══');
let m = monta();
c('A1 · «dale al play» la pone en marcha', m.mando('dale al play') === true && m.audio.paused === false);
c('A2 · «para» la para', m.mando('para') === true && m.audio.paused === true);
c('A3 · «sigue» la reanuda', m.mando('sigue') === true && m.audio.paused === false);
m = monta();
c('A4 · «otra vez» la pone desde el principio', m.mando('otra vez') === true && m.audio.currentTime === 0 && m.audio.paused === false);
m = monta();
c('A5 · «más rápido» sube la velocidad', m.mando('más rápido') === true && m.audio.playbackRate === 1.25);
c('A6 · «más despacio» la baja', m.mando('más despacio') === true && m.audio.playbackRate === 1);
m = monta();
c('A7 · «adelanta» salta quince segundos por defecto', m.mando('adelanta') === true && m.audio.currentTime === 55);
m = monta();
c('A8 · «adelanta 30 segundos» salta treinta', m.mando('adelanta 30 segundos') === true && m.audio.currentTime === 70);
m = monta();
c('A9 · «vuelve 10 segundos» retrocede', m.mando('vuelve 10 segundos') === true && m.audio.currentTime === 30);
m = monta();
c('A10 · «adelanta un minuto» salta sesenta', m.mando('adelanta 1 minuto') === true && m.audio.currentTime === 100);
m = monta();
c('A11 · «quítala» la cierra', m.mando('quítala') === true && m.win._llAudio === null && m.audio.paused === true);

console.log('\n══ B · LO QUE NO ES UNA ORDEN VA A AZKARIN ══');
m = monta();
c('B1 · una pregunta de trabajo NO la toca el mando', m.mando('¿cuánto me deben este mes?') === false);
c('B2 · una frase larga tampoco, aunque empiece por «para»', m.mando('para el jueves necesito dos operarios en Getxo y una plataforma') === false);
c('B3 · sin grabación cargada, el mando no hace nada', (function () { const x = monta(); x.win._llAudio = null; return x.mando('dale al play') === false; })());
c('B4 · un texto vacío no hace nada', m.mando('   ') === false);

console.log('\n══ C · MANOS LIBRES DE VERDAD ══');
c('C1 · si la pidió hablando, la grabación arranca sola', /if \(window\._azkarinConv\) \{[\s\S]{0,260}auEl\.play\(\)/.test(H));
c('C2 · y espera a que Azkarin termine de hablar para no pisarse', /_convHablando && _convHablando\(\)\) \{ setTimeout\(_arranca, 400\); return; \}/.test(H));
c('C3 · mientras suena, el micro NO se la toma por la voz de Asier', /function _convGrabacionSonando/.test(H) && /_convHablando\(\) \{[\s\S]{0,200}_convGrabacionSonando\(\)/.test(H));
c('C4 · hablándole encima se pausa la grabación, como se le corta a él', /if \(window\._llAudio && !window\._llAudio\.paused\) window\._llAudio\.pause\(\);/.test(H));
c('C5 · las órdenes de la grabación NO se mandan al servidor (no gastan)', /if \(_mandoDeLaGrabacion\(txt\)\) \{ _convLimpiarBuffer\(\); return; \}/.test(H));

console.log('\n══ D · SABOTAJE ══');
const roto = SRC.replace("if (t.split(/\\s+/).length > 7) return false;", "");
const mandoRoto = new Function('window', '_convAvisoCorto', roto + '\nreturn _mandoDeLaGrabacion;')({ _llAudio: { paused: false, ended: false, play() {}, pause() {} }, _llActivaTs: Date.now(), _llVel() {} }, () => {});
c('D1 · sin el tope de palabras, una frase de trabajo se tragaría el «para» (B2 sería falso)', mandoRoto('para el jueves necesito dos operarios en Getxo y una plataforma') === true);


console.log('\n══ V · v607 · LA GRABACIÓN VIEJA YA NO SE COME LO QUE LE DICES A AZKARIN ══');
{
  // Asier pausó una grabación hace un rato y luego le habla a Azkarin: «repite», «sigue»,
  // «espera», «vuelve», «ya está» son órdenes del mando… y se las tragaba aunque la grabación
  // llevara parada media hora. Ahora el mando solo vale con la grabación viva (sonando o
  // usada hace menos de tres minutos).
  const vieja = monta();
  vieja.win._llActivaTs = Date.now() - 4 * 60 * 1000;   // parada hace cuatro minutos
  c('V1 · «repite» con la grabación vieja NO la toca: va para Azkarin', vieja.mando('repite') === false && vieja.audio.currentTime === 40);
  c('V2 · «sigue» tampoco', vieja.mando('sigue') === false && vieja.audio.paused === true);
  c('V3 · «ya está» tampoco', vieja.mando('ya está') === false);
  const sonando = monta();
  sonando.audio.paused = false;
  sonando.win._llActivaTs = Date.now() - 60 * 60 * 1000;   // el reloj da igual: está sonando
  c('V4 · pero si está sonando, «para» la para siempre', sonando.mando('para') === true && sonando.audio.paused === true);
  const reciente = monta();
  reciente.win._llActivaTs = Date.now() - 30 * 1000;
  c('V5 · y en pausa recién usada, sigue mandando la voz', reciente.mando('sigue') === true && reciente.audio.paused === false);
}

console.log('\n──────────────────────────────');
console.log(bien + ' bien · ' + mal + ' mal');
process.exit(mal ? 1 : 0);