'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  «CLIN, CLIN, CLIN — QUÍTAME ESO»  ·  app v576 · backend 2.7.610 (4-sep-2026)
//
//  Asier: «cada vez que se activa el micrófono, se desactiva, suena clin, clin, clin, clin.
//  Quítame eso, por favor. Y aparte, la primera vez que hablo con él me contesta, pero
//  luego ya no vuelve a contestar».
//
//  El pitido lo hace Android cada vez que se abre y se cierra el reconocedor de voz del
//  navegador, y no se puede silenciar desde la web. Así que ya no se usa: el micro se abre
//  UNA vez (eso no pita), la app escucha el sonido, corta cuando de verdad ha callado y
//  manda ese trozo al servidor para pasarlo a texto.
//
//  Este banco ejecuta el CÓDIGO REAL de index.html.
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };
function trozo(desde, hasta) { const i = H.indexOf(desde); const j = H.indexOf(hasta, i); return (i < 0 || j < 0) ? null : H.slice(i, j); }

const SRC = trozo('  var _MP_PAUSA_MS = 1400;', '  window._convEscuchar = function() {');
console.log('\n══ A · EL MOTOR ESTÁ Y SE PUEDE EJECUTAR ══');
c('A0 · el código del micro propio está donde toca', !!SRC);

// ── banco de pruebas: se monta el motor real con un navegador de mentira ─────
function monta({ hablando = () => false, respuesta = { texto: 'hola' }, falla = false } = {}) {
  const enviados = [];        // audios mandados a poner en texto
  const recibidos = [];       // textos que llegan a la conversación
  const cortes = [];          // veces que se le corta la voz a Azkarin
  const almacen = {};
  const win = { _azkarinConv: true };
  const partes = [];
  const fetchFalso = (url, opts) => {
    const cuerpo = JSON.parse(opts.body);
    if (/\/api\/voz\/parte$/.test(url)) { partes.push(cuerpo); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); }
    enviados.push({ url, cuerpo });
    if (falla) return Promise.reject(new Error('sin red'));
    return Promise.resolve({ ok: true, json: () => Promise.resolve(respuesta) });
  };
  const api = new Function(
    'window', 'navigator', 'localStorage', 'console', 'fetch', 'RAILWAY_API', 'btoa', 'AbortSignal', 'APP_VERSION', 'document', 'location',
    '_convHablando', '_convInterrumpir', '_bargeinActivo', '_esEcoDeAzkarin', '_esPalabraDeCorte',
    '_convRecibirHabla', '_convResetBackoff', '_convEstadoAuto', '_esAppNativa', 'alert', 'setTimeout', 'clearTimeout',
    'var _convSendTimer = null;\n' + SRC +
    '\nreturn { mp: _mp, procesa: _mpProcesa, wav: _mpWav, a16k: _mpA16k, b64: _mpB64, juntar: _mpAJuntar, cerrar: _mpCerrarTrozo, disponible: _mpDisponible, parar: _mpParar, fondo: _mpFondo, PAUSA: _MP_PAUSA_MS, MIN: _MP_MIN_HABLA_MS, PRE: _MP_PRE_MS, ESPERA: _MP_ESPERA_ENVIO };'
  )(
    win,
    { mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) } },
    { getItem: k => (k in almacen ? almacen[k] : null), setItem: (k, v) => { almacen[k] = String(v); } },
    { log() {}, warn() {} },
    fetchFalso, 'https://servidor', b => Buffer.from(b, 'binary').toString('base64'),
    { timeout: () => null }, 'v577', { getElementById: () => null }, { search: '' },
    hablando, () => cortes.push(1), () => true, () => false, () => false,
    t => recibidos.push(t), () => {}, () => {}, () => false, () => {},
    (fn, ms) => setTimeout(fn, ms), id => clearTimeout(id)
  );
  // el AudioContext no hace falta: se rellena a mano lo que dejaría abierto
  api.mp.on = true; api.mp.hz = 48000;
  return { api, enviados, recibidos, cortes, almacen, win, partes };
}

