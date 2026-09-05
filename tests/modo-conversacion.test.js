'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  «EL MODO CONVERSACIÓN ES UN ROLLO»  ·  app v575  (3-sep-2026)
//
//  Asier: «el modo conversación al final es un rollo, no funciona bien. Se pone en verde,
//  en rojo, todo el rato; igual le quiero hablar y se pone en verde y no me deja hablarle,
//  le tengo que repetir las cosas. No es nada cómodo».
//
//  Lo que pasaba de verdad: el micro se cerraba en el primer silencio y hasta 1,5 s después
//  no se volvía a abrir. En ese hueco el botón estaba VERDE (encendido pero sordo) y lo que
//  dijera se perdía. Además, mientras Azkarin hablaba o pensaba, el micro estaba cerrado.
//
//  Este banco ejecuta el CÓDIGO REAL de index.html (no una copia).
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };
function trozo(desde, hasta) { const i = H.indexOf(desde); const j = H.indexOf(hasta, i); return (i < 0 || j < 0) ? null : H.slice(i, j); }

// ── reloj de mentira: los temporizadores corren cuando yo digo ────────────────
function reloj() {
  let t = 0, id = 1; const tareas = new Map();
  return {
    setTimeout(fn, ms) { const i = id++; tareas.set(i, { fn, at: t + (ms || 0) }); return i; },
    clearTimeout(i) { tareas.delete(i); },
    avanza(ms) {
      const fin = t + ms; let guarda = 0;
      for (;;) {
        let mejor = null, mi = null;
        for (const [i, x] of tareas) if (x.at <= fin && (mejor === null || x.at < mejor.at)) { mejor = x; mi = i; }
        if (!mejor || guarda++ > 2000) break;
        t = mejor.at; tareas.delete(mi); mejor.fn();
      }
      t = fin;
    },
    ahora() { return t; }
  };
}

// ══ A · LO QUE SE DICE Y CUÁNDO SE MANDA ═════════════════════════════════════
console.log('\n══ A · LO QUE DICE ASIER: NI SE CORTA NI SE PIERDE ══');
const SRC_BUF = trozo("  var _convBuffer = '';", '  // ── v358 INTERRUMPIR');
c('A0 · el código del acumulador está donde toca', !!SRC_BUF);

function montaBuffer({ hablando = () => false, pensando = () => false } = {}) {
  const r = reloj();
  const enviados = [];
  const inputEl = { value: '' };
  const sendBtn = { get disabled() { return pensando(); } };
  const win = { _azkarinConv: true };
  const FakeDate = { now: () => 1000000 + r.ahora() };
  const api = new Function(
    'window', 'inputEl', 'sendBtn', 'setTimeout', 'clearTimeout', 'Date', '_convHablando', 'chatbotSend',
    SRC_BUF + '\nwindow.chatbotSend = chatbotSend;\nreturn { recibir: _convRecibirHabla, parcial: _convVerParcial, limpiar: _convLimpiarBuffer, pausa: _CONV_PAUSA_MS, buffer: function(){ return _convBuffer; } };'
  )(win, inputEl, sendBtn, r.setTimeout.bind(r), r.clearTimeout.bind(r), FakeDate, hablando,
    function () { enviados.push(inputEl.value); inputEl.value = ''; });
  return { r, api, inputEl, enviados, win };
}

