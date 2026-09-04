'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  «HASTA LO QUE HABLO CON MI HIJO ME CONTESTA»  ·  app v589 (4-sep-2026)
//
//  Asier: «necesito tenerlo activado pero que no oiga el micrófono cuando está bloqueado,
//  que yo pueda tener mis conversaciones con la gente… y que solo se active cuando yo diga
//  Azkarin. Ahora mismo yo hablo y él me está contestando hasta lo que hablo con mi hijo».
//
//  Este banco ejecuta el CÓDIGO REAL del filtro de index.html.
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };
function trozo(a, b) { const i = H.indexOf(a), j = H.indexOf(b, i); return (i < 0 || j < 0) ? null : H.slice(i, j); }

const SRC = trozo('  var _MS_SIGUE_EL_HILO', '  function _convRecibirHabla(txt) {');
c('A0 · el filtro está donde toca', !!SRC);

function monta(win) {
  const w = Object.assign({ _convPorPalabraClave: true, _ttsFinTs: 0, _convUltimaSuya: 0 }, win || {});
  return new Function('window', SRC + '\nreturn _leHablaAEl;')(w);
}

console.log('\n══ A · ABIERTO POR LA PALABRA CLAVE: SOLO SI LE LLAMA ══');
let f = monta();
c('A1 · 🛑 hablando con su hijo, NO se manda nada', f('pues mañana te llevo yo al entrenamiento, cariño').vale === false);
c('A2 · 🛑 ni una conversación de trabajo con otra persona delante', f('oye Toni, el camión lo dejas en el garaje').vale === false);
c('A3 · «Azkarin, ponme la última llamada» sí', f('Azkarin, ponme la última llamada de Getxo').vale === true);
c('A4 · y se le quita el nombre antes de mandarlo', f('Azkarin, ponme la última llamada de Getxo').texto === 'ponme la última llamada de Getxo');
c('A5 · «oye Azkarin…» también', f('oye Azkarin dime el gasto de hoy').vale === true && f('oye Azkarin dime el gasto de hoy').texto === 'dime el gasto de hoy');
c('A6 · como lo transcribe mal el móvil, también vale', f('Azcarin qué tengo mañana').vale === true && f('Ascarin qué tengo mañana').vale === true);
c('A7 · si solo dice su nombre, se manda su nombre (no vacío)', f('Azkarin').texto.length > 0);

console.log('\n══ B · EL HILO DE LA CONVERSACIÓN ══');
f = monta({ _ttsFinTs: Date.now() - 3000 });
c('B1 · justo después de que él conteste, un «sí» vale sin repetir el nombre', f('sí, esa misma').vale === true);
f = monta({ _ttsFinTs: Date.now() - 40000 });
c('B2 · pero pasados los quince segundos, ya hay que llamarle otra vez', f('sí, esa misma').vale === false);
f = monta({ _convUltimaSuya: Date.now() - 5000 });
c('B3 · también cuenta desde lo último que le mandó Asier', f('y la anterior').vale === true);

console.log('\n══ C · SI LO ABRE ÉL A MANO, COMO SIEMPRE ══');
f = monta({ _convPorPalabraClave: false });
c('C1 · tocando el auricular no hace falta llamarle por su nombre', f('ponme la última llamada').vale === true);
c('C2 · y el texto va tal cual', f('ponme la última llamada').texto === 'ponme la última llamada');

console.log('\n══ D · QUE SE APAGUE SOLA ══');
c('D1 · abierta por la palabra clave, se apaga a los dos minutos sin hablarle a él', /_convPorPalabraClave && !_hablando && !_pensando && _refSuya && \(Date\.now\(\) - _refSuya\) > 120000/.test(H));
c('D2 · y al apagarse se olvida el modo (vuelve a la escucha de su nombre)', /window\._convPorPalabraClave = false;/.test(H));
c('D3 · lo que no va con él ni se manda ni se apunta', /if \(!_p\.vale\) \{[\s\S]{0,220}return;\s*\n\s*\}/.test(H));
c('D4 · y se le avisa en el cartel de cómo llamarle', /Di «Azkarin» para hablarme/.test(H));

console.log('\n══ E · SABOTAJE ══');
const roto = new Function('window', SRC.replace('if (!window._convPorPalabraClave) return { vale: true, texto: txt };', '') + '\nreturn _leHablaAEl;')({ _convPorPalabraClave: false, _ttsFinTs: 0, _convUltimaSuya: 0 });
c('E1 · sin la excepción del modo a mano, C1 sería falso', roto('ponme la última llamada').vale === false);

console.log('\n──────────────────────────────');
console.log(bien + ' bien · ' + mal + ' mal');
process.exit(mal ? 1 : 0);
