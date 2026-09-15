/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
//  LO QUE DICE EL ALTAVOZ NO ES LO QUE DICE ASIER  ·  app v663 · backend 2.7.748
//  15-sep, 18:56: el recado leído en alto entró como mensaje suyo, emoji incluido.
//  Ejecutar:  node tests/lo-del-altavoz.test.js
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fallos = 0, total = 0;
function ok(n, cond, det) { total++; if (cond) console.log('  ✅ ' + n); else { console.log('  ❌ ' + n + (det ? ' → ' + det : '')); fallos++; } }
console.log('\n🔊 LO DEL ALTAVOZ\n');

console.log('A · la app');
ok('A1 · 🛑 en _mpMandarATexto el «var opts» que pisaba el parámetro ya no está: el fetch va en «req»', /function _mpMandarATexto\(wav, intento, segundosVoz, opts\) \{[\s\S]{0,1800}fetch\(RAILWAY_API \+ '\/api\/voz\/dictado', req\)/.test(HTML) && !/function _mpMandarATexto\(wav, intento, segundosVoz, opts\) \{[\s\S]{0,1800}var opts = \{/.test(HTML));
ok('A2 · lo que acaba de decir (3 min) se manda siempre como «ignorar»', /window\._ultimoHabla && \(Date\.now\(\) - \(window\._ultimoHablaTs \|\| 0\)\) < 180000/.test(HTML) && /ignorar: _ign \|\| undefined/.test(HTML));
ok('A3 · se apunta cuándo lo dijo', /window\._ultimoHablaTs = Date\.now\(\)/.test(HTML));
ok('A4 · un recado vale como eco tres minutos', /d\.recado && \(Date\.now\(\) - d\.ts\) < 180000/.test(HTML) && /recado: \/\^\(oye asier\|asier,\? \)\/\.test\(clean\)/.test(HTML));
ok('A5 · y el recado metido dentro de lo oído también es eco', /t\.indexOf\(ref\.slice\(0, 40\)\) >= 0\) \{ _logEco\(txt, 'contiene-recado'\)/.test(HTML));

console.log('\nB · versión y ayuda');
const _v = (HTML.match(/var APP_VERSION = '(v\d+)'/) || [])[1];
ok('B1 · index.html va en v663 o más nueva', parseInt(String(_v).slice(1), 10) >= 663, _v);
ok('B2 · sw.js dice la misma', new RegExp('azkar-pwa-' + _v).test(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8')));
ok('B3 · version.json dice la misma', JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).version === _v);
ok('B4 · la ayuda lo cuenta', /LO QUE DICE EL ALTAVOZ NO ES LO QUE DICES TÚ/.test(HTML));

console.log('\n' + (fallos === 0 ? '✅ TODO BIEN (' + total + ')' : '❌ FALLOS: ' + fallos + ' de ' + total) + '\n');
process.exit(fallos === 0 ? 0 : 1);
