/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
// PRUEBAS DEL BOTÓN DE ÓSCAR (app v380)
//
// Asier no entra en Railway: "yo nonentro ennreywey londe oscar ponme un boton
// el la app". Así que el interruptor vive en la cabecera del chat de Azkarin.
//
// Estas pruebas NO usan una copia del código: recortan el código DE VERDAD del
// index.html que se sube, lo meten en un navegador de mentira (jsdom) y lo
// aprietan como lo apretaría Asier — incluido cuando el servidor falla.
//
// Ejecutar:  node tests/boton-oscar.test.js
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let JSDOM;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  try { JSDOM = require('/tmp/node_modules/jsdom').JSDOM; }
  catch (e2) {
    console.log('⚠️  Falta jsdom (npm install jsdom). No puedo probar el botón.');
    process.exit(2);
  }
}

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let ok = 0, fallos = 0;
function prueba(nombre, fn) {
  try { fn(); console.log('  OK  ' + nombre); ok++; }
  catch (e) { console.log('  ❌  ' + nombre + '\n      → ' + (e && e.message)); fallos++; }
}
async function pruebaAsync(nombre, fn) {
  try { await fn(); console.log('  OK  ' + nombre); ok++; }
  catch (e) { console.log('  ❌  ' + nombre + '\n      → ' + (e && e.message)); fallos++; }
}
function igual(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' — esperaba ' + JSON.stringify(b) + ' y salió ' + JSON.stringify(a));
}
function contiene(txt, trozo, msg) {
  if (String(txt).indexOf(trozo) < 0) throw new Error((msg || 'no aparece') + ': "' + trozo + '"\n      en: ' + String(txt).slice(0, 400));
}
function noContiene(txt, trozo, msg) {
  if (String(txt).indexOf(trozo) >= 0) throw new Error((msg || 'aparece y NO debería') + ': "' + trozo + '"');
}

// ── Recortar del index.html de verdad ────────────────────────────────────────
function recortar(desde, hasta, que) {
  const a = HTML.indexOf(desde);
  if (a < 0) throw new Error('No encuentro el principio de ' + que + ': ' + desde);
  const b = HTML.indexOf(hasta, a);
  if (b < 0) throw new Error('No encuentro el final de ' + que + ': ' + hasta);
  return HTML.slice(a, b);
}

const CODIGO_OSCAR = recortar(
  '  // ── v380: INTERRUPTOR DE OSCAR',
  '  window.chatbotHistorial = async function() {',
  'el código del botón'
);
const HTML_VENTANA = recortar('<div id="chatbot-oscar">', '<div id="chatbot-historial">', 'la ventanita');
const HTML_BOTON = recortar('<button id="chatbot-oscar-btn"', '</button>', 'el botón') + '</button>';

// ── Montar el "navegador" ────────────────────────────────────────────────────
// Devuelve { win, doc, llamadas, responder, addMsgs }
function montar(respuestas) {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body>' +
    '<div id="chatbot-header">' + HTML_BOTON + '</div>' +
    HTML_VENTANA +
    '</body></html>',
    { runScripts: 'outside-only', url: 'https://asieresquinas-collab.github.io/azkar-app/' }
  );
  const win = dom.window;
  const llamadas = [];
  const addMsgs = [];

  // Lo que el código del botón espera encontrar ya puesto en la app
  win.RAILWAY_API = 'https://azkar-presupuestos-production.up.railway.app';
  win._authToken = 'TOKEN-DE-PRUEBA';
  win._apiKey = 'LLAVE-DE-PRUEBA';
  win.escHtml = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  win.addMsg = function (quien, texto) { addMsgs.push({ quien, texto }); };

  let turno = 0;
  win.fetch = function (url, opts) {
    llamadas.push({ url: String(url), opts: opts || {} });
    const r = typeof respuestas === 'function' ? respuestas(String(url), opts || {}, turno++) : respuestas[Math.min(turno++, respuestas.length - 1)];
    if (r && r.reventar) return Promise.reject(new Error(r.reventar));
    return Promise.resolve({
      ok: r.status ? r.status >= 200 && r.status < 300 : true,
      status: r.status || 200,
      json: async () => r.body
    });
  };

  // El código va dentro de un IIFE en la app; aquí lo envolvemos igual.
  vm.runInContext('(function(){\n' + CODIGO_OSCAR + '\n})();', win, { filename: 'boton-oscar-v380' });
  return { win, doc: win.document, llamadas, addMsgs };
}

