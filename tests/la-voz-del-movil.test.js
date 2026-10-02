/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
//  LA VOZ DEL MÓVIL SE ELIGE DESDE /voz  ·  app v675/v676
//  2-oct: «quiero una voz de hombre… la he cambiado en el móvil y no cambia».
//  La app solo pedía «es-ES» y el móvil usaba siempre su voz por defecto.
//  Ejecutar:  node tests/la-voz-del-movil.test.js
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fallos = 0, total = 0;
function ok(n, cond, det) { total++; if (cond) console.log('  ✅ ' + n); else { console.log('  ❌ ' + n + (det ? ' → ' + det : '')); fallos++; } }
console.log('\n🎙️ LA VOZ DEL MÓVIL\n');

console.log('A · la app');
ok('A1 · al hablar en la app se pasa la voz elegida (voice = índice) solo si hay una', /var _vIdx = await _vozMovilIdx\(TTS\)/.test(HTML) && /if \(_vIdx >= 0\) _op\.voice = _vIdx; await TTS\.speak\(_op\)/.test(HTML));
ok('A2 · sin voz elegida se habla como siempre (sin «voice»)', /var _op = \{ text: _trozos\[_k\], lang: 'es-ES', rate: _ttsRate, pitch: 1\.0, volume: 1\.0, category: 'playback' \}/.test(HTML));
ok('A3 · la voz se busca por voiceURI o nombre en la lista que da el propio móvil', /vs\[i\]\.voiceURI === uri \|\| vs\[i\]\.name === uri/.test(HTML) && /TTS\.getSupportedVoices\(\)/.test(HTML));
ok('A4 · dentro de la app /voz enseña las voces del móvil (las de Gemini no suenan ahí)', /if \(_esAppNativa\(\) && _T\) \{ return window\.azkarinSelectorVozMovil\(\); \}/.test(HTML));
ok('A5 · solo se listan las voces en español', /\/\^es\/i\.test\(v\.lang\)/.test(HTML));
ok('A6 · pulsar una la guarda, la prueba y se puede volver a la de siempre (-1)', /azkarinSetVozMovil\(-1\)/.test(HTML) && /localStorage\.setItem\('azkar_tts_voz_movil'/.test(HTML));
ok('A7 · en el navegador sigue el selector de antes', /window\.azkarinSelectorVozWeb = function/.test(HTML));

ok('A8 · cada voz se distingue por su voiceURI (el «name» de Android sale igual en todas)', /String\(v\.voiceURI \|\| v\.name \|\| ''\)\.slice\(0, 34\)/.test(HTML));
ok('A9 · el selector dice cuántas voces hay y la versión de la app', /en español · app '/.test(HTML));

console.log('\nB · versión y ayuda');
const _v = (HTML.match(/var APP_VERSION = '(v\d+)'/) || [])[1];
ok('B1 · index.html va en v675 o más nueva', parseInt(String(_v).slice(1), 10) >= 675, _v);
ok('B2 · sw.js dice la misma', new RegExp('azkar-pwa-' + _v).test(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8')));
ok('B3 · version.json dice la misma', JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).version === _v);
ok('B4 · la ayuda lo cuenta', /\/voz te enseña las voces en español que tiene tu móvil/.test(HTML));

console.log('\n' + (fallos === 0 ? '✅ TODO BIEN (' + total + ')' : '❌ FALLOS: ' + fallos + ' de ' + total) + '\n');
process.exit(fallos === 0 ? 0 : 1);
