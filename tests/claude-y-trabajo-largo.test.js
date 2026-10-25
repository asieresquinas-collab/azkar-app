/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
//  «/CLAUDE» DESDE CASA Y LOS TRABAJOS LARGOS (app v731)  ·  node tests/claude-y-trabajo-largo.test.js
//
//  Asier, 25-oct-2026 (madrugada):
//   · «/claude Sonnet» con el ordenador de casa puesto → «Claude todavía no está conectado» y seguía el modelo de casa.
//     Claude piensa desde Railway: la app pasa sola a Railway y manda allí el mando.
//   · «revisa y transcribe todas las llamadas de la semana…» → a los cuatro minutos «He cortado la espera» y la respuesta
//     no llegó. El servidor sigue trabajando y la guarda: la app la sigue mirando en segundo plano hasta quince minutos.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let ok = 0, mal = 0;
function t(n, x) { if (x) { ok++; console.log('  OK  ' + n); } else { mal++; console.log('  ❌  ' + n); } }
const iSend = HTML.indexOf('window.chatbotSend = async function() {');
const ini = HTML.slice(iSend, iSend + 2500);
t('A1 · al escribir «/claude…» con el ordenador de casa puesto, se pasa a Railway antes de mandarlo', /if \(msg && \/\^\\\/\(claude\|claud\|clau\|clod\)\\b\/i\.test\(msg\)\)/.test(ini) && /_Cc\.quitar\(\)/.test(ini));
t('A2 · y se le dice por qué, en una frase', /Claude piensa desde Railway: paso a Railway/.test(ini));
const iErr = HTML.indexOf("v731 · UN TRABAJO LARGO NO SE DA POR PERDIDO");
const trozo = HTML.slice(iErr, iErr + 1800);
t('B1 · si la app deja de esperar en Railway, sigue mirando la respuesta en segundo plano quince minutos', iErr > 0 && /_esperarBuzon\(_tidLargo, 15 \* 60000\)/.test(trozo));
t('B2 · sin bloquear el chat (se puede seguir escribiendo)', /sendBtn\.disabled = false;/.test(trozo) && /mientras, puedes seguir escribiendo/.test(trozo));
t('B3 · y cuando llega, se pinta con su nota', /_dl\._largo = true; _pintarDelBuzon\(_dl, _tidLargo\)/.test(trozo) && /Es la respuesta del trabajo largo de antes/.test(HTML));
t('B4 · ya no promete una notificación que no llega', !/al terminar te llega el resultado por notificación \(v2\.7\.261\)/.test(HTML));
const V = (HTML.match(/var APP_VERSION = '(v\d+)'/) || [])[1];
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const VJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).version;
t('C1 · la app, el service worker y version.json dicen la misma versión', V && SW.indexOf("'azkar-pwa-" + V + "'") >= 0 && VJ === V);
console.log('\n' + (mal ? '❌ ' : '✅ ') + ok + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