const ENCENDIDO = {
  encendido: true, estado: 'encendido', boton: true, modulo_cargado: true,
  bloqueado_por_variable: false, forzado_por_variable: false,
  se_puede_cambiar_desde_la_app: true, motivo: 'Encendido desde el botón de la app.'
};
const APAGADO = Object.assign({}, ENCENDIDO, {
  encendido: false, estado: 'apagado', boton: false, motivo: 'Apagado desde el botón de la app.'
});
const BLOQUEADO = {
  encendido: false, estado: 'apagado', boton: true, modulo_cargado: true,
  bloqueado_por_variable: true, forzado_por_variable: true,
  se_puede_cambiar_desde_la_app: false,
  motivo: 'Apagado a la fuerza desde Railway (variable AZKARIN_OSCAR). El botón no puede encenderlo hasta que se quite esa variable.'
};

const esperar = () => new Promise(r => setTimeout(r, 0));
const cuerpo = d => d.getElementById('chatbot-oscar-cuerpo').innerHTML;
const claseBoton = d => d.getElementById('chatbot-oscar-btn').className;
const abierta = d => d.getElementById('chatbot-oscar').classList.contains('open');

(async function () {
  console.log('\n═══ 1. EL BOTÓN ESTÁ Y SE VE ═══');

  prueba('el botón existe en la cabecera del chat, al lado de los otros', () => {
    const i = HTML.indexOf('id="chatbot-oscar-btn"');
    if (i < 0) throw new Error('no está el botón en index.html');
    const j = HTML.indexOf('id="chatbot-speed-btn"');
    if (!(i < j && j - i < 400)) throw new Error('el botón no está pegado a los demás de la cabecera');
  });

  prueba('el botón llama a chatbotOscarAbrir y tiene su explicación al pasar por encima', () => {
    contiene(HTML_BOTON, 'onclick="chatbotOscarAbrir()"', 'no llama a la función');
    contiene(HTML_BOTON, 'cuentas', 'el título no explica qué es Óscar');
  });

  prueba('al abrir el chat se mira solo cómo está (para que salga del color bueno)', () => {
    contiene(HTML, 'window.chatbotOscarSync()', 'no se sincroniza al abrir el chat');
    const i = HTML.indexOf('window.chatbotToggle = function');
    const j = HTML.indexOf('window.chatbotOscarSync()', i);
    if (!(j > i && j - i < 900)) throw new Error('la sincronización no está dentro de chatbotToggle');
  });

  prueba('la ventanita se tapa sola (display:none) hasta que se abre', () => {
    contiene(HTML, '#chatbot-oscar{display:none', 'la ventana no empieza cerrada');
    contiene(HTML, '#chatbot-oscar.open{display:flex}', 'no hay forma de abrirla');
  });

  prueba('la ventanita se pone por encima del historial, no por debajo', () => {
    const zOsc = /#chatbot-oscar\{[^}]*z-index:(\d+)/.exec(HTML);
    const zHis = /#chatbot-historial\{[^}]*z-index:(\d+)/.exec(HTML);
    if (!zOsc || !zHis) throw new Error('no encuentro los z-index');
    if (!(Number(zOsc[1]) >= Number(zHis[1]))) throw new Error('la ventana de Óscar quedaría tapada');
  });

  console.log('\n═══ 2. ENCENDER Y APAGAR DE VERDAD ═══');

  await pruebaAsync('abrir la ventana pregunta al servidor y pinta ENCENDIDO', async () => {
    const { doc, win, llamadas } = montar([{ body: ENCENDIDO }]);
    await win.chatbotOscarAbrir(); await esperar();
    igual(abierta(doc), true, 'la ventana no se abrió');
    igual(llamadas.length, 1, 'llamadas al servidor');
    contiene(llamadas[0].url, '/api/chatbot/oscar', 'no pregunta al sitio correcto');
    contiene(cuerpo(doc), 'ENCENDIDO', 'no dice que está encendido');
    contiene(claseBoton(doc), 'on', 'el botón no se puso verde');
  });

  await pruebaAsync('la llamada lleva la llave y el pase de Asier (si no, el servidor la echa)', async () => {
    const { win, llamadas } = montar([{ body: ENCENDIDO }]);
    await win.chatbotOscarAbrir(); await esperar();
    const h = llamadas[0].opts.headers || {};
    igual(h['x-api-key'], 'LLAVE-DE-PRUEBA', 'falta la llave');
    igual(h['Authorization'], 'Bearer TOKEN-DE-PRUEBA', 'falta el pase');
  });

  await pruebaAsync('APAGAR: pulsa, el servidor lo apaga, y la app lo dice', async () => {
    const { doc, win, llamadas, addMsgs } = montar((url, opts) =>
      opts.method === 'POST' ? { body: APAGADO } : { body: ENCENDIDO });
    await win.chatbotOscarAbrir(); await esperar();
    contiene(cuerpo(doc), 'Apagar a Óscar', 'no ofrece apagarlo');
    await win.chatbotOscarCambiar(false); await esperar();
    const post = llamadas.filter(l => (l.opts.method || '') === 'POST');
    igual(post.length, 1, 'peticiones de cambio');
    igual(JSON.parse(post[0].opts.body).encendido, false, 'no pidió apagarlo');
    contiene(cuerpo(doc), 'APAGADO', 'no dice que quedó apagado');
    contiene(claseBoton(doc), 'off', 'el botón no se puso gris');
    igual(addMsgs.length, 1, 'avisos en el chat');
    contiene(addMsgs[0].texto, 'APAGADO', 'el aviso del chat no lo dice');
    contiene(addMsgs[0].texto, 'No se ha borrado nada', 'no tranquiliza sobre el borrado');
  });

  await pruebaAsync('ENCENDER: desde apagado, vuelve a encenderse', async () => {
    const { doc, win, llamadas, addMsgs } = montar((url, opts) =>
      opts.method === 'POST' ? { body: ENCENDIDO } : { body: APAGADO });
    await win.chatbotOscarAbrir(); await esperar();
    contiene(cuerpo(doc), 'Encender a Óscar', 'no ofrece encenderlo');
    await win.chatbotOscarCambiar(true); await esperar();
    igual(JSON.parse(llamadas.filter(l => l.opts.method === 'POST')[0].opts.body).encendido, true, 'no pidió encenderlo');
    contiene(cuerpo(doc), 'ENCENDIDO', 'no dice que quedó encendido');
    contiene(claseBoton(doc), 'on', 'el botón no se puso verde');
    contiene(addMsgs[0].texto, 'ENCENDIDO', 'el aviso del chat no lo dice');
  });

  await pruebaAsync('el botón manda true/false de verdad, no "true"/"1" ni cosas raras', async () => {
    const { win, llamadas } = montar((url, opts) => opts.method === 'POST' ? { body: APAGADO } : { body: ENCENDIDO });
    await win.chatbotOscarAbrir(); await esperar();
    await win.chatbotOscarCambiar(false); await esperar();
    const b = JSON.parse(llamadas.filter(l => l.opts.method === 'POST')[0].opts.body);
    if (typeof b.encendido !== 'boolean') throw new Error('encendido debería ser sí/no de verdad, y es ' + typeof b.encendido);
  });

  await pruebaAsync('encender y apagar 20 veces seguidas no descuadra nada', async () => {
    let estado = true;
    const { doc, win } = montar((url, opts) => {
      if (opts.method === 'POST') { estado = JSON.parse(opts.body).encendido; }
      return { body: estado ? ENCENDIDO : APAGADO };
    });
    await win.chatbotOscarAbrir(); await esperar();
    for (let i = 0; i < 20; i++) {
      await win.chatbotOscarCambiar(!estado); await esperar();
      const esperado = estado ? 'ENCENDIDO' : 'APAGADO';
      contiene(cuerpo(doc), esperado, 'en la vuelta ' + (i + 1) + ' se descuadró');
      contiene(claseBoton(doc), estado ? 'on' : 'off', 'en la vuelta ' + (i + 1) + ' el color no cuadra');
    }
  });

  console.log('\n═══ 3. CUANDO ALGO VA MAL: DECIRLO, NO MENTIR ═══');

  await pruebaAsync('si Railway lo tiene bloqueado, se ve POR QUÉ y no se deja pulsar', async () => {
    const { doc, win, llamadas } = montar([{ body: BLOQUEADO }]);
    await win.chatbotOscarAbrir(); await esperar();
    contiene(cuerpo(doc), 'No se puede cambiar desde aquí', 'no avisa de que está bloqueado');
    contiene(cuerpo(doc), 'AZKARIN_OSCAR', 'no dice el motivo de verdad');
    contiene(cuerpo(doc), 'disabled', 'el botón se puede pulsar y no debería');
    noContiene(cuerpo(doc), 'onclick="chatbotOscarCambiar', 'sigue habiendo botón de cambiar');
    igual(llamadas.length, 1, 'no debería haber mandado nada más');
  });

  await pruebaAsync('si el servidor contesta 409 (no se puede), lo dice y NO miente', async () => {
    const { doc, win, addMsgs } = montar((url, opts) => opts.method === 'POST'
      ? { status: 409, body: Object.assign({ error: BLOQUEADO.motivo }, BLOQUEADO) }
      : { body: ENCENDIDO });
    await win.chatbotOscarAbrir(); await esperar();
    await win.chatbotOscarCambiar(false); await esperar();
    contiene(cuerpo(doc), 'No se ha podido cambiar', 'no avisa del fallo');
    contiene(cuerpo(doc), 'AZKARIN_OSCAR', 'no dice el motivo');
    igual(addMsgs.length, 0, 'ha soltado un aviso en el chat como si lo hubiera hecho');
  });

  await pruebaAsync('si el servidor peta (500), se queda como estaba y lo cuenta', async () => {
    const { doc, win, addMsgs } = montar((url, opts) => opts.method === 'POST'
      ? { status: 500, body: { error: 'No pude cambiar el interruptor de Óscar: se cayó Firestore' } }
      : { body: ENCENDIDO });
    await win.chatbotOscarAbrir(); await esperar();
    await win.chatbotOscarCambiar(false); await esperar();
    contiene(cuerpo(doc), 'No se ha podido cambiar', 'no avisa del fallo');
    contiene(cuerpo(doc), 'Firestore', 'no dice qué contestó el servidor');
    contiene(cuerpo(doc), 'quedado como estaba', 'no dice que no se tocó nada');
    contiene(claseBoton(doc), 'on', 'el botón cambió de color sin haber cambiado nada');
    igual(addMsgs.length, 0, 'ha dicho en el chat que lo hizo y no lo hizo');
  });

  await pruebaAsync('si se cae el internet al abrir, lo dice y no se inventa el estado', async () => {
    const { doc, win } = montar([{ reventar: 'Failed to fetch' }]);
    await win.chatbotOscarAbrir(); await esperar();
    contiene(cuerpo(doc), 'No he podido conectar', 'no avisa');
    contiene(cuerpo(doc), 'No he tocado nada', 'no tranquiliza');
    noContiene(cuerpo(doc), 'Ahora mismo está', 'se ha inventado un estado');
  });

  await pruebaAsync('si se cae el internet al cambiar, se queda como estaba', async () => {
    const { doc, win, addMsgs } = montar((url, opts) => opts.method === 'POST'
      ? { reventar: 'NetworkError' } : { body: APAGADO });
    await win.chatbotOscarAbrir(); await esperar();
    await win.chatbotOscarCambiar(true); await esperar();
    contiene(cuerpo(doc), 'No he podido conectar', 'no avisa');
    contiene(cuerpo(doc), 'APAGADO', 'no se ha quedado como estaba');
    contiene(claseBoton(doc), 'off', 'el color cambió sin cambiar nada');
    igual(addMsgs.length, 0, 'dijo en el chat que lo hizo');
  });

  await pruebaAsync('si el servidor contesta cualquier cosa rara, no se lo traga', async () => {
    for (const raro of [null, {}, { encendido: 'si' }, { encendido: 1 }, 'texto suelto', []]) {
      const { doc, win } = montar([{ body: raro }]);
      await win.chatbotOscarAbrir(); await esperar();
      contiene(cuerpo(doc), 'No he podido saber cómo está', 'se tragó la respuesta rara: ' + JSON.stringify(raro));
    }
  });

  await pruebaAsync('mirar en silencio al abrir el chat nunca revienta la app', async () => {
    for (const r of [[{ reventar: 'sin red' }], [{ status: 500, body: { error: 'x' } }], [{ body: null }]]) {
      const { win, doc } = montar(r);
      await win.chatbotOscarSync(); await esperar();
      igual(abierta(doc), false, 'no debería abrir ninguna ventana');
      igual(claseBoton(doc), 'cargando', 'debería quedarse en gris de "no sé"');
    }
  });

  await pruebaAsync('doble toque seguido no manda dos cambios', async () => {
    let posts = 0;
    const { win } = montar((url, opts) => {
      if (opts.method === 'POST') posts++;
      return opts.method === 'POST' ? { body: APAGADO } : { body: ENCENDIDO };
    });
    await win.chatbotOscarAbrir(); await esperar();
    const a = win.chatbotOscarCambiar(false);
    const b = win.chatbotOscarCambiar(false);
    await a; await b; await esperar();
    igual(posts, 1, 'mandó el cambio dos veces');
  });

  console.log('\n═══ 4. QUE SE ENTIENDA SIN SABER DE ORDENADORES ═══');

  await pruebaAsync('explica qué es Óscar antes de dejar tocarlo', async () => {
    const { doc, win } = montar([{ body: ENCENDIDO }]);
    await win.chatbotOscarAbrir(); await esperar();
    contiene(cuerpo(doc), 'echa las cuentas de los presupuestos', 'no explica qué hace');
    contiene(cuerpo(doc), 'Azkarin sigue funcionando igual sin él', 'no dice qué pasa si se apaga');
  });

  await pruebaAsync('deja claro que apagar NO borra nada (norma de Asier)', async () => {
    const { doc, win } = montar([{ body: ENCENDIDO }]);
    await win.chatbotOscarAbrir(); await esperar();
    contiene(cuerpo(doc), 'no borra nada', 'no dice que no se borra nada');
    contiene(cuerpo(doc), 'enciendes otra vez', 'no dice que se puede volver atrás');
  });

  await pruebaAsync('avisa de que tarda unos 15 segundos (para que no piense que no va)', async () => {
    const { doc, win } = montar([{ body: ENCENDIDO }]);
    await win.chatbotOscarAbrir(); await esperar();
    contiene(cuerpo(doc), '15 segundos', 'no avisa del tiempo');
  });

  prueba('en la ventana no hay ni una palabra de informático', () => {
    const malas = ['endpoint', 'env var', 'Firestore', 'deploy', 'token', 'API', 'boolean', 'JSON'];
    const texto = HTML_VENTANA + CODIGO_OSCAR.split('_OSC_QUE_ES = ')[1].split('\n')[0];
    for (const m of malas) {
      if (texto.indexOf(m) >= 0) throw new Error('sale la palabra "' + m + '"');
    }
  });

  await pruebaAsync('lo que escribe el servidor se pinta como texto, no como código', async () => {
    const malo = Object.assign({}, BLOQUEADO, { motivo: '<img src=x onerror="window.HACKEADO=1">' });
    const { doc, win } = montar([{ body: malo }]);
    await win.chatbotOscarAbrir(); await esperar();
    igual(win.HACKEADO, undefined, 'se ha ejecutado código que venía del servidor');
    contiene(cuerpo(doc), '&lt;img', 'no se ha escapado el texto');
  });

  console.log('\n═══ 5. QUE NO ROMPA NADA DE LO QUE YA HABÍA ═══');

  prueba('siguen estando los botones de antes en la cabecera', () => {
    for (const b of ['chatbotHistorial()', 'chatbotCopiarConv()', 'chatbot-speed-btn', 'chatbot-tts-btn']) {
      contiene(HTML, b, 'ha desaparecido');
    }
  });

  prueba('el saludo automático al abrir el chat sigue ahí', () => {
    contiene(HTML, 'chatbotGreeted', 'se ha perdido el saludo');
    const i = HTML.indexOf('window.chatbotOscarSync()');
    const j = HTML.indexOf('chatbotGreeted = true', i);
    if (!(j > i)) throw new Error('el saludo ya no va después de mirar a Óscar');
  });

  prueba('no hay ids repetidos de los nuevos (a Asier le revientan los duplicados)', () => {
    for (const id of ['chatbot-oscar-btn', 'chatbot-oscar', 'chatbot-oscar-cuerpo', 'chatbot-oscar-panel']) {
      const n = HTML.split('id="' + id + '"').length - 1;
      if (n !== 1) throw new Error('id="' + id + '" aparece ' + n + ' veces');
    }
  });

  prueba('las funciones nuevas se declaran una sola vez', () => {
    for (const f of ['chatbotOscarAbrir', 'chatbotOscarCambiar', 'chatbotOscarSync', 'chatbotOscarCerrar']) {
      const re = new RegExp('window\\.' + f + '\\s*=(?!=)', 'g');
      const n = (HTML.match(re) || []).length;
      if (n !== 1) throw new Error('window.' + f + ' se declara ' + n + ' veces');
    }
  });

  prueba('todo el javascript de la página se lee sin errores', () => {
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    let m, i = 0;
    while ((m = re.exec(HTML))) {
      i++;
      try { new vm.Script(m[1], { filename: 'bloque' + i }); }
      catch (e) { throw new Error('bloque ' + i + ': ' + e.message); }
    }
    if (i < 5) throw new Error('solo he revisado ' + i + ' bloques, algo va mal');
  });

  await pruebaAsync('cerrar la ventana la cierra (y tocando fuera también)', async () => {
    const { doc, win } = montar([{ body: ENCENDIDO }]);
    await win.chatbotOscarAbrir(); await esperar();
    igual(abierta(doc), true, 'no se abrió');
    win.chatbotOscarCerrar();
    igual(abierta(doc), false, 'no se cerró');
    await win.chatbotOscarAbrir(); await esperar();
    const fuera = doc.getElementById('chatbot-oscar');
    fuera.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    igual(abierta(doc), false, 'tocando fuera no se cierra');
  });

  await pruebaAsync('tocando DENTRO de la ventana no se cierra sin querer', async () => {
    const { doc, win } = montar([{ body: ENCENDIDO }]);
    await win.chatbotOscarAbrir(); await esperar();
    doc.getElementById('chatbot-oscar-panel').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    igual(abierta(doc), true, 'se cerró al tocar dentro');
  });

  // ── 6. Que quepa de verdad en el móvil (esto necesita un navegador) ────────
  let chromium = null;
  try { chromium = require('playwright').chromium; }
  catch (e) { try { chromium = require('/tmp/node_modules/playwright').chromium; } catch (e2) {} }

  if (!chromium) {
    console.log('\n═══ 6. CÓMO SE VE EN EL MÓVIL ═══\n  (saltado: no hay navegador de pruebas instalado)');
  } else {
    console.log('\n═══ 6. CÓMO SE VE EN EL MÓVIL ═══');
    const CSS_PANEL = recortar('#chatbot-panel{display:none', '#chatbot-msgs{flex:1', 'el css del chat');
    const CSS_BTN = recortar('#chatbot-oscar-btn{font-size', '#chatbot-oscar{display:none', 'el css del botón');
    const CSS_MEDIA = recortar('@media(max-width:480px){', '</style>', 'el css de móvil');
    const CABECERA = recortar('<div id="chatbot-header">', '<div id="chatbot-msgs">', 'la cabecera');

    let nav = null, pag = null;
    try {
      nav = await chromium.launch({ executablePath: process.env.CHROME_PRUEBAS || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    } catch (e) {
      try { nav = await chromium.launch(); } catch (e2) { nav = null; }
    }
    if (!nav) {
      console.log('  (saltado: no arranca el navegador de pruebas)');
    } else {
      for (const ancho of [320, 360, 375, 390, 412, 430]) {
        await pruebaAsync('a ' + ancho + 'px caben los 6 botones en una sola fila', async () => {
          pag = await nav.newPage({ viewport: { width: ancho, height: 600 } });
          await pag.setContent('<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
            'body{margin:0;font-family:Barlow,Arial,sans-serif}' + CSS_PANEL + CSS_BTN + CSS_MEDIA +
            '#chatbot-panel{display:flex!important;position:static;width:100%;height:auto}' +
            '</style></head><body><div id="chatbot-panel">' + CABECERA + '</div></body></html>',
            { waitUntil: 'load' });
          const r = await pag.evaluate(() => {
            const h = document.getElementById('chatbot-header');
            const bs = Array.from(h.querySelectorAll('button'));
            const c = bs.map(x => { const q = x.getBoundingClientRect(); return q.top + q.height / 2; });
            return { n: bs.length, centros: c, alto: h.getBoundingClientRect().height,
                     desborda: h.scrollWidth > h.clientWidth + 1 };
          });
          await pag.close(); pag = null;
          igual(r.n, 6, 'botones en la cabecera');
          const salto = Math.max.apply(null, r.centros) - Math.min.apply(null, r.centros);
          if (salto > 12) throw new Error('los botones se parten en varias filas (se separan ' + Math.round(salto) + 'px)');
          if (r.desborda) throw new Error('la cabecera se sale de ancho');
          if (r.alto > 74) throw new Error('la cabecera ha crecido a ' + Math.round(r.alto) + 'px (antes 68)');
        });
      }
      await pruebaAsync('el nombre "Azkarin" se sigue leyendo aunque el móvil sea pequeño', async () => {
        pag = await nav.newPage({ viewport: { width: 320, height: 600 } });
        await pag.setContent('<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
          'body{margin:0;font-family:Barlow,Arial,sans-serif}' + CSS_PANEL + CSS_BTN + CSS_MEDIA +
          '#chatbot-panel{display:flex!important;position:static;width:100%;height:auto}' +
          '</style></head><body><div id="chatbot-panel">' + CABECERA + '</div></body></html>', { waitUntil: 'load' });
        const t = await pag.evaluate(() => {
          const e = document.querySelector('#chatbot-header .ch-title');
          return { ancho: e.getBoundingClientRect().width, cortado: e.scrollWidth > e.clientWidth + 1 };
        });
        await pag.close(); pag = null;
        if (t.cortado) throw new Error('se corta el nombre Azkarin');
        if (t.ancho < 50) throw new Error('el nombre se queda en ' + Math.round(t.ancho) + 'px, no se lee');
      });
      await nav.close();
    }
  }

  console.log('\n═══ 7. RESUMEN ═══');
  console.log('  ' + ok + ' pruebas OK, ' + fallos + ' fallos\n');
  process.exit(fallos ? 1 : 0);
})();
