/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
//  EL SERVIDOR DE CASA (app v710)  ·  node tests/servidor-de-casa.test.js
//
//  Asier, 23-oct-2026: «lo quiero probar en el Azkarin de verdad». En su ordenador corre una
//  copia del servidor con el modelo de IA de casa. SOLO el aparato donde se active habla con
//  ella; los demás siguen en Railway. Aquí se aprieta el envoltorio de fetch DE VERDAD (el
//  trozo del index.html que se sube) con una red de mentira:
//    A · sin nada configurado, todo va a Railway como siempre (ni una llamada más)
//    B · con el servidor de casa contestando, las llamadas a Railway van a casa, con sus cabeceras
//    C · si casa no contesta al abrir, esta sesión va a Railway y se avisa en el chat
//    D · si casa se cae a mitad, esa llamada y las siguientes van a Railway, con aviso
//    E · ?casa=https://… lo guarda y se limpia de la dirección; ?casa=no lo quita
//    F · los enlaces que no son llamadas (APK, portal) no se tocan
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path'), vm = require('vm');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const i0 = HTML.indexOf('//  v658 · LA SESIÓN VIAJA EN TODAS LAS LLAMADAS AL SERVIDOR');
const i1 = HTML.indexOf('</script>', i0);
const TROZO = HTML.slice(HTML.indexOf('(function () {', i0), i1);   // el envoltorio empieza justo detrás del comentario
if (!TROZO || TROZO.indexOf('_azkCasa') < 0) { console.log('❌ no encuentro el envoltorio de fetch con el servidor de casa'); process.exit(1); }

let ok = 0, mal = 0;
async function t(nombre, fn) { try { await fn(); ok++; console.log('  OK  ' + nombre); } catch (e) { mal++; console.log('  ❌  ' + nombre + '\n      → ' + (e && e.message)); } }
function iguales(a, b, q) { if (a !== b) throw new Error((q || '') + ' esperaba ' + JSON.stringify(b) + ' y es ' + JSON.stringify(a)); }

// navegador de mentira: lo justo que usa el trozo
function navegador(o) {
  o = o || {};
  const store = Object.assign({}, o.store || {});
  const llamadas = [];
  const avisos = [];
  const win = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    location: { search: o.search || '', pathname: '/azkar-app/', hash: '' },
    history: { replaceState: function (a, b, url) { win._urlFinal = url; } },
    console: { log: () => {}, warn: () => {} },
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    URLSearchParams: URLSearchParams, Headers: Headers, AbortController: AbortController, Promise: Promise, Object: Object, String: String, Date: o.reloj ? (function () { const D = function () { return new Date(o.reloj.t); }; D.now = function () { return o.reloj.t; }; return D; })() : Date,
    addMsg: (rol, txt) => { avisos.push(txt); }
  };
  win.window = win;
  // la red de mentira: casa contesta (o no) según o.casa; Railway siempre
  win.fetch = async function (url, ini) {
    llamadas.push({ url: url, headers: ini && ini.headers ? Object.fromEntries(ini.headers.entries ? ini.headers.entries() : []) : {} });
    if (url.indexOf('https://casa.ts.net') === 0) {
      if (o.casa === 'cae' && llamadas.filter(x => x.url.indexOf('https://casa.ts.net') === 0).length > 1) throw new TypeError('Failed to fetch');
      if (o.casa === 'no') throw new TypeError('Failed to fetch');
      if (o.casa === 'lenta') return new Promise((res, rej) => { if (ini && ini.signal) ini.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });   // nunca contesta; el fetch de verdad falla al abortar
      if (o.casa === 'offline') return { ok: true, status: 200, text: async () => '{"offline":true}', json: async () => ({ offline: true }) };
      if (o.casa === 'raro') return { ok: true, status: 200, text: async () => '{"hola":"otra cosa"}', json: async () => ({ hola: 'otra cosa' }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok', version: '2.7.1019' }), json: async () => ({ status: 'ok', version: '2.7.1019' }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok', version: 'railway' }), json: async () => ({ status: 'ok', version: 'railway' }) };
  };
  vm.createContext(win);
  vm.runInContext(TROZO, win);
  return { win, llamadas, avisos, store };
}
const R = 'https://azkar-presupuestos-production.up.railway.app';