// bloque de 4096 muestras: silencio o voz (ruido fuerte)
function bloque(nivel) {
  const d = new Float32Array(4096);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * nivel;
  return { inputBuffer: { getChannelData: () => d } };
}
const MS_BLOQUE = 4096 / 48000 * 1000;   // ~85 ms
function mete(api, nivel, ms) { for (let t = 0; t < ms; t += MS_BLOQUE) api.procesa(bloque(nivel)); }

if (SRC) {
  console.log('\n══ B · EL WAV QUE SE MANDA ══');
  const m0 = monta();
  const w = m0.api.wav(Float32Array.from([0, 1, -1, 0.5]), 16000);
  const cab = String.fromCharCode(...w.slice(0, 4)) + String.fromCharCode(...w.slice(8, 12));
  c('B1 · es un WAV de verdad (RIFF/WAVE)', cab === 'RIFFWAVE', cab);
  const dv = new DataView(w.buffer);
  c('B2 · mono, 16 bits, 16.000 Hz', dv.getUint16(22, true) === 1 && dv.getUint16(34, true) === 16 && dv.getUint32(24, true) === 16000);
  c('B3 · la cuenta de bytes cuadra', w.length === 44 + 4 * 2 && dv.getUint32(40, true) === 8);
  c('B4 · el tope de la señal no se pasa de rosca', dv.getInt16(44 + 2, true) === 0x7FFF && dv.getInt16(44 + 4, true) === -0x8000);
  const bajado = m0.api.a16k(new Float32Array(48000), 48000);
  c('B5 · de 48.000 a 16.000: tres veces menos datos', bajado.length === 16000, String(bajado.length));
  c('B6 · si ya viene a 16.000 no se toca', m0.api.a16k(new Float32Array(160), 16000).length === 160);

  console.log('\n══ C · CUÁNDO CORTA (sin abrir ni cerrar el micro) ══');
  let m = monta();
  mete(m.api, 0.002, 800);          // sala en silencio
  c('C1 · con la sala en silencio no manda nada', m.enviados.length === 0);
  mete(m.api, 0.25, 1200);          // habla
  c('C2 · mientras habla, tampoco (todavía no ha terminado)', m.enviados.length === 0);
  mete(m.api, 0.002, 1800);         // se calla
  c('C3 · en cuanto calla de verdad, manda el trozo UNA vez', m.enviados.length === 1, String(m.enviados.length));
  if (m.enviados.length) {
    const cuerpo = m.enviados[0].cuerpo;
    c('C4 · va a la puerta del dictado, en WAV', /\/api\/voz\/dictado$/.test(m.enviados[0].url) && cuerpo.mime === 'audio/wav');
    const bytes = Buffer.from(cuerpo.audio, 'base64').length;
    const seg = (bytes - 44) / 2 / 16000;
    c('C5 · lleva la frase entera y algo de antes (no se come el arranque)', seg > 1.3 && seg < 4, seg.toFixed(2) + ' s');
    c('C5b · v584 · y va con los SEGUNDOS de voz que había (el servidor descarta lo imposible)', typeof cuerpo.segundos === 'number' && cuerpo.segundos > 0.8 && cuerpo.segundos < 2, String(cuerpo.segundos));
  }
  const mC6 = m;   // la respuesta del servidor llega después: se mira más abajo

  m = monta();
  mete(m.api, 0.002, 500); mete(m.api, 0.25, 300); mete(m.api, 0.002, 1900);
  c('C7 · una tos o un golpe (menos de medio segundo) no manda nada', m.enviados.length === 0);
  m = monta();
  mete(m.api, 0.002, 800); mete(m.api, 0.025, 2000); mete(m.api, 0.002, 1900);   // la tele de fondo, flojita
  c('C7b · v584 · un ruido flojo y largo (la tele de fondo) tampoco', m.enviados.length === 0, String(m.enviados.length));

  m = monta();
  mete(m.api, 0.002, 400); mete(m.api, 0.25, 900); mete(m.api, 0.002, 1100); mete(m.api, 0.25, 900); mete(m.api, 0.002, 1900);
  c('C8 · una pausa de más de un segundo a mitad de frase NO la parte en dos', m.enviados.length === 1, String(m.enviados.length));

  console.log('\n══ D · MIENTRAS HABLA AZKARIN ══');
  m = monta({ hablando: () => true });
  mete(m.api, 0.02, 1500);        // su propia voz, sonando
  mete(m.api, 0.6, 900);          // Asier hablando MUCHO mas fuerte
  c('D1 · si le hablas encima (mas fuerte que el), se calla', m.cortes.length >= 1, String(m.cortes.length));
  c('D2 · y lo que suena mientras habla NO se manda como pregunta', m.enviados.length === 0);
  m = monta({ hablando: () => true });
  mete(m.api, 0.002, 3000);
  c('D3 · su propia voz de fondo no le hace cortarse solo', m.cortes.length === 0);
  // v583 · el caso real del 4-sep: su voz por el altavoz entra al micro y NO debe cortarle
  m = monta({ hablando: () => true });
  mete(m.api, 0.25, 4000);        // su propia voz, alta y sostenida
  c('D4 · su voz por el altavoz, alta y seguida, tampoco le corta', m.cortes.length === 0, String(m.cortes.length));
  c('D5 · y no manda NADA de lo que suena mientras habla', m.enviados.length === 0);

  // el eco que llega justo despues de callarse
  let hablandoAhora = true;
  m = monta({ hablando: () => hablandoAhora, respuesta: { texto: 'amigo' } });
  mete(m.api, 0.25, 1200);
  hablandoAhora = false;
  mete(m.api, 0.25, 900); mete(m.api, 0.002, 1900);
  const mEco = m;

  console.log('\n══ E · CUANDO ALGO FALLA, NO SE QUEDA SORDO ══');
  m = monta({ falla: true });
  mete(m.api, 0.002, 400); mete(m.api, 0.25, 900); mete(m.api, 0.002, 1900);
  const mFalla = m;
  setTimeout(() => {
    c('E1 · si el dictado falla, se reintenta con el MISMO audio', mFalla.enviados.length >= 2, String(mFalla.enviados.length));
    c('E1b · y NUNCA se vuelve al micro que pita', mFalla.almacen['azkar_voz_motor'] === undefined, JSON.stringify(mFalla.almacen));
    c('E1c · el fallo se cuenta al servidor para poder arreglarlo', mFalla.partes.some(p => p.evento === 'dictado_falla'), JSON.stringify(mFalla.partes.map(p => p.evento)));
    m = monta({ respuesta: { texto: '' } });
    mete(m.api, 0.002, 400); mete(m.api, 0.25, 900); mete(m.api, 0.002, 1900);
    setTimeout(() => {
      c('E2 · si no se entendió nada, no se manda ningún mensaje', m.recibidos.length === 0);
      c('C6 · el texto que devuelve el servidor entra en la conversación', mC6.recibidos.length === 1 && mC6.recibidos[0] === 'hola', JSON.stringify(mC6.recibidos));
      c('D6 · una palabra suelta justo tras callarse NO se manda (era su eco)', mEco.recibidos.length === 0, JSON.stringify(mEco.recibidos));
      fin();
    }, 60);
  }, 2600);
} else { fin(); }

