'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  EL BORRADOR DE AZKARIN, EN LA APP  ·  app v565 (2-sep-2026)
//
//  Asier: «si Antonio no tuviera que hacer la ficha, solo revisarla…». El servidor
//  (2.7.587) monta la ficha desde la llamada y la deja marcada como BORRADOR. Aquí
//  se comprueba que la app:
//   · la enseña con su etiqueta en MIS PRESUPUESTOS,
//   · pinta el cartel arriba de la ficha (quién cogió, cuentas, qué falta),
//   · deja de llamarla borrador SOLO cuando una persona la toca y se guarda,
//   · no la marca revisada por el mero hecho de abrirla,
//   · y que las fichas ARCHIVADAS no se listan (pero no se borran).
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };
function trozo(desde, hasta) { const i = H.indexOf(desde); const j = H.indexOf(hasta, i); return (i < 0 || j < 0) ? null : H.slice(i, j); }

console.log('\n══ A · EL CARTEL, CON CÓDIGO REAL ══');
const SRC_PINTAR = trozo('  function pintarBorradorAviso(data) {', '  window.pintarBorradorAviso = pintarBorradorAviso;');
c('A1 · la función existe', !!SRC_PINTAR);
if (!SRC_PINTAR) { console.log('\n  ' + bien + ' bien · ' + (mal + 1) + ' mal'); process.exit(1); }
const el = { style: { display: 'none' }, innerHTML: '' };
const pintar = new Function('document', SRC_PINTAR + '\nreturn pintarBorradorAviso;')({ getElementById: id => id === 'borradorAviso' ? el : null });
pintar({ _borrador: true, _azkarin: { quienCogio: 'Antonio', total: 812.5, faltan: ['la FECHA del servicio'], avisos: [], caidos: ['Piano (no suena en la llamada)'] } });
c('A2 · se enseña', el.style.display === 'block');
c('A3 · dice quién cogió la llamada', /que cogió Antonio/.test(el.innerHTML));
c('A4 · las cuentas de Óscar y que el precio es suyo', /812\.50 €/.test(el.innerHTML) && /El precio lo decides tú/.test(el.innerHTML));
c('A5 · qué falta por preguntar', /Falta por preguntar:<\/b> la FECHA/.test(el.innerHTML));
c('A6 · y qué no se apuntó', /No apuntado/.test(el.innerHTML) && /Piano/.test(el.innerHTML));
pintar({ _borrador: true, _azkarin: { faltan: ['<script>x</script>'] } });
c('A7 · lo que viene del servidor se escapa (no se inyecta HTML)', el.innerHTML.indexOf('<script>') < 0 && /&lt;script&gt;/.test(el.innerHTML));
pintar({ _borrador: false });
c('A8 · una ficha revisada no lleva cartel', el.style.display === 'none' && el.innerHTML === '');
pintar(null);
c('A9 · ni una ficha en blanco', el.style.display === 'none');

