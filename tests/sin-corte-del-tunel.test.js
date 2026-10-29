'use strict';
// ════════════════════════════════════════════════════════════════════════════════════════════════════
//  «QUE NO LO TENGA QUE COGER DEL TÚNEL, QUE LE DÉ TIEMPO PARA HACERLO»  ·  v740 (29-oct-2026, backend 2.7.1140)
//
//  13:46, el ordenador de casa contesta a «revísame toda la información de Yolanda…» a los cuatro minutos y la
//  respuesta sale con «↩️ Ha tardado más de lo que aguanta el túnel del ordenador de casa; lo he recogido de allí»:
//  el túnel (Cloudflare) corta a los cien segundos y la app la recogía del buzón por la puerta de atrás.
//
//  🛑 LO QUE PROTEGE:
//   · la app pide «buzon_si_tarda» (al escribir y al confirmar una tarjeta),
//   · si casa contesta «sigo con ello» (tipo en_marcha), se espera a la respuesta en el buzón hasta doce minutos,
//     con el «trabajando…» puesto, y se pinta por el camino de siempre (sin avisos de túnel),
//   · si no llega en doce minutos, se dice y no se pierde (el rescate al volver a la app sigue).
// ════════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fallos = 0;
const ok = (n, x, d) => { console.log((x ? '  ✅ ' : '  ❌ ') + n + (x || !d ? '' : '  →  ' + d)); if (!x) fallos++; };

(async () => {
  console.log('\n══ A · LA APP LO PIDE ══');
  ok('A1 · al escribir a Azkarin', /_b\.buzon_si_tarda = true;/.test(HTML));
  ok('A2 · y al confirmar una tarjeta', /confirmar_accion: \{ herramienta: accion\.herramienta, argumentos: accion\.argumentos, confirmado: true \},\s*buzon_si_tarda: true/.test(HTML));

  console.log('\n══ B · EL «SIGO CON ELLO» SE ESPERA Y SE PINTA COMO SIEMPRE ══');
  ok('B1 · al escribir: antes de dar el turno por resuelto y de quitar el «trabajando…», se espera la de verdad y sigue por el camino de siempre', /var data = await resp\.json\(\);\s*\/\/ v740[^\n]*\n\s*if \(data && data\.tipo === 'en_marcha'\) \{\s*var _dEM = await _seguirEnMarcha\(data, _turnoId\);[\s\S]{0,600}data = _dEM;\s*\}\s*_turnoResuelto\(_turnoId\);/.test(HTML));
  ok('B2 · al confirmar, igual', /if \(data && data\.tipo === 'en_marcha'\) \{\s*var _dEMC = await _seguirEnMarcha\(data, _turnoIdC\);[\s\S]{0,600}data = _dEMC;\s*\}\s*_turnoResuelto\(_turnoIdC\);/.test(HTML));
  ok('B3 · si no llega en doce minutos, se dice (y no se pinta dos veces si ya se recogió al volver a la app)', (HTML.match(/if \(!\(window\._yaPintadoTurno && window\._yaPintadoTurno\(_turnoIdC?\)\)\) addMsg\('bot', '🏠 El ordenador de casa lleva más de doce minutos con esto y todavía no ha terminado\./g) || []).length === 2);
  ok('B4 · con un servidor de casa sin actualizar, el rescate de antes sigue (el buzón tras el corte)', /var _resc = await _esperarBuzon\(_turnoId, \(err && err\.name === 'AbortError'\) \? 20000 : \(_porCasa \? 720000 : 90000\)\);/.test(HTML));

  console.log('\n══ C · _seguirEnMarcha, DE VERDAD ══');
  const trozo = (re) => { const m = HTML.match(re); return m ? m[0] : ''; };
  const fB = trozo(/  async function _buzonDelTurno\(turnoId\) \{[\s\S]*?\n  \}\n/);
  const fE = trozo(/  async function _esperarBuzon\(turnoId, msTope\) \{[\s\S]*?\n  \}\n/);
  const fS = trozo(/  async function _seguirEnMarcha\(data, turnoId\) \{[\s\S]*?\n  \}\n/);
  ok('C0 · están las tres piezas', !!(fB && fE && fS));
  if (fB && fE && fS) {
    const montar = (respuestas) => {
      const reloj = { t: 1e12 }, urls = [], avisos = [];
      const FakeDate = { now: () => reloj.t };
      const fetchF = async (u) => { urls.push(u); const r = respuestas.length ? respuestas.shift() : { pasos: [] }; return { ok: true, json: async () => r }; };
      const st = (fn, ms) => { reloj.t += (ms || 0); fn(); return 0; };
      const mk = new Function('RAILWAY_API', 'fetch', 'setTimeout', 'addMsg', 'window', '_authToken', 'Date', fB + fE + fS + '\nreturn _seguirEnMarcha;');
      const f = mk('https://servidor', fetchF, st, (q, t) => avisos.push(t), {}, 'tok', FakeDate);
      return { f, urls, avisos, reloj };
    };
    const m1 = montar([]);
    const normal = { tipo: 'texto', mensaje: 'rápida' };
    ok('C1 · una respuesta normal pasa tal cual (sin mirar el buzón)', (await m1.f(normal, 't1')) === normal && m1.urls.length === 0);
    const m2 = montar([{ pasos: ['📞 Bajando las llamadas…'] }, { pasos: ['🧠 Pensando'] }, { pasos: [], listo: true, respuesta: { tipo: 'texto', mensaje: 'La de verdad, entera' } }]);
    const r2 = await m2.f({ tipo: 'en_marcha', turno_id: 'turno-9' }, 'turno-9');
    ok('C2 · tras el «sigo con ello», devuelve la respuesta de verdad del buzón de ese turno', r2 && r2.mensaje === 'La de verdad, entera' && m2.urls.length === 3 && m2.urls.every(u => u.indexOf('/api/chatbot/progress/turno-9?t=') >= 0), JSON.stringify({ r2, urls: m2.urls }));
    const m3 = montar([]);
    const r3 = await m3.f({ tipo: 'en_marcha', turno_id: 'turno-10' }, 'turno-10');
    ok('C3 · si en doce minutos no llega, null (y ha estado mirando todo ese rato, cada dos segundos y medio)', r3 === null && m3.urls.length >= 280 && m3.urls.length <= 290, 'veces: ' + m3.urls.length);
    const m4 = montar([{ pasos: [], listo: true, respuesta: { tipo: 'texto', mensaje: 'con documento' }, aviso: 'La respuesta llevaba un documento pesado' }]);
    const r4 = await m4.f({ tipo: 'en_marcha', turno_id: 't4' }, 't4');
    ok('C4 · si el buzón trae un aviso (un documento pesado que no se guardó), se dice', r4 && r4.mensaje === 'con documento' && m4.avisos.some(t => /^ℹ️ La respuesta llevaba un documento pesado/.test(t)), JSON.stringify(m4.avisos));
  }

  console.log('\n══ D · VERSIÓN ══');
  const ver = (HTML.match(/var APP_VERSION = '(v\d+)';/) || [])[1];
  const vj = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).version;
  const sw = (fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8').match(/CACHE_NAME = 'azkar-pwa-(v\d+)'/) || [])[1];
  ok('D1 · la app, version.json y el service worker dicen la misma versión (v740 o más)', ver && ver === vj && ver === sw && Number(ver.slice(1)) >= 740, [ver, vj, sw].join(' / '));

  console.log('\n' + (fallos ? '❌ ' + fallos + ' fallos' : '✅ sin corte del túnel: todo bien'));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.log('❌ revento: ' + (e && e.stack)); process.exit(1); });