if (SRC_BUF) {
  // A1 · una frase entera: se manda UNA vez, con todo
  let m = montaBuffer();
  m.api.recibir('quiero saber el presupuesto del seis seis dos seis');
  m.r.avanza(1000);
  c('A1 · no manda a mitad de la frase', m.enviados.length === 0);
  m.r.avanza(2000);
  c('A2 · manda cuando de verdad ha callado', m.enviados.length === 1 && /seis seis dos seis/.test(m.enviados[0]), JSON.stringify(m.enviados));

  // A3 · habla despacio: dos trozos con una pausa por medio → UN solo mensaje
  m = montaBuffer();
  m.api.recibir('mira, el cliente de Getxo');
  m.r.avanza(1500);
  m.api.recibir('me ha llamado otra vez');
  m.r.avanza(1500);
  c('A3 · una pausa por medio no le corta la frase', m.enviados.length === 0);
  m.r.avanza(1500);
  c('A4 · y al final llega entero, en un solo mensaje', m.enviados.length === 1 && /Getxo me ha llamado otra vez/.test(m.enviados[0]), JSON.stringify(m.enviados));

  // A5 · lo que va oyendo a medias REARMA el reloj (no manda mientras sigue hablando)
  m = montaBuffer();
  m.api.recibir('apúntame');
  for (let i = 0; i < 8; i++) { m.r.avanza(800); m.api.parcial('que el jueves'); }
  c('A5 · mientras sigue hablando no manda nada', m.enviados.length === 0);
  c('A6 · pero se ve en pantalla lo que lleva dicho', /apúntame que el jueves/.test(m.inputEl.value), m.inputEl.value);
  m.r.avanza(3000);
  c('A7 · lo de "a medias" NO se manda, solo lo confirmado', m.enviados.length === 1 && m.enviados[0] === 'apúntame', JSON.stringify(m.enviados));

  // A8 · si justo está pensando la respuesta anterior, se GUARDA (no se pierde)
  let pensando = true;
  m = montaBuffer({ pensando: () => pensando });
  m.api.recibir('y ponme también el guardamuebles');
  m.r.avanza(4000);
  c('A8 · mientras piensa, no lo manda encima', m.enviados.length === 0);
  c('A9 · y NO lo tira: sigue guardado', /guardamuebles/.test(m.inputEl.value) || m.api.buffer().indexOf('guardamuebles') >= 0);
  pensando = false;
  m.r.avanza(1200);
  c('A10 · en cuanto contesta, sale solo', m.enviados.length === 1 && /guardamuebles/.test(m.enviados[0]), JSON.stringify(m.enviados));

  // A11 · si Azkarin está hablando, espera a que se calle
  let habla = true;
  m = montaBuffer({ hablando: () => habla });
  m.api.recibir('para, para');
  m.r.avanza(4000);
  c('A11 · no manda mientras Azkarin habla', m.enviados.length === 0);
  habla = false; m.r.avanza(1000);
  c('A12 · y sale cuando se calla', m.enviados.length === 1);

  c('A13 · la espera es de 2,4 s, no los 4 s de antes', m.api.pausa <= 2500 && m.api.pausa >= 1500, String(m.api.pausa));
}

// ══ B · EL SEMÁFORO: NI PARPADEA NI MIENTE ═══════════════════════════════════
console.log('\n══ B · EL SEMÁFORO EN CRISTIANO ══');
const SRC_EST = trozo("  var _convEstado = 'off';", '  window._convCerrarMic = function');
c('B0 · el código del semáforo está donde toca', !!SRC_EST);

function montaEstado({ hablando = () => false, pensando = () => false, buffer = () => '' } = {}) {
  const clases = new Set();
  const botón = {
    classList: { toggle(k, v) { if (v) clases.add(k); else clases.delete(k); }, has: k => clases.has(k) },
    title: ''
  };
  const cartelClases = new Set();
  const cartel = { textContent: '', classList: { toggle(k, v) { if (v) cartelClases.add(k); else cartelClases.delete(k); } } };
  const doc = { getElementById: id => (id === 'chatbot-conv' ? botón : (id === 'chatbot-estado' ? cartel : null)) };
  const win = { _azkarinConv: true };
  const sendBtn = { get disabled() { return pensando(); } };
  const api = new Function('window', 'document', 'sendBtn', '_convHablando', '_devuelveBuffer',
    'var _convBuffer;' + SRC_EST.replace(/_convBuffer \|\| ''/g, "_devuelveBuffer() || ''") +
    '\nreturn { auto: _convEstadoAuto, pinta: _convPintarEstado };'
  )(win, doc, sendBtn, hablando, buffer);
  return { api, botón, cartel, clases, cartelClases, win };
}