console.log('\n══ B · DEJA DE SER BORRADOR SOLO CUANDO UNA PERSONA LO TOCA ══');
c('B1 · al cargar se apunta si es borrador y que NADIE lo ha tocado aún', /window\._currentBorrador = !!data\._borrador;\s*window\._tocadoPorPersona = false;\s*try \{ pintarBorradorAviso\(data\); \}/.test(H));
c('B2 · el guardado automático (que salta al escribir) marca que alguien lo tocó', /function debouncedAutoSave\(\) \{\s*if \(window\._presupuestoLoading\) return;\s*window\._tocadoPorPersona = true;/.test(H));
c('B3 · 🛑 al guardar, SOLO si era borrador Y alguien lo tocó, queda revisado por esa persona', /if \(window\._currentBorrador && window\._tocadoPorPersona\) \{\s*data\._borrador = false;\s*data\._revisadoPor = \(typeof _comercialActual === 'function' && _comercialActual\(\)\) \|\| 'persona';\s*data\._revisadoTs = Date\.now\(\);/.test(H));
c('B4 · y el cartel se quita', /window\._currentBorrador = false;\s*try \{ pintarBorradorAviso\(null\); \}/.test(H));
c('B5 · la ficha en blanco arranca sin cartel', /function dejarLaFichaEnBlanco\(\)\{[\s\S]{0,120}window\._currentBorrador = false; window\._tocadoPorPersona = false;/.test(H));
// El «false» tiene que llegar a la nube: el guardado filtra los vacíos ('' / null / undefined), no los false.
c('B6 · 🛑 el guardado a la nube NO filtra un «false» (si lo filtrara, el borrador nunca dejaría de serlo)', /if \(data\[key\] !== undefined && data\[key\] !== null && data\[key\] !== ''\) \{\s*fbData\[key\] = data\[key\];/.test(H));

console.log('\n══ C · EN MIS PRESUPUESTOS ══');
c('C1 · la etiqueta 📝 BORRADOR está en la fila', /const borradorLabel = p\._borrador \? '<span[^']*📝 BORRADOR<\/span>' : '';/.test(H));
c('C2 · junto al nombre', /\(p\.f_nom \|\| 'Sin nombre'\) \+ borradorLabel \+ pagadoLabel/.test(H));
c('C3 · 🛑 las fichas ARCHIVADAS no se listan', /const current = all\.filter\(p => !p\._isVersion && !p\._archivada\)/.test(H));
c('C4 · pero no se borran: la nota lo dice', /no están\s*\/\/ borradas/.test(H) || /no están[\s\S]{0,80}borradas/.test(H));
c('C5 · el cartel tiene su sitio arriba de la ficha', /<div id='page-presupuesto' class='page' style='display:none'><div id='borradorAviso'/.test(H));

console.log('\n══ C2 · 🛑 EL NÚMERO DE CLIENTE NO BAILA (v566) ══');
c('C2.1 · al darle a «+ NUEVO», la ficha se apunta en la nube al instante', /window\._fichaRecienAbierta = true;\s*try \{ saveNow\(\); \}/.test(H));
c('C2.2 · y lleva quién la abrió y cuándo', /if \(window\._fichaRecienAbierta\) \{\s*data\._abiertaTs = Date\.now\(\);\s*data\._abiertaPor = /.test(H));
c('C2.3 · la ficha en blanco no arrastra la marca', /function dejarLaFichaEnBlanco\(\)\{[\s\S]{0,200}window\._fichaRecienAbierta = false;/.test(H));
c('C2.4 · la Ayuda lo cuenta', /El número de cliente no baila/.test(H));

console.log('\n══ D · TODO COMPILA Y LA VERSIÓN VA A LA PAR ══');
let rotos = 0;
for (const b of (H.match(/<script[^>]*>([\s\S]*?)<\/script>/g) || [])) {
  const cuerpo = b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
  if (!cuerpo.trim()) continue;
  try { new Function(cuerpo); } catch (e) { rotos++; console.log('    ROTO: ' + e.message); }
}
c('D1 · todos los <script> compilan', rotos === 0);
const V = (H.match(/var APP_VERSION = 'v(\d+)'/) || [])[1];
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const VJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
c('D2 · la app va por v565 o más', Number(V) >= 566, 'v' + V);
c('D3 · y sw.js y version.json dicen lo mismo', SW.indexOf("azkar-pwa-v" + V) >= 0 && VJ.version === 'v' + V);
c('D4 · la Ayuda lo cuenta', /BORRADOR DE AZKARIN|📝 BORRADOR/.test(H) && /app v56[6-9]|app v5[7-9]\d/.test(H));

console.log('\n──────────────────────────────────────────────');
console.log('  ' + bien + ' bien · ' + mal + ' mal');
console.log('──────────────────────────────────────────────');
process.exit(mal ? 1 : 0);
