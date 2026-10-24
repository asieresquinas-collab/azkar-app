/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
//  EL BOTÓN 🏠 DE ARRIBA DEL CHAT (app v727)  ·  node tests/boton-casa.test.js
//
//  Asier, 24-oct-2026: «me tienes que poner un botón en el chat para poner casa sí y casa no, y
//  no tener que andar escribiendo nada… en Azkarin, arriba». Aquí se aprieta el envoltorio de
//  fetch DE VERDAD y el botón DE VERDAD (los trozos del index.html que se suben):
//    A · poner y quitar cambian el servidor AL MOMENTO (antes había que cerrar y abrir la app)
//    B · el botón enseña con quién habla: 🏠 casa, ☁️ Railway, 🏠 apagado si casa no contesta
//    C · una pulsación pasa de Railway a casa (buscando la dirección sola) y otra vuelve a Railway
//    D · a Antonio (nunca usó casa) no le sale el botón
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path'), vm = require('vm');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const i0 = HTML.indexOf('//  v658 · LA SESIÓN VIAJA EN TODAS LAS LLAMADAS AL SERVIDOR');
const TROZO = HTML.slice(HTML.indexOf('(function () {', i0), HTML.indexOf('</script>', i0));
const b0 = HTML.indexOf('window._azkPintarCasa = function');
const b1 = HTML.indexOf("try { setTimeout(function () { window._azkPintarCasa(); }, 0); } catch (er) {}", b0);
const BOTON = HTML.slice(b0, b1);
if (!TROZO || TROZO.indexOf('_azkCasa') < 0 || b0 < 0 || b1 < 0) { console.log('❌ no encuentro el envoltorio o el botón'); process.exit(1); }

let ok = 0, mal = 0;
async function t(nombre, fn) { try { await fn(); ok++; console.log('  OK  ' + nombre); } catch (e) { mal++; console.log('  ❌  ' + nombre + '\n      → ' + (e && e.message)); } }
function iguales(a, b, q) { if (a !== b) throw new Error((q || '') + ' esperaba ' + JSON.stringify(b) + ' y es ' + JSON.stringify(a)); }
function cierto(x, q) { if (!x) throw new Error(q || 'no se cumple'); }
const R = 'https://azkar-presupuestos-production.up.railway.app';