if (SRC_EST) {
  // B1 · su turno
  let e = montaEstado();
  e.api.auto();
  c('B1 · cuando le toca hablar a Asier: ROJO y "te escucho"', e.clases.has('escuchando') && /Te escucho/.test(e.cartel.textContent), e.cartel.textContent);
  const antes = [...e.clases].sort().join(',');
  e.api.auto(); e.api.auto();
  c('B2 · repintar no cambia nada: NO parpadea', [...e.clases].sort().join(',') === antes, antes);

  // B3 · pensando
  e = montaEstado({ pensando: () => true });
  e.api.auto();
  c('B3 · mientras piensa lo dice, y no se hace el sordo', e.clases.has('pensando') && !e.clases.has('escuchando') && /Pensando/.test(e.cartel.textContent), e.cartel.textContent);

  // B4 · pensando pero Asier ha empezado a hablar → sigue siendo su turno
  e = montaEstado({ pensando: () => true, buffer: () => 'oye una cosa' });
  e.api.auto();
  c('B4 · si habla mientras piensa, el semáforo dice que le escucha', e.clases.has('escuchando'), [...e.clases].join(','));

  // B5 · hablando Azkarin
  e = montaEstado({ hablando: () => true });
  e.api.auto();
  c('B5 · mientras habla: naranja y dice cómo cortarle', e.clases.has('hablando') && /cortarme/.test(e.cartel.textContent), e.cartel.textContent);
  c('B6 · y NO dice que esté escuchando (eso era la mentira de antes)', !e.clases.has('escuchando'));

  // B7 · apagado
  e = montaEstado(); e.win._azkarinConv = false; e.api.auto();
  c('B7 · apagado: sin cartel y sin colores', e.cartel.textContent === '' && !e.clases.has('activo') && !e.clases.has('escuchando'));
}

// ══ C · EL MICRO NO SE CIERRA EN SU CARA ═════════════════════════════════════
console.log('\n══ C · EL MICRO, ABIERTO MIENTRAS LE TOCA A ÉL ══');
const WEB = trozo('    // ── v575 · EL MICRO SE QUEDA ABIERTO', '  // ── v575 · CORTARLE HABLANDO');
c('C0 · la ruta del navegador está donde toca', !!WEB);
const okC1 = /rec\.interimResults = true; rec\.continuous = true;/.test(WEB || '');
c('C1 · escucha CONTINUA y con lo que va oyendo a medias', okC1);
const okC2 = /rec\.onend = function\(\) \{[\s\S]{0,700}\}, _espera\);/.test(WEB || '') && /_fugaz \? Math\.min\(200 \* _convReintentosVacios, 2000\) : 120/.test(WEB || '');
c('C2 · si el navegador cierra la sesión, se reabre al instante (120 ms)', okC2);
c('C2b · y si se cierra nada más abrirse, no se machaca: espera cada vez más', /_convReintentosVacios = _fugaz \? Math\.min\(_convReintentosVacios \+ 1, 10\)/.test(WEB || ''));
c('C3 · el resultado final ya no cierra el micro a propósito', !/rec\.stop\(\);/.test(WEB || ''));
c('C4 · ya no se apaga contando sesiones de micro (_convSilencios >= 10)', !/_convSilencios >= 10/.test(H));
c('C5 · se apaga sola tras 3 minutos SIN OÍR NADA', /_convUltimaVozTs\) > 180000/.test(H));
c('C6 · mientras piensa la respuesta, en el navegador SIGUE escuchando', /sendBtn\.disabled && _esAppNativa\(\)\) return;/.test(H));
c('C7 · en cuanto se calla, el micro vuelve en 150 ms (antes 450)', /window\._convEscuchar\(\); \}, 150\); \/\/ v575: era 450/.test(H));
c('C8 · al empezar a hablar, el micro se cierra (no se oye a sí mismo)', /_ttsSpeaking = true;[\s\S]{0,400}window\._convCerrarMic\(\)/.test(H));
c('C9 · el aviso de "te escucho" y el de "hablando" no pueden estar a la vez', /b\.classList\.toggle\('escuchando', e === 'escucha'\)/.test(H) && /b\.classList\.toggle\('hablando', e === 'habla'\)/.test(H));

