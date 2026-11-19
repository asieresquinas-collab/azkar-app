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
// v754 · la versión ya no es la 753: se comprueba que sea la misma en los tres sitios y que sea la 753 o una posterior
const mV = /var APP_VERSION = '(v(\d+))';/.exec(H);
c('11 · la versión es la misma en los tres sitios', mV && mV[1] === v && sw.indexOf("'azkar-pwa-" + v + "'") >= 0 && Number(mV[2]) >= 753, (mV && mV[1]) + ' / ' + v);

// ══ v754 · CON UNA TARJETA ESPERANDO EL «SÍ», LOS ATAJOS NO LA RETIRAN (examen 2 del 19-nov, F16) ══
function trozo(inicio) {
  const i = H.indexOf(inicio);
  if (i < 0) return null;
  let p = H.indexOf('{', i), n = 0, k = p;
  for (; k < H.length; k++) { if (H[k] === '{') n++; else if (H[k] === '}') { n--; if (!n) break; } }
  return H.slice(i, k + 1) + ';';
}
function chipsDePrueba(pend) {
  const enviados = [], barra = [];
  const botones = chips ? chips.map(x => ({ disabled: false, title: x.f })) : [];
  const env = {
    pendingAction: pend, AZK_CHIPS: chips, enviados, barra, botones,
    document: { getElementById: (id) => id === 'chatbot-chips-fila' ? { querySelectorAll: () => botones } : (id === 'chatbot-send' ? { disabled: false } : null) },
    msgsDiv: { querySelector: () => null },
    showSyncStatus: (m) => barra.push(m),
    window: { azkChatCmd: (t) => enviados.push(t) }
  };
  const partes = [fn('_azkChipsEstado'), fn('_azkChipsEsperanTarjeta'), trozo('window.azkChipEnviar = function')];
  if (partes.some(x => !x)) return Object.assign(env, { error: 'no encuentro las piezas de los atajos con tarjeta' });
  try {
    const f = new Function('env', 'with (env) { ' + partes.join('\n') + ' return { enviar: window.azkChipEnviar, estado: _azkChipsEstado, poner: function (v) { env.pendingAction = v; } }; }');
    return Object.assign(env, f(env));
  } catch (e) { return Object.assign(env, { error: e }); }
}
let K = chipsDePrueba({ herramienta: 'poner_kilometros', descripcion: 'Km de la ficha de prueba' });
c('12 · 🛑 con una tarjeta pendiente, tocar un atajo NO manda nada (la tarjeta no se retira)', !!K.enviar && (K.enviar(2), K.enviados.length === 0), K.error || JSON.stringify(K.enviados));
c('13 · y se dice por qué: «Primero contesta a la tarjeta»', K.barra.some(m => /Primero contesta a la tarjeta/.test(m)));
if (K.estado) K.estado();
c('14 · los atajos salen apagados con el porqué en su globo', K.botones.length === 6 && K.botones.every(b => b.disabled === true && /Primero contesta a la tarjeta/.test(b.title)));
if (K.poner) { K.poner(null); K.estado(); }
c('15 · sin tarjeta, vuelven a estar encendidos con su frase y mandan como siempre', !!K.enviar && K.botones.every((b, i) => b.disabled === false && b.title === chips[i].f) && (K.enviar(2), K.enviados[0] === '¿Cuánto falta por cobrar hasta fin de mes?'));
c('16 · se repintan al poner la tarjeta, al contestarla y con cada mensaje', /addConfirmMsg\(desc \|\| \(txt \? 'Lo que te he dicho arriba\.' : 'Una acción\.'\), data\.accion\);\s*try \{ _azkChipsEstado\(\); \} catch/.test(H) && /pendingAction = null;\s*try \{ _azkChipsEstado\(\); \} catch/.test(H) && /function addMsg\(type, text, opts\) \{\s*try \{ _azkChipsEstado\(\); \} catch/.test(H));
const ayudaAtajos = H.slice(H.indexOf('Atajos de Azkarin y quién te contesta (v753)'), H.indexOf('La sala de control de Azkarin (v752)'));
c('17 · la Ayuda ya no promete «casa (Qwen …)»', ayudaAtajos.length > 100 && ayudaAtajos.indexOf('«casa (Qwen …)»') === -1 &&/«casa» \(el ordenador de casa; el nombre del modelo solo si el servidor lo dice\)/.test(H));

console.log('\n══ ATAJOS Y QUIÉN CONTESTA (v753) ══\nOK: ' + bien + '  ·  FALLOS: ' + mal);
process.exit(mal ? 1 : 0);