(async function () {
  console.log('\n══ A · SIN NADA CONFIGURADO, TODO A RAILWAY ══');
  await t('A1 · la llamada sale tal cual a Railway, con sus cabeceras, y no hay ninguna llamada de más', async () => {
    const n = navegador({ store: { azkar_token: 'tok', 'azkar-api-key': 'k1' } });
    await n.win.fetch(R + '/api/chatbot/message', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    iguales(n.llamadas.length, 1); iguales(n.llamadas[0].url, R + '/api/chatbot/message');
    iguales(n.llamadas[0].headers['authorization'], 'Bearer tok'); iguales(n.llamadas[0].headers['x-api-key'], 'k1');
    iguales(n.win._azkCasa.estado().configurado, '');
  });

  console.log('\n══ B · CON CASA CONTESTANDO, LAS LLAMADAS VAN A CASA ══');
  await t('B1 · al cargar se pregunta al health de casa; la llamada a Railway va a casa con las mismas cabeceras', async () => {
    const n = navegador({ store: { azkar_servidor_casa: 'https://casa.ts.net', azkar_token: 'tok', 'azkar-api-key': 'k1' }, casa: 'ok' });
    await n.win.fetch(R + '/api/chatbot/message', { method: 'POST' });
    const urls = n.llamadas.map(x => x.url);
    if (!urls[0].startsWith('https://casa.ts.net/api/version')) throw new Error('primero la versión (v714: /api/version, que contesta al momento): ' + urls.join(' | '));
    iguales(urls[1], 'https://casa.ts.net/api/chatbot/message');
    iguales(n.llamadas[1].headers['authorization'], 'Bearer tok'); iguales(n.llamadas[1].headers['x-api-key'], 'k1');
    const e = n.win._azkCasa.estado(); iguales(e.activa, true); iguales(e.version, '2.7.1019');
    iguales(n.avisos.length, 0, 'sin avisos');
  });
  await t('B2 · con casa contestando, se pregunta UNA vez por sesión, no en cada llamada', async () => {
    const n = navegador({ store: { azkar_servidor_casa: 'https://casa.ts.net' }, casa: 'ok' });
    await n.win.fetch(R + '/api/a'); await n.win.fetch(R + '/api/b'); await n.win.fetch(R + '/api/c');
    iguales(n.llamadas.filter(x => x.url.indexOf('/api/version') >= 0).length, 1);
    iguales(n.llamadas.filter(x => x.url.indexOf('https://casa.ts.net/api/') === 0 && x.url.indexOf('/api/version') < 0).length, 3);
  });
  await t('B3 · una llamada que no es a Railway (Google, otra web) no se toca', async () => {
    const n = navegador({ store: { azkar_servidor_casa: 'https://casa.ts.net' }, casa: 'ok' });
    await n.win.fetch('https://maps.googleapis.com/x');
    iguales(n.llamadas.filter(x => x.url.indexOf('casa.ts.net') >= 0).length, 1, 'solo la prueba');   // la prueba sale al cargar
    iguales(n.llamadas[n.llamadas.length - 1].url, 'https://maps.googleapis.com/x');
  });

  console.log('\n══ C · SI CASA NO CONTESTA AL ABRIR, RAILWAY Y AVISO ══');
  await t('C1 · casa no responde: la llamada va a Railway y se avisa en el chat', async () => {
    const n = navegador({ store: { azkar_servidor_casa: 'https://casa.ts.net' }, casa: 'no' });
    await n.win.fetch(R + '/api/chatbot/message');
    iguales(n.llamadas[n.llamadas.length - 1].url, R + '/api/chatbot/message');
    iguales(n.win._azkCasa.estado().activa, false);
    await new Promise(r => setTimeout(r, 2700));
    if (!n.avisos.some(a => /No llego al ordenador de casa/.test(a) && /lo vuelvo a probar en un minuto/.test(a))) throw new Error('sin aviso: ' + JSON.stringify(n.avisos));
  });
  await t('C2 · casa tarda más de cuatro segundos: se corta y va a Railway (no se queda colgado)', async () => {
    const n = navegador({ store: { azkar_servidor_casa: 'https://casa.ts.net' }, casa: 'lenta' });
    const t0 = Date.now();
    await n.win.fetch(R + '/api/chatbot/message');
    const ms = Date.now() - t0;
    if (ms > 10000) throw new Error('ha tardado ' + ms + ' ms');
    iguales(n.llamadas[n.llamadas.length - 1].url, R + '/api/chatbot/message');
  }).then(() => {});

  console.log('\n══ D · SI CASA SE CAE A MITAD, RAILWAY Y AVISO ══');
  await t('D1 · la primera va a casa; cuando casa falla, esa llamada se repite en Railway y las siguientes ya van a Railway', async () => {
    const n = navegador({ store: { azkar_servidor_casa: 'https://casa.ts.net' }, casa: 'cae' });
    await n.win.fetch(R + '/api/uno');        // health (1ª a casa) + /api/uno → la 2ª a casa falla → Railway
    await n.win.fetch(R + '/api/dos');
    const urls = n.llamadas.map(x => x.url);
    iguales(urls.indexOf(R + '/api/uno') >= 0, true, 'uno repetida en Railway: ' + urls.join(' | '));
    iguales(urls[urls.length - 1], R + '/api/dos');
    iguales(n.win._azkCasa.estado().activa, false);
    if (!n.avisos.some(a => /ha dejado de contestar/.test(a))) throw new Error('sin aviso: ' + JSON.stringify(n.avisos));
  });

  console.log('\n══ E · ?casa=… LO GUARDA Y SE LIMPIA; ?casa=no LO QUITA ══');
  await t('E1 · abrir la app con ?casa=https://casa.ts.net lo guarda y limpia la dirección', async () => {
    const n = navegador({ search: '?casa=https://casa.ts.net/', casa: 'ok' });
    iguales(n.store.azkar_servidor_casa, 'https://casa.ts.net');
    iguales(n.win._urlFinal, '/azkar-app/');
  });
  await t('E2 · ?casa=no lo quita; una dirección rara (http, con ruta) no se guarda', async () => {
    const n = navegador({ store: { azkar_servidor_casa: 'https://casa.ts.net' }, search: '?casa=no' });
    iguales(n.store.azkar_servidor_casa, undefined);
    const m = navegador({ search: '?casa=http://casa.ts.net/api' });
    iguales(m.store.azkar_servidor_casa, undefined);
    iguales(m.win._azkCasa.poner('https://otra.ts.net'), true); iguales(m.store.azkar_servidor_casa, 'https://otra.ts.net');
    iguales(m.win._azkCasa.poner('casa.ts.net'), false);
  });

  console.log('\n══ F · LA ORDEN «/casa» EN EL CHAT Y LOS ENLACES DE FUERA ══');
  await t('F1 · el chat entiende «/casa https://…», «/casa no» y «/casa» (y pide cerrar y abrir la app)', async () => {
    const i = HTML.indexOf("if (msg && /^\\/casa\\b/i.test(msg)) {");
    if (i < 0) throw new Error('no está la orden /casa en chatbotSend');
    const trozo = HTML.slice(i, i + 2500);
    if (!/_C\.quitar\(\)/.test(trozo) || !/_C\.poner\(_arg\)/.test(trozo) || !/_C\.estado\(\)/.test(trozo)) throw new Error('faltan quitar/poner/estado');
    if (!/Cierra y abre la app/.test(trozo)) throw new Error('no dice que cierre y abra la app');
  });
  await t('F2 · los enlaces del APK y del portal de autónomos siguen escritos a Railway (no son llamadas)', async () => {
    if (!/href="https:\/\/azkar-presupuestos-production\.up\.railway\.app\/api\/apk\/bajar"/.test(HTML)) throw new Error('el enlace del APK ya no apunta a Railway');
  });
  await t('F4 · v713 · el service worker trata el servidor de casa (…ts.net) como una API: solo red, nunca caché, y un fallo de red llega como tal', async () => {
    const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    if (!/url\.pathname\.indexOf\('\/api\/'\) === 0 \|\| url\.hostname\.endsWith\('\.ts\.net'\) \|\| url\.hostname\.endsWith\('\.trycloudflare\.com'\)/.test(SW)) throw new Error('/api/ de cualquier servidor no va como API en el service worker');
    if (!/return Response\.error\(\);/.test(SW)) throw new Error('el catch sigue devolviendo nada');
    // v715 · y en la rama de las API, un fallo del servidor de casa llega como fallo de red (no «200 {offline:true}»)
    if (!/const _esCasa = url\.hostname\.endsWith\('\.ts\.net'\) \|\| url\.hostname\.endsWith\('\.trycloudflare\.com'\);\s*e\.respondWith\(fetch\(e\.request\)\.catch\(\(\) => _esCasa \? Response\.error\(\) :/.test(SW)) throw new Error('el service worker sigue tapando los fallos del servidor de casa con un 200 de mentira');
  });
  await t('F3 · la versión ha subido a la v716 en los tres sitios', async () => {
    iguales(/var APP_VERSION = 'v716';/.test(HTML), true);
    iguales(/azkar-pwa-v716/.test(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8')), true);
    iguales(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).version, 'v716');
  });
  await t('F8 · v716 · con el ordenador de casa, si el túnel corta, se espera la respuesta en el buzón hasta seis minutos (y se dice por qué)', async () => {
    if (!/_esperarBuzon\(_turnoId, \(err && err\.name === 'AbortError'\) \? 20000 : \(_porCasa \? 360000 : 90000\)\)/.test(HTML)) throw new Error('no espera más con casa');
    if (!/Ha tardado más de lo que aguanta el túnel del ordenador de casa/.test(HTML)) throw new Error('sin el aviso de casa');
  });
  await t('F6 · v715 · si contesta algo que no es la versión, el aviso enseña lo que ha contestado', async () => {
    const n = navegador({ store: { azkar_servidor_casa: 'https://casa.ts.net' }, casa: 'raro' });
    await n.win.fetch(R + '/api/chatbot/message');
    const e = n.win._azkCasa.estado();
    iguales(e.activa, false);
    if (!/ha contestado 200 sin versión: «\{"hola":"otra cosa"\}»/.test(e.motivo)) throw new Error('motivo: ' + e.motivo);
  });
  await t('F5 · v714 · «/casa» vuelve a probar el ordenador en ese momento y luego cuenta cómo está', async () => {
    const i = HTML.indexOf("if (msg && /^\\/casa\\b/i.test(msg)) {");
    const trozo = HTML.slice(i, i + 3500);
    if (!/_C\.probar\(\)\.then\(function \(\) \{ _contarCasa\(_C\); \}/.test(trozo)) throw new Error('«/casa» no vuelve a probar');
  });

  await t('F7 · v715 · si un service worker viejo aún devuelve «{offline:true}», el aviso dice que es un fallo de red', async () => {
    const n = navegador({ store: { azkar_servidor_casa: 'https://casa.ts.net' }, casa: 'offline' });
    await n.win.fetch(R + '/api/chatbot/message');
    const e = n.win._azkCasa.estado();
    iguales(e.activa, false);
    if (!/no ha llegado al túnel/.test(e.motivo)) throw new Error('motivo: ' + e.motivo);
  });

  console.log('\n══ G · v714 · SI EL ORDENADOR NO CONTESTÓ, SE VUELVE A PROBAR (no toda la sesión en Railway) ══');
  await t('G1 · no contesta al abrir → Railway; un minuto después vuelve: el siguiente MENSAJE espera a la prueba y va a casa, con aviso', async () => {
    const o = { store: { azkar_servidor_casa: 'https://casa.ts.net' }, casa: 'no', reloj: { t: 1000000 } };
    const n = navegador(o);
    await n.win.fetch(R + '/api/chatbot/message');
    iguales(n.llamadas[n.llamadas.length - 1].url, R + '/api/chatbot/message');
    o.casa = 'ok'; o.reloj.t += 61000;
    await n.win.fetch(R + '/api/chatbot/message');
    iguales(n.llamadas[n.llamadas.length - 1].url, 'https://casa.ts.net/api/chatbot/message', 'el mensaje tenía que ir a casa: ' + n.llamadas.map(x => x.url).join(' | '));
    iguales(n.win._azkCasa.estado().activa, true);
    await new Promise(r => setTimeout(r, 1500));
    if (!n.avisos.some(a => /ya contesta: vuelvo a hablar con él/.test(a))) throw new Error('sin aviso de vuelta: ' + JSON.stringify(n.avisos));
  });
  await t('G2 · antes del minuto no se vuelve a probar (ni una llamada de más a casa)', async () => {
    const o = { store: { azkar_servidor_casa: 'https://casa.ts.net' }, casa: 'no', reloj: { t: 1000000 } };
    const n = navegador(o);
    await n.win.fetch(R + '/api/chatbot/message');
    o.reloj.t += 30000;
    await n.win.fetch(R + '/api/chatbot/message');
    iguales(n.llamadas.filter(x => x.url.indexOf('casa.ts.net') >= 0).length, 1, 'solo la prueba del principio');
  });
  await t('G3 · lo que no es un mensaje a Azkarin no espera a la prueba: va a Railway mientras se prueba', async () => {
    const o = { store: { azkar_servidor_casa: 'https://casa.ts.net' }, casa: 'no', reloj: { t: 1000000 } };
    const n = navegador(o);
    await n.win.fetch(R + '/api/avisos');
    o.casa = 'lenta'; o.reloj.t += 61000;
    const t0 = Date.now();
    await n.win.fetch(R + '/api/avisos');
    if (Date.now() - t0 > 1000) throw new Error('ha esperado a la prueba');
    iguales(n.llamadas[n.llamadas.length - 1].url, R + '/api/avisos');
    iguales(n.llamadas.filter(x => x.url.indexOf('casa.ts.net/api/version') >= 0).length, 2, 'la segunda prueba sí se ha lanzado');
  });
  await t('G4 · si sigue sin contestar, el aviso no se repite cada minuto', async () => {
    const o = { store: { azkar_servidor_casa: 'https://casa.ts.net' }, casa: 'no', reloj: { t: 1000000 } };
    const n = navegador(o);
    await n.win.fetch(R + '/api/chatbot/message');
    o.reloj.t += 61000; await n.win.fetch(R + '/api/chatbot/message');
    o.reloj.t += 61000; await n.win.fetch(R + '/api/chatbot/message');
    await new Promise(r => setTimeout(r, 1500));
    iguales(n.avisos.filter(a => /ordenador de casa/.test(a)).length, 1, JSON.stringify(n.avisos));
    iguales(n.llamadas.filter(x => x.url.indexOf('casa.ts.net/api/version') >= 0).length, 3, 'tres pruebas, una por minuto');
  });

  console.log('\n' + (mal ? '❌ ' + ok + ' bien, ' + mal + ' mal' : '✅ ' + ok + ' bien, 0 mal') + '\n');
  process.exit(mal ? 1 : 0);
})();