function fin() {
  console.log('\n══ F · QUE NO VUELVA EL PITIDO ══');
  c('F1 · el modo conversación usa el micro propio antes que nada', /if \(_mpDisponible\(\)\) \{\s*\n\s*if \(!_mp\.on && !_mp\.arrancando\) _mpArrancar\(\);/.test(H));
  c('F1b · «?app=1» ya NO manda al micro que pita', !/_esAppNativa\(\) && _mpDisponible\(\)/.test(H));
  c('F1c · también dentro de la APK se usa el micro propio', !/Plugins\.SpeechRecognition\) return false;/.test(H) && /_mp && _mp\.imposible\) return false;/.test(H));
  c('F1d · si el móvil no deja abrir el micro, NO se corta la conversación', /_mp\.imposible = true;[\s\S]{0,400}if \(!_hayNativo && !_hayWeb\)/.test(H));
  c('F2 · el micro se pide en el mismo toque de encender (permiso limpio)', /_mpDisponible\(\)\) _mpArrancar\(\);.*permiso lo pide as/.test(H));
  c('F3 · el vigilante lo mantiene abierto toda la conversación', /!_mp\.on && !_mp\.arrancando\) _mpArrancar\(\);\s*\n\s*var _hablando/.test(H));
  c('F3b · el botón del micro 🎤 tampoco pita ya', /_mpDisponible\(\)\) \{ _micPropioBoton\(\); return; \}/.test(H) && /function _micPropioBoton/.test(H));
  c('F3c · y manda el audio a la misma puerta del dictado', /_micPropioParar[\s\S]{0,2200}\/api\/voz\/dictado/.test(H));
  c('F3d · «/micro» dice qué micro está usando', /\/\^\\\/micro\\b\/i\.test\(msg\)/.test(H) || /\/micro\\b/.test(H));
  c('F4 · al apagar la conversación se suelta el micro', /try \{ _mpParar\(\); \} catch \(e\) \{\}/.test(H));
  c('F5 · el medidor viejo ya no abre un segundo micro', /if \(typeof _mp !== 'undefined' && _mp\.on\) return;   \/\/ v576/.test(H));
  c('F6 · con micro propio la espera para mandar es corta', /_mp\.on\) \? _MP_ESPERA_ENVIO : _CONV_PAUSA_MS/.test(H));
  c('F7 · el reconocedor del navegador sigue ahí, pero solo de respaldo', /_mpAlNavegador/.test(H) && /webkitSpeechRecognition/.test(H));

  console.log('\n══ H · DENTRO DE LA APK: UN PITIDO POR TURNO, NO VEINTE ══');
  c('H1 · se usa la escucha CONTINUA del plugin (partialResults)', /partialResults: true, popup: false/.test(H) && /function _micNativoContinuo/.test(H));
  c('H2 · lo que va oyendo se pinta y rearma la pausa', /_srN\.ultimo = m;[\s\S]{0,200}_convVerParcial\(m\)/.test(H));
  c('H3 · en silencio se espera hasta 7 s (cada apertura es un pitido)', /_convBackoffMs \|\| 0\) \+ 1500, 7000/.test(H));
  c('H4 · cuando habla Azkarin, la sesión del plugin se cierra', /SR && typeof SR\.stop === 'function'\) SR\.stop\(\);/.test(H));
  c('H5 · una sesión colgada no deja sordo a Azkarin (se corta a los 30 s)', /_srN\.escuchando && window\._convUltimaVozTs[\s\S]{0,120}> 30000/.test(H));
  c('H6 · si la escucha continua falla tres veces, se vuelve a la de antes', /_srSigueValiendo\(\)/.test(H) && /_srN\.fallos < 3/.test(H));
  c('H7 · el parte dice qué sabe hacer cada plugin de la APK', /out\.api_sr = _apiDePlugin\('SpeechRecognition'\)/.test(H) && /out\.api_ww = _apiDePlugin\('WakeWord'\)/.test(H));

  console.log('\n══ G · SABOTAJES ══');
  const sab = (t, de, a) => String(t || '').replace(de, a);
  c('G1 · si alguien quita el pre-buffer, C5 canta', !/_mp\.buf = _mp\.pre\.slice\(\)/.test(sab(SRC, '_mp.buf = _mp.pre.slice();', '_mp.buf = [];')));
  c('G2 · si alguien baja el mínimo de habla, C7 canta', !/_MP_MIN_HABLA_MS = 450/.test(sab(SRC, '_MP_MIN_HABLA_MS = 450', '_MP_MIN_HABLA_MS = 10')));
  c('G3 · si alguien manda el audio sin cancelación de eco, se ve', !/echoCancellation: true/.test(sab(SRC, 'echoCancellation: true', 'echoCancellation: false')));

  console.log('\n──────────────────────────────');
  console.log(bien + ' bien · ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
}