// ══ D · CORTARLE HABLÁNDOLE ENCIMA ═══════════════════════════════════════════
console.log('\n══ D · CORTARLE SIN TOCAR NADA ══');
const BARGE = trozo('  // ── v575 · CORTARLE HABLANDO, TAMBIEN EN EL NAVEGADOR', '  // v311: Wake Lock');
c('D0 · el medidor de voz está donde toca', !!BARGE);
c('D1 · pide el micro con cancelación de eco', /echoCancellation: true/.test(BARGE || ''));
c('D2 · el fondo se mide sobre la marcha (su propia voz no le corta)', /ord\[Math\.floor\(ord\.length \/ 2\)\]/.test(BARGE || ''));
c('D3 · hace falta voz sostenida (~400 ms), no un golpe', /_bargeSeguidos >= 4/.test(BARGE || ''));
c('D4 · al callarse, el medidor se cierra (no deja el micro abierto)', /window\._convBargeParar = function/.test(BARGE || '') && /_bargeStream\.getTracks\(\)\.forEach/.test(BARGE || ''));
c('D5 · se puede apagar sin tocar código (azkar_bargein)', /_bargeinActivo\(\)/.test(BARGE || ''));
c('D6 · tocar la pantalla sigue cortándole', /_msgsEl\.addEventListener\('click', _convInterrumpir\)/.test(H));
c('D7 · y el botón «Parar de hablar» sigue ahí', /id="chatbot-parar"[\s\S]{0,120}_convInterrumpir/.test(H));

// ══ E · SABOTAJES: que las comprobaciones sean de verdad ═════════════════════
console.log('\n══ E · SABOTAJES (si alguien lo estropea, esto se pone rojo) ══');
function sabotea(txt, de, a) { return String(txt || '').replace(de, a); }
c('E1 · si vuelven a poner el micro de a ratos, C1 canta',
  !/rec\.interimResults = true; rec\.continuous = true;/.test(sabotea(WEB, 'rec.interimResults = true; rec.continuous = true;', 'rec.interimResults = false; rec.continuous = false;')));
c('E2 · si quitan el reenganche instantáneo, C2 canta',
  !/_fugaz \? Math\.min\(200 \* _convReintentosVacios, 2000\) : 120/.test(sabotea(WEB, ': 120;', ': 1500;')));
c('E3 · si quitan la cancelación de eco, D1 canta',
  !/echoCancellation: true/.test(sabotea(BARGE, 'echoCancellation: true', 'echoCancellation: false')));
if (SRC_BUF) {
  // v601: la espera de «está pensando» vive ahora en _porQue ('pensando'); el sabotaje la quita de ahí
  const roto = SRC_BUF.replace("((sendBtn && sendBtn.disabled) ? 'pensando' : '')", "''");
  const r = reloj(); const enviados = []; const inputEl = { value: '' };
  const api = new Function('window', 'inputEl', 'sendBtn', 'setTimeout', 'clearTimeout', 'Date', '_convHablando', 'chatbotSend',
    roto + '\nwindow.chatbotSend = chatbotSend;\nreturn { recibir: _convRecibirHabla };')(
    { _azkarinConv: true }, inputEl, { disabled: true }, r.setTimeout.bind(r), r.clearTimeout.bind(r), { now: () => r.ahora() },
    () => false, function () { enviados.push(inputEl.value); });
  api.recibir('y ponme el guardamuebles');
  r.avanza(4000);
  c('E4 · sin la espera de "está pensando", el mensaje saldría encima (A8 sería falso)', enviados.length === 1);
}

console.log('\n──────────────────────────────');
console.log(bien + ' bien · ' + mal + ' mal');
process.exit(mal ? 1 : 0);
