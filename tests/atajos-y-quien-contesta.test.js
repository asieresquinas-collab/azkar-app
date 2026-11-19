'use strict';
// v753 · LOS ATAJOS ENCIMA DE LA CAJA Y QUIÉN TE CONTESTA  (node tests/atajos-y-quien-contesta.test.js)
//  Estudio del 19-nov: H20 (las mismas frases todos los días) y H07 («¿con quién hablo?»). Se lee el index.html y se prueban las
//  piezas sueltas (sin navegador ni red). Lo pintado a 420 px se miró aparte con un navegador sin red: los atajos quedan encima de
//  la caja de escribir, sin taparla.
const fs = require('fs');
const path = require('path');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let bien = 0, mal = 0;
function c(n, ok, d) { if (ok) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + String(d).slice(0, 400) : '')); } }
function fn(nombre) {
  const i = H.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let p = H.indexOf('{', i), n = 0, k = p;
  for (; k < H.length; k++) { if (H[k] === '{') n++; else if (H[k] === '}') { n--; if (!n) break; } }
  return H.slice(i, k + 1);
}

const iChips = H.indexOf('<div id="chatbot-chips">'), iArea = H.indexOf('<div id="chatbot-input-area">');
c('1 · la fila de atajos va justo encima de la caja de escribir', iChips > 0 && iArea > iChips && iArea - iChips < 400);
const mChips = /var AZK_CHIPS = (\[[\s\S]*?\]);/.exec(H);
let chips = null; try { chips = mChips && (new Function('return ' + mChips[1]))(); } catch (e) { chips = null; }
c('2 · seis atajos con las mismas frases que los botones de Telegram', chips && chips.length === 6 && chips[2].f === '¿Cuánto falta por cobrar hasta fin de mes?' && chips[5].f === '/gasto' && /novedades del día/.test(chips[0].f) && /asistente de WhatsApp/.test(chips[4].f), JSON.stringify(chips));
c('3 · mandan por el camino de siempre (azkChatCmd → chatbotSend) y no se cruzan si está pensando', /window\.azkChipEnviar = function[\s\S]{0,300}sb\.disabled\) return;[\s\S]{0,120}window\.azkChatCmd\(c\.f\)/.test(H));
c('4 · plegables y se acuerda en el móvil (con try por si no hay almacenamiento)', /window\.azkChipsPlegar = function[\s\S]{0,300}try \{ localStorage\.setItem\('azkar_chips_plegados'/.test(H) && /#chatbot-chips\.plegado #chatbot-chips-fila\{display:none\}/.test(H));
c('5 · la fila no se encoge ni empuja la caja (flex-shrink:0 y desliza de lado)', /#chatbot-chips\{[^}]*flex-shrink:0/.test(H) && /#chatbot-chips-fila\{[^}]*overflow-x:auto/.test(H));
c('6 · su línea en la Ayuda', /Atajos de Azkarin y quién te contesta \(v753\)/.test(H));

const src = [fn('_azkNombreModelo'), fn('_azkQuienContesta'), fn('_azkNum'), fn('_azkTokensTexto')];
let Q = null, T = null;
try { const f = new Function(src.join('\n') + '\nreturn [_azkQuienContesta, _azkTokensTexto];')(); Q = f[0]; T = f[1]; } catch (e) { }
c('7 · quién contesta: casa con su modelo, la nube con Claude o Gemini', Q && Q({ _casa: true, motor_usado: 'qwen3.6-35b-iq4_xs' }) === 'casa (Qwen 3.6 4 bits)' && Q({ _nube: 'x', motor_usado: 'claude-sonnet-de-prueba' }) === 'nube (Claude Sonnet)' && Q({ motor_usado: 'gemini-3.8-flash' }) === 'nube (Gemini 3.8 Flash)');
c('8 · 🛑 si el servidor no lo dice, no se pone nada', Q && Q({}) === '' && Q(null) === '' && Q({ _casa: true }) === 'casa');
c('9 · la línea de tokens lo lleva al final, y sin quién queda igual que antes', T && T({ salida: 40, por_segundo: 7.5, segundos: 5.3 }, 'casa') === '⚡ 7,5 tokens por segundo · 40 escritos en 5,3 s · casa' && T({ salida: 40, por_segundo: 7.5, segundos: 5.3 }) === '⚡ 7,5 tokens por segundo · 40 escritos en 5,3 s');
c('10 · se guarda al llegar la respuesta y se pinta debajo', /tk: t, quien: _azkQuienContesta\(d\)/.test(H) && /_azkTokensTexto\(tk, p\.quien \|\| ''\)/.test(H));
const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).version;
const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
c('11 · la versión es la misma en los tres sitios', /var APP_VERSION = 'v753';/.test(H) && sw.indexOf("'azkar-pwa-" + v + "'") >= 0 && v === 'v753');

console.log('\n══ ATAJOS Y QUIÉN CONTESTA (v753) ══\nOK: ' + bien + '  ·  FALLOS: ' + mal);
process.exit(mal ? 1 : 0);
