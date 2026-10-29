'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  LA TARJETA QUE NO SE QUEDA ESPERANDO  ·  v739 (29-oct-2026)
//
//  6:01, tarjeta de «quitar la rutina». 6:03, Asier escribe «No. Ve que me hayas puesto el de Yolanda
//  que se habló por WhatsApp» (empieza por «No», pero es largo: la app no lo tomaba como un no) y la
//  tarjeta se queda viva: un toque después, rutina quitada. 6:04, otra tarjeta, la de borrar la nota de
//  las nueve, y a los dos segundos ya estaba aceptada.
//
//  🛑 LO QUE PROTEGE:
//   · con una tarjeta esperando, lo que no es un «sí» corto la RETIRA sin hacer (y si empieza por «no»,
//     la cancela), y su frase sigue al chat,
//   · el «Sí» de una tarjeta que BORRA o QUITA espera tres segundos con la cuenta a la vista; el de las
//     demás, un segundo; un toque antes no hace nada,
//   · el «sí» dicho o escrito no espera (no es un toque reflejo).
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fallos = 0;
const ok = (n, x, d) => { console.log((x ? '  ✅ ' : '  ❌ ') + n + (x || !d ? '' : '  →  ' + d)); if (!x) fallos++; };

console.log('\n══ A · ¿QUÉ TARJETA BORRA? ══');
const mT = HTML.match(/  function _tarjetaBorra\(accion\) \{[\s\S]*?\n  \}\n/);
ok('A1 · existe _tarjetaBorra', !!mT);
if (mT) {
  const f = new Function(mT[0] + '\nreturn _tarjetaBorra;')();
  ok('A2 · borrar un evento, quitar una rutina: sí', f({ herramienta: 'borrar_evento_calendario' }) && f({ herramienta: 'borrar_tarea_automatica' }) && f({ herramienta: 'quitar_trabajo_autonomos' }));
  ok('A3 · un plan con un paso que borra: sí', f({ herramienta: '__plan__', argumentos: { acciones: [{ herramienta: 'crear_evento_calendario' }, { herramienta: 'borrar_evento_calendario' }] } }));
  ok('A4 · crear o cambiar algo: no', !f({ herramienta: 'crear_evento_calendario' }) && !f({ herramienta: 'agregar_articulos' }) && !f(null));
}

console.log('\n══ B · EL «SÍ» QUE ESPERA ══');
const mC = HTML.match(/  function addConfirmMsg\(desc, accion\) \{[\s\S]*?\n  \}\n/);
ok('B1 · la tarjeta que borra lo dice arriba y su «Sí» sale apagado con la cuenta (3)', !!mC && /var espera = borra \? 3000 : 1000;/.test(mC[0]) && /Esto BORRA o QUITA algo/.test(mC[0]) && /\(borra \? ' disabled' : ''\)/.test(mC[0]) && /\(borra \? ' \(3\)' : ''\)/.test(mC[0]));
ok('B2 · la cuenta baja cada segundo y al final se enciende', !!mC && /setInterval\(function\(\) \{\s*n--;/.test(mC[0]) && /btn\.disabled = false; btn\.textContent = txtSi;/.test(mC[0]));
ok('B3 · un toque antes de tiempo no hace nada (y se dice «léela y vuelve a tocar»)', /if \(si && !porVoz && _azkTarjeta && _azkTarjeta\.ts && \(Date\.now\(\) - _azkTarjeta\.ts\) < _azkTarjeta\.espera\) \{[\s\S]{0,400}Léela y vuelve a tocar[\s\S]{0,200}return;/.test(HTML));
ok('B4 · el «sí» dicho o escrito no espera', /chatbotConfirm\(_esSi, true\);/.test(HTML) && /window\.chatbotConfirm = async function\(si, porVoz\)/.test(HTML));
ok('B5 · la tarjeta sabe qué acción es (se le pasa la acción)', /addConfirmMsg\(desc \|\| \(txt \? 'Lo que te he dicho arriba\.' : 'Una acción\.'\), data\.accion\);/.test(HTML));

console.log('\n══ C · LO QUE NO ES UN «SÍ» RETIRA LA TARJETA ══');
const iC = HTML.indexOf('v739 · «NO. VE QUE ME HAYAS PUESTO EL DE YOLANDA');
const trozo = iC > 0 ? HTML.slice(iC, iC + 2200) : '';
ok('C1 · con una tarjeta esperando, otra frase la retira sin hacer', iC > 0 && /pendingAction = null;/.test(trozo) && /querySelectorAll\('\.chat-confirm-btns'\)\.forEach\(function\(b\)\{ b\.remove\(\); \}\)/.test(trozo));
ok('C2 · si empieza por «no», se cancela; si no, se queda sin hacer (y se dice)', /var _empiezaNo = \/\^\(no\|nop\|nope\|para\|espera\|cancela/.test(trozo) && /Tarjeta cancelada: no se ha hecho/.test(trozo) && /La tarjeta de antes se queda sin hacer/.test(trozo));
ok('C3 · y Azkarin lo sabe (queda en la conversación)', /chatHistorial\.push\(\{ role: 'assistant', content: \(_empiezaNo \? 'Tarjeta CANCELADA por Asier/.test(trozo));
// la frase sigue su camino: después del bloque no hay return
const finBloque = trozo.indexOf("} catch(e){}\n      }");
ok('C4 · su frase sigue al chat (no se corta ahí)', finBloque > 0 && !/return;/.test(trozo.slice(trozo.indexOf('var _empiezaNo'), finBloque)));

console.log('\n══ D · VERSIÓN ══');
const v = (HTML.match(/var APP_VERSION = '(v\d+)'/) || [])[1];
const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const vj = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
ok('D1 · v739 o más nueva, y las tres dicen la misma', parseInt(String(v).slice(1), 10) >= 739 && sw.indexOf("'azkar-pwa-" + v + "'") >= 0 && vj.version === v, v + ' ' + vj.version);

console.log(fallos ? '\n❌ FALLOS: ' + fallos : '\n✅ TODO BIEN');
process.exit(fallos ? 1 : 0);
