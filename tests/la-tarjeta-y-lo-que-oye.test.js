/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
// «QUE NO ME MANDES PARA QUE TE ACEPTE» Y LO QUE OYE DE OTROS (app v662 · 15-sep)
// Ejecutar:  node tests/la-tarjeta-y-lo-que-oye.test.js
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fallos = 0;
function ok(nombre, cond, detalle) { if (cond) { console.log('  ✅ ' + nombre); } else { console.log('  ❌ ' + nombre + (detalle ? ' → ' + detalle : '')); fallos++; } }
console.log('\n🃏 LA TARJETA Y LO QUE OYE\n');

console.log('A · «no me mandes la tarjeta»');
const m = HTML.match(/if \((\/\\b\(\?:no me \(\?:lo \|la \)\?mandes.*?\/)\.test\(_r\)\) \{/);
ok('A1 · existe la orden', !!m);
const RE = m ? eval(m[1]) : null;
const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
ok('A2 · pilla «Que no me mandes para que te acepte, que te estoy diciendo que tiene que estar en marcha ya»', RE && RE.test(norm('Que no me mandes para que te acepte, que te estoy diciendo que tiene que estar en marcha ya')));
ok('A3 · y «Oye, me sigues mandando. Que no me mandes»', RE && RE.test(norm('Oye, me sigues mandando. Que no me mandes, que te estoy diciendo que ese cliente está en marcha ya')));
ok('A4 · pero no un «sí, mándaselo»', RE && !RE.test(norm('sí, mándaselo')));
ok('A5 · quita la tarjeta y deja pasar la frase al chat', /pendingAction = null;[\s\S]{0,300}Tarjeta de confirmación retirada a petición de Asier/.test(HTML) && /y su mensaje sigue su camino normal hacia Azkarin/.test(HTML));

console.log('\nB · lo que oye de otras conversaciones');
ok('B1 · el aviso ya no lleva lo que ha oído', !/Dime «<b>Azkarin, ' \+ String\(txt\)\.slice\(0, 40\)/.test(HTML));
ok('B2 · y sale una vez al día, no cada vez que se abre', /localStorage\.setItem\('azk_avisoPalabraClave', _hoyPC\)/.test(HTML));

console.log('\nC · versión');
const _v = (HTML.match(/var APP_VERSION = '(v\d+)'/) || [])[1];
ok('C1 · v662 o más nueva', parseInt(String(_v).slice(1), 10) >= 662, _v);
ok('C2 · sw.js y version.json dicen la misma', new RegExp('azkar-pwa-' + _v).test(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8')) && JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).version === _v);

console.log('\n' + (fallos === 0 ? '✅ TODO BIEN' : '❌ FALLOS: ' + fallos) + '\n');
process.exit(fallos === 0 ? 0 : 1);
