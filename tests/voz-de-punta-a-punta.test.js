'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  LA VOZ, DE PUNTA A PUNTA  ·  app v607  (5-sep-2026)
//
//  Asier: «invierte tiempo en arreglarme esto… asegúrate de que funciona».
//  Los bancos de antes probaban las piezas por separado y aun así fallaba, porque
//  el fallo estaba en la JUNTA de dos piezas buenas. Este banco pega el camino
//  entero: micro de la app → trozo de audio → lo que RECIBE el servidor (código
//  real de api/dictado.js) → texto → filtro de «solo si me llamas» → envío.
//
//  El trozo del servidor se coge del repo del backend si está al lado
//  (../azkar-backend-temp); si no está, esa parte se salta y se dice.
// ══════════════════════════════════════════════════════════════════════════════
const path = require('path'), fs = require('fs');
const RAIZ = path.join(__dirname, '..');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };

const H = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
function trozo(desde, hasta) { const i = H.indexOf(desde); const j = H.indexOf(hasta, i); return (i < 0 || j < 0) ? null : H.slice(i, j); }
const SRC = trozo('  var _MP_PAUSA_MS = 1400;', '  window._convEscuchar = function() {');

// ── el micro de verdad, con un navegador de mentira ──────────────────────────
function montaMicro({ hablando = () => false, respuesta = { texto: 'hola' } } = {}) {
  const enviados = [], recibidos = [], partes = [], almacen = {};
  const win = { _azkarinConv: true };
  const fetchFalso = (url, opts) => {
    const cuerpo = JSON.parse(opts.body);
    if (/\/api\/voz\/parte$/.test(url)) { partes.push(cuerpo); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); }
    enviados.push({ url, cuerpo });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(respuesta) });
  };
  const api = new Function(
    'window', 'navigator', 'localStorage', 'console', 'fetch', 'RAILWAY_API', 'btoa', 'AbortSignal', 'APP_VERSION', 'document', 'location',
    '_convHablando', '_convInterrumpir', '_bargeinActivo', '_esEcoDeAzkarin', '_esPalabraDeCorte',
    '_convRecibirHabla', '_convResetBackoff', '_convEstadoAuto', '_esAppNativa', 'alert', 'setTimeout', 'clearTimeout',
    'var _convSendTimer = null;\nfunction _normEco(x){return String(x||"").toLowerCase().replace(/[^a-záéíóúñü0-9 ]+/g," ").replace(/\\s+/g," ").trim();}\n' + SRC +
    '\nreturn { mp: _mp, procesa: _mpProcesa, cerrar: _mpCerrarTrozo };'
  )(
    win,
    { mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) } },
    { getItem: k => (k in almacen ? almacen[k] : null), setItem: (k, v) => { almacen[k] = String(v); } },
    { log() {}, warn() {} },
    fetchFalso, 'https://servidor', b => Buffer.from(b, 'binary').toString('base64'),
    { timeout: () => null }, 'v607', { getElementById: () => null }, { search: '' },
    hablando, () => {}, () => true, () => false, () => false,
    t => recibidos.push(t), () => {}, () => {}, () => false, () => {},
    (fn, ms) => setTimeout(fn, ms), id => clearTimeout(id)
  );
  api.mp.on = true; api.mp.hz = 48000;
  return { api, enviados, recibidos, partes, win };
}
function bloque(nivel) {
  const d = new Float32Array(4096);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * nivel;
  return { inputBuffer: { getChannelData: () => d } };
}
const MS_BLOQUE = 4096 / 48000 * 1000;
function habla(api, nivel, ms) { for (let t = 0; t < ms; t += MS_BLOQUE) api.procesa(bloque(nivel)); }

console.log('\n══ A · HABLA → SALE UN AUDIO CON SU DURACIÓN ══');
if (!SRC) { c('A0 · el código del micro está donde toca', false); }
else {
  const m = montaMicro();
  habla(m.api, 0.001, 500);       // silencio de antes
  habla(m.api, 0.15, 4000);       // cuatro segundos hablando
  habla(m.api, 0.001, 1600);      // se calla: se cierra el trozo
  const audios = m.enviados.filter(e => /dictado/.test(e.url));
  c('A1 · cuatro segundos de voz salen como UN audio (no partido)', audios.length === 1, String(audios.length));
  if (audios.length) {
    const b64 = audios[0].cuerpo.audio;
    const segAudio = (b64.length * 0.75 - 44) / 32000;
    // 4 s hablando + 0,7 s de pre-buffer + 0,4 s de cola = unos 5,1 s (v608 recorta el resto del silencio)
    c('A2 · el audio dura lo hablado más el pre-buffer, SIN el silencio del final', segAudio > 4.3 && segAudio < 5.6, segAudio.toFixed(1) + ' s');
    c('A3 · y se le dicen al servidor los segundos de voz', audios[0].cuerpo.segundos > 2, String(audios[0].cuerpo.segundos));

    // ── LA JUNTA: lo que hace el servidor con ESE audio ──────────────────────
    const dic = path.join(RAIZ, '..', 'azkar-backend-temp', 'api', 'dictado.js');
    if (!fs.existsSync(dic)) {
      console.log('  ⏭️  (el repo del backend no está al lado: la parte del servidor se salta)');
    } else {
      const D = require(dic);
      const FRASE = 'necesito que me digas todas las llamadas que ha habido este mes';   // el caso real de las 10:58
      // el servidor coge como techo la duración REAL del audio (2.7.631)
      const seg = Math.max(Number(audios[0].cuerpo.segundos) || 0, segAudio);
      const salida = D.decidir(JSON.stringify({ hay_voz: true, texto: FRASE, confianza: 0.9 }), seg);
      c('B1 · la frase larga de verdad NO la tira el candado de letras por segundo', salida.texto === FRASE, salida.motivo || salida.texto);
      // y con el cálculo viejo (solo los segundos de voz que contaba la app) se caía
      const viejo = D.decidir(JSON.stringify({ hay_voz: true, texto: FRASE, confianza: 0.9 }), 1.2);
      c('B2 · y con la cuenta vieja se caía (por eso hacía falta el arreglo)', viejo.texto === '' && /imposible/.test(viejo.motivo || ''), viejo.motivo || 'pasó');
      c('B3 · el nombre torcido se endereza en el servidor', D.limpiar('az carin ponme las llamadas') === 'Azkarin ponme las llamadas');
    }
  }
}

console.log('\n══ C · EL FILTRO DE «SOLO SI ME LLAMAS» (el caso «no me contesta») ══');
{
  const F = trozo('  var _MS_SIGUE_EL_HILO = 15000;', '  window._convModoNormal = function');
  c('C0 · el filtro está donde toca', !!F);
  if (F) {
    const win = {};
    const f = new Function('window', F + '\nreturn _leHablaAEl;')(win);
    win._convPorPalabraClave = true;
    c('C1 · abierto por la palabra clave: lo que no lleva su nombre se descarta', f('cuántas llamadas ha habido este mes').vale === false);
    c('C2 · con su nombre, pasa y se le quita el nombre', f('Azkarin cuántas llamadas ha habido').vale === true && f('Azkarin cuántas llamadas ha habido').texto === 'cuántas llamadas ha habido');
    win._convPorPalabraClave = false;   // esto es lo que hace tocar la pantalla (v607)
    c('C3 · tras tocar la pantalla, TODO pasa (ya no hay que decir su nombre)', f('cuántas llamadas ha habido este mes').vale === true);
  }
}

console.log('\n──────────────────────────────');
console.log(bien + ' bien · ' + mal + ' mal');
process.exit(mal ? 1 : 0);
