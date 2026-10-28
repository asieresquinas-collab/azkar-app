/* eslint-disable */
// ────────────────────────────────────────────────────────────────────────
// LA TARJETA DE CONFIRMAR, DICHA Y RECORDADA (app v738 · 28-oct-2026)
// Asier: «¿qué es ese ejecutable que me has mandado? … dime qué es, no lo quiero leer».
// Ejecutar:  node tests/la-tarjeta-que-se-oye.test.js
// ────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fallos = 0;
function ok(nombre, cond, detalle) { if (cond) { console.log('  ✅ ' + nombre); } else { console.log('  ❌ ' + nombre + (detalle ? ' → ' + detalle : '')); fallos++; } }
console.log('\n🃏 LA TARJETA QUE SE OYE\n');

// La función, tal cual está en la app, con lo que necesita de alrededor puesto a mano
const m = HTML.match(/  function _pintarConfirmacion\(data\) \{[\s\S]*?\n  \}\n/);
ok('A1 · existe _pintarConfirmacion', !!m);
let probar = null;
if (m) {
  probar = function (data) {
    const vistos = { msgs: [], tarjetas: [], hist: [], pendiente: null };
    const f = new Function('addMsg', 'addConfirmMsg', 'chatHistorial', 'ponPendiente', 'data',
      m[0].replace('pendingAction = data.accion;', 'ponPendiente(data.accion);') + '\nreturn _pintarConfirmacion(data);');
    const r = f((quien, t) => vistos.msgs.push({ quien, t }), (d) => vistos.tarjetas.push(d), vistos.hist, (a) => { vistos.pendiente = a; }, data);
    vistos.r = r;
    return vistos;
  };
}
if (probar) {
  const v = probar({ tipo: 'confirmacion', mensaje: 'Para hacerlo necesito tu OK: Añadir al presupuesto 6929 TODAS las líneas de la 6191.\nSi te parece bien, dime «sí» o pulsa «Sí, ejecutar».', accion: { herramienta: 'agregar_articulos', argumentos: { ref: '6929' }, descripcion: 'Añadir al presupuesto 6929 TODAS las líneas de la 6191, tal cual (mismos precios)' } });
  ok('A2 · el texto sale en el chat (y por tanto en voz alta: addMsg es lo que se lee)', v.msgs.length === 1 && v.msgs[0].quien === 'bot' && /necesito tu OK/.test(v.msgs[0].t), JSON.stringify(v.msgs));
  ok('A3 · la tarjeta se pinta con lo que hará', v.tarjetas.length === 1 && /6191/.test(v.tarjetas[0]));
  ok('A4 · queda pendiente para el «sí»', v.pendiente && v.pendiente.herramienta === 'agregar_articulos');
  ok('A5 · y en la conversación, para que Azkarin sepa qué le ha mandado si Asier pregunta', v.hist.length === 1 && /\[TARJETA PENDIENTE DE TU OK: Añadir al presupuesto 6929/.test(v.hist[0].content), JSON.stringify(v.hist));
  const v2 = probar({ tipo: 'confirmacion', mensaje: '', accion: { herramienta: 'modificar_campo', descripcion: 'Cambiar el segundo teléfono de la 6770 a 660799393' } });
  ok('A6 · sin texto de Azkarin: tarjeta igual, y en la conversación lo que hace', v2.msgs.length === 0 && v2.tarjetas.length === 1 && /segundo teléfono de la 6770/.test(v2.hist[0].content));
  const v3 = probar({ tipo: 'confirmacion', mensaje: 'x' });
  ok('A7 · sin acción no pinta nada', v3.r === false && v3.tarjetas.length === 0);
}

console.log('\nB · los tres caminos por los que llega una tarjeta');
ok('B1 · la respuesta normal', /\} else if \(data\.tipo === 'confirmacion'\) \{\s*_pintarConfirmacion\(data\);/.test(HTML));
ok('B2 · el paso siguiente que llega al confirmar el anterior (antes: «Hecho ✅. Siguiente paso:» y nada)', /\} else if \(data\.tipo === 'confirmacion' && data\.accion\) \{[\s\S]{0,600}_pintarConfirmacion\(data\);\s*\} else \{\s*addMsg\('bot', \(\/\^\\s\*\[❌⚠️🛑🚫\]\//.test(HTML));
ok('B3 · la respuesta recogida del buzón', /if \(r && r\.tipo === 'confirmacion' && r\.accion\) \{ _pintarConfirmacion\(r\);/.test(HTML));
ok('B4 · el «sí» hablado sigue ejecutando la tarjeta pendiente', /var _esSi = _corto && \/\^\(si\|/.test(HTML) && /chatbotConfirm\(_esSi\);/.test(HTML));

console.log('\nC · versión');
const _v = (HTML.match(/var APP_VERSION = '(v\d+)'/) || [])[1];
ok('C1 · v738 o más nueva', parseInt(String(_v).slice(1), 10) >= 738, _v);
ok('C2 · sw.js y version.json dicen la misma', new RegExp('azkar-pwa-' + _v).test(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8')) && JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).version === _v);

console.log('\n' + (fallos === 0 ? '✅ TODO BIEN' : '❌ FALLOS: ' + fallos) + '\n');
process.exit(fallos === 0 ? 0 : 1);