function navegador(o) {
  o = o || {};
  const store = Object.assign({}, o.store || {});
  const llamadas = [], avisos = [];
  const clases = new Set();
  const boton = { style: { display: 'none' }, innerHTML: '', title: '', classList: { add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c) } };
  const win = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    location: { search: '', pathname: '/azkar-app/', hash: '' },
    history: { replaceState: function () {} },
    console: { log: () => {}, warn: () => {} },
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    URLSearchParams: URLSearchParams, Headers: Headers, AbortController: AbortController, Promise: Promise, Object: Object, String: String, Date: Date, JSON: JSON,
    addMsg: (rol, txt) => { avisos.push(txt); },
    document: { getElementById: id => (id === 'chatbot-casa-btn' ? boton : null) },
    _comercialActual: () => o.usuario || ''
  };
  win.window = win;
  win.fetch = async function (url, ini) {
    llamadas.push(url);
    if (url.indexOf('/api/casa/direccion') >= 0) return { ok: true, status: 200, json: async () => ({ ok: true, url: o.dir === undefined ? 'https://casa.trycloudflare.com' : o.dir }) };
    if (url.indexOf('https://casa.trycloudflare.com') === 0) {
      if (o.casa === 'no') throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, text: async () => JSON.stringify({ version: '2.7.1047' }), json: async () => ({ version: '2.7.1047' }) };
    }
    return { ok: true, status: 200, text: async () => '{"version":"railway"}', json: async () => ({ version: 'railway' }) };
  };
  vm.createContext(win);
  vm.runInContext(TROZO, win);
  vm.runInContext(BOTON, win);
  return { win, llamadas, avisos, store, boton, clases };
}
const espera = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n══ A · PONER Y QUITAR, AL MOMENTO ══');
  await t('A1 · con casa puesta, quitar → la siguiente llamada va ya a Railway (sin cerrar la app)', async () => {
    const n = navegador({ store: { azkar_servidor_casa: 'https://casa.trycloudflare.com' } });
    await n.win._azkCasa.probar();
    await n.win.fetch(R + '/api/chatbot/message', { method: 'POST', body: '{}' });
    cierto(n.llamadas.some(u => u === 'https://casa.trycloudflare.com/api/chatbot/message'), 'antes iba a casa');
    n.win._azkCasa.quitar();
    n.llamadas.length = 0;
    await n.win.fetch(R + '/api/chatbot/message', { method: 'POST', body: '{}' });
    iguales(n.llamadas.filter(u => u.indexOf('casa.trycloudflare') >= 0).length, 0, 'llamadas a casa después de quitar:');
    cierto(n.llamadas.indexOf(R + '/api/chatbot/message') >= 0, 'va a Railway');
    iguales(n.store.azkar_servidor_casa, undefined, 'guardado:');
  });
  await t('A2 · sin casa, poner → la siguiente llamada va ya a casa', async () => {
    const n = navegador();
    await n.win.fetch(R + '/api/chatbot/message', { method: 'POST', body: '{}' });
    cierto(n.llamadas.indexOf(R + '/api/chatbot/message') >= 0, 'antes a Railway');
    iguales(n.win._azkCasa.poner('https://casa.trycloudflare.com'), true);
    n.llamadas.length = 0;
    await n.win.fetch(R + '/api/chatbot/message', { method: 'POST', body: '{}' });
    cierto(n.llamadas.indexOf('https://casa.trycloudflare.com/api/chatbot/message') >= 0, 'ahora a casa: ' + JSON.stringify(n.llamadas));
  });

  console.log('\n══ B · EL BOTÓN ENSEÑA CON QUIÉN HABLA ══');
  await t('B1 · casa contestando → 🏠 encendido', async () => {
    const n = navegador({ store: { azkar_servidor_casa: 'https://casa.trycloudflare.com' } });
    await n.win._azkCasa.probar(); n.win._azkPintarCasa();
    iguales(n.boton.style.display, ''); iguales(n.boton.innerHTML, '&#127968;'); cierto(!n.clases.has('sin-respuesta'), 'no debe salir apagado'); cierto(/ordenador de casa/.test(n.boton.title));
  });
  await t('B2 · casa puesta pero sin contestar → 🏠 apagado (habla con Railway)', async () => {
    const n = navegador({ store: { azkar_servidor_casa: 'https://casa.trycloudflare.com' }, casa: 'no' });
    await n.win._azkCasa.probar(); n.win._azkPintarCasa();
    iguales(n.boton.innerHTML, '&#127968;'); cierto(n.clases.has('sin-respuesta'), 'debe salir apagado'); cierto(/Railway/.test(n.boton.title));
  });
  await t('B3 · sin casa, en un aparato que la ha usado → ☁️', async () => {
    const n = navegador({ store: { azkar_casa_boton: '1' } });
    n.win._azkPintarCasa();
    iguales(n.boton.style.display, ''); iguales(n.boton.innerHTML, '&#9729;&#65039;');
  });

  console.log('\n══ C · UNA PULSACIÓN Y CAMBIA ══');
  await t('C1 · en Railway, pulsar → busca la dirección sola, pasa a casa y lo dice', async () => {
    const n = navegador({ store: { azkar_casa_boton: '1' } });
    n.win.azkarinCasaToggle();
    await espera(30);
    iguales(n.store.azkar_servidor_casa, 'https://casa.trycloudflare.com', 'guardado:');
    cierto(n.avisos.some(a => /Ya hablas con el ordenador de casa/.test(a)), JSON.stringify(n.avisos));
    iguales(n.boton.innerHTML, '&#127968;'); cierto(!n.clases.has('cambiando'), 'el botón vuelve a estar listo');
  });
  await t('C2 · en casa, pulsar → Railway al momento y lo dice', async () => {
    const n = navegador({ store: { azkar_servidor_casa: 'https://casa.trycloudflare.com' } });
    await n.win._azkCasa.probar();
    n.win.azkarinCasaToggle();
    iguales(n.store.azkar_servidor_casa, undefined);
    cierto(n.avisos.some(a => /Ya hablas con Railway/.test(a)), JSON.stringify(n.avisos));
    iguales(n.boton.innerHTML, '&#9729;&#65039;'); iguales(n.boton.style.display, '', 'el botón sigue para volver');
  });
  await t('C3 · casa apagada: pulsar lo intenta, avisa del motivo y se queda en Railway sin romper nada', async () => {
    const n = navegador({ store: { azkar_casa_boton: '1' }, casa: 'no' });
    n.win.azkarinCasaToggle();
    await espera(30);
    cierto(n.avisos.some(a => /no contesta ahora/.test(a) && /sigues con Railway/.test(a)), JSON.stringify(n.avisos));
    n.llamadas.length = 0;
    await n.win.fetch(R + '/api/presupuestos', {});
    cierto(n.llamadas.indexOf(R + '/api/presupuestos') >= 0, 'lo demás sigue por Railway');
  });
  await t('C4 · sin dirección apuntada: lo dice y sigue en Railway', async () => {
    const n = navegador({ store: { azkar_casa_boton: '1' }, dir: null });
    n.win.azkarinCasaToggle();
    await espera(30);
    cierto(n.avisos.some(a => /No encuentro la dirección/.test(a)), JSON.stringify(n.avisos));
    iguales(n.store.azkar_servidor_casa, undefined);
  });

  console.log('\n══ D · A ANTONIO NO LE SALE ══');
  await t('D1 · aparato que nunca usó casa y usuario Antonio → botón escondido', async () => {
    const n = navegador({ usuario: 'Toni' });
    n.win._azkPintarCasa();
    iguales(n.boton.style.display, 'none');
  });
  await t('D2 · y a Asier sí, aunque su aparato no tenga casa puesta', async () => {
    const n = navegador({ usuario: 'Asier' });
    n.win._azkPintarCasa();
    iguales(n.boton.style.display, '');
  });
  await t('D3 · el botón está arriba del chat de Azkarin', async () => {
    const cab = HTML.slice(HTML.indexOf('<div id="chatbot-header">'), HTML.indexOf('<div id="chatbot-msgs">'));
    cierto(cab.indexOf('id="chatbot-casa-btn"') >= 0 && cab.indexOf('azkarinCasaToggle()') >= 0);
  });

  console.log('\n' + (mal ? '❌ ' : '✅ ') + ok + ' bien, ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
})();
