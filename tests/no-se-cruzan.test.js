'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  LOS CLIENTES NO SE CRUZAN  ·  app v567 (2-sep-2026)
//
//  Auditoría de septiembre: al pasar de un cliente a otro se quedaban cosas del
//  anterior (km, mapas, fotos, la dirección de una llamada de hace días…), las
//  casillas desmarcadas resucitaban, y saveNow —el guardado de verdad— NO EXISTÍA
//  fuera de su closure: los interruptores y la reserva del número no guardaban.
//
//  🛑 ESTE BANCO EJECUTA EL CÓDIGO REAL del index.html (sacado con trozo() y corrido
//  con new Function / vm, en un navegador de mentira). No se conforma con mirar que
//  el texto esté: cada arreglo tiene su caso real, y además se SABOTEA el código (se
//  le quita el arreglo) para comprobar que el banco lo pillaría.
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path'), vm = require('vm');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };

function trozo(desde, hasta, src) {
  src = src || H;
  const i = src.indexOf(desde);
  const j = src.indexOf(hasta, i + 1);
  if (i < 0 || j < 0) return null;
  return src.slice(i, j);
}

// ── Las piezas REALES ────────────────────────────────────────────────────────
const SRC_BLANCO  = trozo('function dejarLaFichaEnBlanco(){', '// «↺ Limpiar»');
const SRC_FECHA   = trozo('function ponerFechaAbiertaUI(on){', '// v194: Toggle ascensor');
const SRC_COLLECT = trozo('function collectFormData() {', 'function restoreFormData(data) {');
const SRC_RESTORE = trozo('function restoreFormData(data) {', '//  FIREBASE SYNC (configurable)');
const SRC_SAVE    = trozo('function rellenaFlagsQueFaltan(destino, origen) {', '  return { savedIDB, savedFB };\n}') + '  return { savedIDB, savedFB };\n}';
const SRC_CLOSURE = trozo('  function pintarBorradorAviso(data) {', '  // Escuchar cambios en TODOS los campos');
const SRC_LOAD    = trozo('async function loadPresupuesto(id) {', 'async function newPresupuesto() {');
const SRC_NEW     = trozo('async function newPresupuesto() {', 'async function delPresupuesto');
const SRC_PINTAR  = trozo('function pintarDistanciaYKm() {', '\n// ── ZONA DE INFLUENCIA') || trozo('function pintarDistanciaYKm() {', '\n  return;\n}');
const SRC_PISOS   = trozo('function limpiarPisos() {', 'window.dirCompleta = dirCompleta;');
const SRC_DIRC    = trozo('function dirCompleta(p) {', '// Reparte una dirección');
const SRC_TXOPEN  = trozo('function openTranscriptionModal() {', 'async function analyzeTranscription()');
const SRC_TXCREA  = trozo('function txCreatePresupuesto() {', '// ── STREET VIEW + MAPA');
const SRC_MOVER   = trozo('async function volverACaptacion(ref) {', '// ══════════════════════════════════════════════════════════════\nfunction openFirebaseConfig');

console.log('\n══ 0 · LAS PIEZAS ESTÁN DONDE DEBEN ══');
[['ficha en blanco + ayudas', SRC_BLANCO], ['fecha abierta', SRC_FECHA], ['collectFormData', SRC_COLLECT],
 ['restoreFormData', SRC_RESTORE], ['savePresupuestoFull', SRC_SAVE], ['el closure del guardado (saveNow)', SRC_CLOSURE],
 ['loadPresupuesto', SRC_LOAD], ['newPresupuesto', SRC_NEW], ['pisos/repartirDirecciones', SRC_PISOS],
 ['dirCompleta', SRC_DIRC], ['modal de la llamada', SRC_TXOPEN], ['txCreatePresupuesto', SRC_TXCREA], ['volverACaptacion', SRC_MOVER]
].forEach(p => c('0 · ' + p[0], !!p[1]));
if (mal) { console.log('\n  ' + bien + ' bien · ' + mal + ' mal'); process.exit(1); }
// pintarDistanciaYKm: se coge la función entera contando llaves (acaba en actualizarLineaKm(...))
function funcionEntera(nombre) {
  const i = H.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let k = H.indexOf('{', i), n = 0;
  for (let p = k; p < H.length; p++) { if (H[p] === '{') n++; else if (H[p] === '}') { n--; if (!n) return H.slice(i, p + 1); } }
  return null;
}
const SRC_PINTAR_OK = funcionEntera('pintarDistanciaYKm');
c('0 · pintarDistanciaYKm', !!SRC_PINTAR_OK && /actualizarLineaKm\(kmNum/.test(SRC_PINTAR_OK));

// ── Un navegador de mentira ──────────────────────────────────────────────────
function campo(id, valor, tipo) {
  const el = {
    id: id, tagName: tipo || 'INPUT', type: 'text', readOnly: false, _v: '', selectedIndex: 3,
    style: {}, attrs: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    eventos: [], textContent: '', innerHTML: '', parentNode: null, parentElement: null, options: [],
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; },
    appendChild(x) { x.parentNode = this; x.parentElement = this; return x; }, removeChild(x) { if (x) x._quitado = true; }, insertBefore() {},
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; },
    addEventListener(t, f) { (this._l = this._l || {})[t] = (this._l[t] || []).concat(f); },
    dispatchEvent(ev) { this.eventos.push(ev && ev.type); ((this._l || {})[ev && ev.type] || []).forEach(f => f(ev)); return true; },
    focus() {}, remove() { this._quitado = true; }
  };
  // Como un <input type="date"> de verdad: un texto que no es fecha se tira y se queda vacío.
  Object.defineProperty(el, 'value', {
    get() { return this._v; },
    set(v) { v = v == null ? '' : String(v); if (this.type === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) v = ''; this._v = v; }
  });
  el.value = valor === undefined ? '' : valor;
  return el;
}
const CAMPOS_FICHA = ['f_ref','f_nc','f_fecha','f_dni','f_nom','f_tel','f_email','f_rec','f_ent','f_fac','f_fserv','f_hserv','f_abono','f_obs','f_tipo','f_com','f_pago'];
function montarDom(valores) {
  valores = valores || {};
  const els = {};
  CAMPOS_FICHA.forEach(id => { els[id] = campo(id, valores[id], (id === 'f_tipo' || id === 'f_pago') ? 'SELECT' : 'INPUT'); });
  els.f_fserv.type = 'date';
  ['f_rec_pta','f_ent_pta','tx-recogida','tx-entrega','tx-fecha','tx-nombre','tx-telefono','tx-email','tx-dni','tx-obs','tx-input','tx-tipo','tx-pago',
   'tb','distancia-box','dist-km','dist-tiempo','dist-coste','dist-ruta','dist-sitios','aviso-km-entero','sv-main-recogida','sv-main-entrega',
   'sv-main-recogida-png','sv-main-entrega-png','sv-main-recogida-street','sv-main-recogida-map','sv-ruta','sv-ruta-png','sv-ruta-pie',
   'zbe-f-recogida','zbe-f-entrega','btn-aplicar-autonomo','fc-grid','fc-msg','transcription-modal','tx-step1','tx-step2','tx-status',
   'tx-articulos-list','asc_rec','asc_ent','t_distancia','num-operarios','btn-fecha-abierta','f_distancia','tpm-switch','tpm-dot','tpm-sub'
  ].forEach(id => { els[id] = els[id] || campo(id, valores[id]); });
  els['dist-sitios'].parentNode = els['distancia-box']; els['aviso-km-entero'].parentNode = els.tb;
  els['t_distancia'].value = valores.t_distancia || 'bilbao'; els['num-operarios'].value = valores['num-operarios'] || '2';
  els['transcription-modal'].style.display = 'none';
  const doc = {
    body: campo('body'), activeElement: null, readyState: 'complete',
    getElementById: id => els[id] || null,
    createElement: () => campo('nuevo'),
    querySelector: () => null,
    querySelectorAll: sel => (/page-presupuesto/.test(sel) ? CAMPOS_FICHA.map(id => els[id]).concat([els.f_rec_pta, els.f_ent_pta]) : []),
    addEventListener() {}, dispatchEvent() {}
  };
  return { els, doc };
}
class EventoFalso { constructor(t) { this.type = t; } }

// Un contexto donde window === globalThis, como en el navegador: así «saveNow()» a pelo
// se busca en window, que es justo lo que había que comprobar.
function contexto(doc, extra) {
  const ctx = vm.createContext({});
  ctx.window = ctx; ctx.document = doc; ctx.console = { log() {}, warn() {}, error() {} };
  ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
  ctx.setTimeout = (f) => { try { f(); } catch (e) {} return 1; }; ctx.clearTimeout = () => {}; ctx.setInterval = () => 1;
  ctx.Event = EventoFalso; ctx.Date = Date; ctx.Promise = Promise; ctx.String = String; ctx.Object = Object; ctx.Array = Array;
  ctx.Number = Number; ctx.parseFloat = parseFloat; ctx.parseInt = parseInt; ctx.Math = Math; ctx.JSON = JSON; ctx.isFinite = isFinite;
  ctx.localStorage = { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
  ctx.MutationObserver = function () { return { observe() {} }; };
  ctx.navigator = { onLine: true };
  ctx._currentPresupuestoRef = null; ctx._lastSavedTimestamp = 0; ctx._initialLoadDone = true; ctx._presupuestoLoading = false;
  ctx.rid = 0;
  const nada = () => {};
  ['CA','SY','AUTO_INIT','AR_SALIDA','closeMgr','ST','updateGuardamueblesUI','updatePlataformaUI','updateOrugaUI','updatePermutaUI',
   'actualizarBannerPromo','soltarTarifaKm','setAscensor','fijarTarifaKmDeFicha','comprobarOfertaAutonomo','_v237TryReactivarBtnWA',
   'agendaProgramar','CT','openMgr','apiHeaders'].forEach(n => { ctx[n] = nada; });
  ctx.showSyncStatus = (t) => { ctx._avisos.push(t); }; ctx._avisos = [];
  ctx._comercialActual = () => 'Asier';
  ctx.AR = function () { ctx._filas.push([].slice.call(arguments)); }; ctx._filas = [];
  ctx.confirm = () => true; ctx.alert = (t) => { ctx._alertas.push(t); }; ctx._alertas = [];
  ctx.firebaseConfigured = false; ctx._fb = null;
  ctx.getPresupuesto = async (id) => (ctx._idb[id] ? Object.assign({}, ctx._idb[id]) : null); ctx._idb = {};
  ctx.savePresupuesto = async (d) => { ctx._idb[d.id || d.f_ref] = Object.assign({}, d); };
  ctx.queueOfflineOp = nada; ctx.azkarinAnalizarPresupuesto = nada;
  ctx.getDriveNextNumber = async () => ({ nextNumber: 6600, needsCreate: true });
  Object.assign(ctx, extra || {});
  return ctx;
}
function corre(ctx, src, nombre) { return vm.runInContext(src, ctx, { filename: nombre || 'trozo.js' }); }

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n══ A · 🛑 saveNow EXISTE FUERA DE SU CLOSURE, Y «+ NUEVO» GUARDA DE VERDAD ══');
(function () {
  const { els, doc } = montarDom();
  const ctx = contexto(doc);
  let guardados = [];
  ctx.savePresupuestoFull = async (d) => { guardados.push(d); return { savedIDB: true, savedFB: true }; };
  ctx.collectFormData = () => ({ f_ref: els.f_ref.value, f_nom: els.f_nom.value });
  // el closure de DOMContentLoaded, tal cual (pintarBorradorAviso + saveNow + debounced + cancelar),
  // metido en una función como en la página: lo que no se exponga a window NO existe fuera
  corre(ctx, '(function () {\n' + SRC_CLOSURE + '\n})();', 'closure');
  c('A1 · 🛑 tras el DOMContentLoaded, window.saveNow es una función', typeof ctx.saveNow === 'function');
  c('A2 · y window.cancelarAutosavePendiente también', typeof ctx.cancelarAutosavePendiente === 'function');
  c('A3 · y window.debouncedAutoSave / scheduleSave', typeof ctx.debouncedAutoSave === 'function' && typeof ctx.scheduleSave === 'function');
  // «+ NUEVO» de verdad: la ficha en blanco + el número de Drive + la reserva
  corre(ctx, SRC_BLANCO + '\n' + SRC_NEW, 'nuevo');
  return ctx.newPresupuesto().then(() => {
    c('A4 · 🛑 «+ NUEVO» pone el número de Drive en la ficha', els.f_ref.value === '6600', els.f_ref.value);
    c('A5 · 🛑 y la ficha se GUARDA de verdad, al instante, con ese número', guardados.length === 1 && guardados[0].id === '6600', JSON.stringify(guardados.map(g => g.id)));
    c('A6 · con quién la abrió y cuándo (v566)', guardados[0] && guardados[0]._abiertaPor === 'Asier' && guardados[0]._abiertaTs > 0);
    c('A7 · y el número avisa por «input» (etiqueta de variante, cartel de no aceptado)', els.f_ref.eventos.indexOf('input') >= 0, JSON.stringify(els.f_ref.eventos));
    c('A8 · la marca de «recién abierta» se consume', ctx._fichaRecienAbierta === false);
    // ── SABOTAJE: sin la exposición, «+ NUEVO» no guarda (era el ReferenceError tragado por el catch)
    const ctx2 = contexto(montarDom().doc); let g2 = [];
    ctx2.savePresupuestoFull = async (d) => { g2.push(d); }; ctx2.collectFormData = () => ({});
    corre(ctx2, '(function () {\n' + SRC_CLOSURE.replace('window.saveNow = saveNow;', '/* saboteado */') + '\n})();', 'closure-sab');
    corre(ctx2, SRC_BLANCO + '\n' + SRC_NEW, 'nuevo-sab');
    return ctx2.newPresupuesto().then(() => {
      c('A9 · 🧨 SABOTAJE: si se quita «window.saveNow = saveNow», «+ NUEVO» NO guarda (el banco lo pilla)', typeof ctx2.saveNow !== 'function' && g2.length === 0);
    });
  });
})().then(bloqueB);

function bloqueB() {
console.log('\n══ B · 🛑 SIEMPRE MANDA LA FICHA, NO LA LLAMADA DE HACE DÍAS ══');
(function () {
  const { els, doc } = montarDom({ f_ref: '6600', f_rec: 'Gran Vía 1, Bilbao', 'tx-recogida': 'Calle de la llamada 9, Getxo', 'tx-fecha': '2026-01-01', f_fserv: '2026-09-15' });
  const ctx = contexto(doc);
  corre(ctx, SRC_BLANCO, 'blanco');
  c('B1 · 🛑 con la ficha rellena, la recogida que va al email/firma es LA DE LA FICHA', ctx.datoDeLaFicha('rec') === 'Gran Vía 1, Bilbao', ctx.datoDeLaFicha('rec'));
  c('B2 · y la fecha también', ctx.datoDeLaFicha('fserv') === '2026-09-15');
  els.f_rec.value = '';
  c('B3 · ficha vacía y modal CERRADO: no se coge la de la llamada (queda vacío)', ctx.datoDeLaFicha('rec') === '', ctx.datoDeLaFicha('rec'));
  els['transcription-modal'].style.display = 'block'; ctx._txParaRef = '6600';
  c('B4 · ficha vacía, modal ABIERTO para esta misma ficha: entonces sí vale la de la llamada', ctx.datoDeLaFicha('rec') === 'Calle de la llamada 9, Getxo');
  ctx._txParaRef = '6599';
  c('B5 · 🛑 pero si el modal se abrió para OTRA ficha, no', ctx.datoDeLaFicha('rec') === '');
  // el modal se abre limpio y apuntando la ficha; al cerrarse, vacía
  corre(ctx, SRC_TXOPEN, 'txopen');
  els['tx-recogida'].value = 'resto de otra llamada';
  ctx.openTranscriptionModal();
  c('B6 · al ABRIR «NUEVA LLAMADA» los campos de la llamada anterior se vacían y se apunta la ficha', els['tx-recogida'].value === '' && ctx._txParaRef === '6600');
  els['tx-recogida'].value = 'Calle nueva 3'; ctx.closeTranscriptionModal();
  c('B7 · y al CERRARLO, también', els['tx-recogida'].value === '' && els['tx-fecha'].value === '');
  // dejar la ficha en blanco los vacía
  els['tx-entrega'].value = 'pegado';
  ctx.dejarLaFichaEnBlanco();
  c('B8 · la ficha en blanco los vacía', els['tx-entrega'].value === '');
  // los cuatro sitios que leían tx-* ANTES que la ficha ya no lo hacen
  c('B9 · 🛑 ya no queda ningún «tx-recogida … || f_rec» (la prioridad al revés) en el fichero',
    !/getElementById\('tx-recogida'\)\s*\|\|\s*\{\}\)\.value\s*\|\|\s*\(document\.getElementById\('f_rec'\)/.test(H)
    && !/dir = document\.getElementById\('tx-entrega'\);/.test(H));
  c('B10 · el email/firma (PA), la firma para WA, la liquidación y los permisos pasan por datoDeLaFicha',
    (H.match(/datoDeLaFicha\('rec'\)/g) || []).length >= 5 && (H.match(/datoDeLaFicha\('fserv'\)/g) || []).length >= 5);
  // txCreatePresupuesto: copia lo de la llamada ANTES de que la ficha nueva lo vacíe, y avisa por «input»
  const d2 = montarDom({ 'tx-recogida': 'Calle Llamada 5, Bilbao', 'tx-entrega': 'Calle Destino 7, Getxo', 'tx-fecha': '2026-10-02', 'tx-nombre': 'Raquel' });
  const ctx2 = contexto(d2.doc);
  corre(ctx2, SRC_BLANCO, 'blanco2');
  ctx2.newPresupuesto = function () { ctx2.dejarLaFichaEnBlanco(); };   // la de verdad también vacía los tx-*
  ctx2.closeTranscriptionModal = () => {};
  corre(ctx2, SRC_TXCREA, 'txcrea');
  ctx2.txCreatePresupuesto();
  c('B11 · 🛑 «Crear presupuesto» desde la llamada: la recogida llega a la ficha aunque la ficha nueva vacíe los tx-*', d2.els.f_rec.value === 'Calle Llamada 5, Bilbao', d2.els.f_rec.value);
  c('B12 · y la entrega, la fecha y el nombre', d2.els.f_ent.value === 'Calle Destino 7, Getxo' && d2.els.f_fserv.value === '2026-10-02' && d2.els.f_nom.value === 'Raquel');
  c('B13 · 🛑 y dispara «input»/«change» en direcciones y fecha (mapas, km y ZBE se enteran)',
    d2.els.f_rec.eventos.indexOf('input') >= 0 && d2.els.f_ent.eventos.indexOf('change') >= 0 && d2.els.f_fserv.eventos.indexOf('input') >= 0, JSON.stringify(d2.els.f_rec.eventos));
})();

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n══ C · 🛑 LOS KM DEL CLIENTE ANTERIOR NO ENTRAN EN EL NUEVO (cambio de muebles) ══');
(function () {
  function escenario(srcLoad) {
    const { els, doc } = montarDom();
    const ctx = contexto(doc, {
      precioKmDeLaFicha: () => 2.4, KM_GRATIS_APP: 15, KM_LARGA_DISTANCIA: 150, PRECIO_KM_LARGO: 1.5, PRECIO_KM_CERCA: 2.4,
      paradasDelServicio: () => [], pintarBorradorAviso: () => {}
    });
    ctx.actualizarLineaKm = function (km) { ctx._lineas.push(km); }; ctx._lineas = [];
    corre(ctx, SRC_BLANCO + '\n' + SRC_FECHA + '\n' + SRC_RESTORE + '\n' + srcLoad + '\n' + SRC_PINTAR_OK, 'C');
    ctx._idb['6601'] = { id: '6601', f_ref: '6601', f_nom: 'Cliente A', f_rec: 'Bilbao', f_ent: 'Getxo', rows: [], timestamp: 1 };
    ctx._idb['6602'] = { id: '6602', f_ref: '6602', f_nom: 'Cliente B', f_rec: 'Durango', f_ent: 'Durango', rows: [], timestamp: 2 };
    return ctx.loadPresupuesto('6601').then(() => {
      // al cliente A se le midió la ruta: 18.8 km (lo que hace calcularDistancia al acabar)
      ctx._kmRutaBase = 18.8; ctx._kmTiempoStr = '25 min'; ctx._kmRutaReal = 18.8; ctx._ultimaRuta = { km: 18.8 };
      ctx._gruaEncendioClausula = true; ctx._driveInfo = { needsCreate: true }; ctx._precioAutonomoData = { ref: '6601', precio: 300 };
      return ctx.loadPresupuesto('6602');
    }).then(() => {
      // en el cliente B se enciende «cambio de muebles» y se repintan los km (lo que hace abrirDialogoPermuta)
      ctx._currentPermuta = true;
      ctx.pintarDistanciaYKm();
      return { ctx, els };
    });
  }
  return escenario(SRC_LOAD).then(({ ctx, els }) => {
    c('C1 · 🛑 al abrir OTRO cliente, los km base del anterior se sueltan', ctx._kmRutaBase === 0, String(ctx._kmRutaBase));
    c('C2 · y el tiempo, la ruta y el km real', ctx._kmTiempoStr === '' && ctx._ultimaRuta === null && ctx._kmRutaReal === null);
    c('C3 · 🛑 al encender «cambio de muebles» en el nuevo NO entra ninguna línea de desplazamiento', ctx._lineas.length === 0, JSON.stringify(ctx._lineas));
    c('C4 · quién encendió la cláusula de la grúa, la carpeta de Drive y la oferta del autónomo, también fuera', ctx._gruaEncendioClausula === false && ctx._driveInfo === null && ctx._precioAutonomoData === null);
    c('C5 · la ficha abierta es la B, con sus datos', ctx._currentPresupuestoRef === '6602' && els.f_nom.value === 'Cliente B');
    c('C6 · el campo del número de la ficha vuelve a estar rellenado por restoreFormData', els.f_ref.value === '6602');
    // SABOTAJE: sin soltarEstadoDeRuta() en loadPresupuesto, entra la línea con los km de A ida y vuelta (37.6)
    return escenario(SRC_LOAD.replace('  soltarEstadoDeRuta();\n  limpiarPantallaDeCliente();', '  /* saboteado */')).then(({ ctx }) => {
      c('C7 · 🧨 SABOTAJE: sin soltar el estado al cargar, entraría «Desplazamiento (37.6 km ida y vuelta)» — el banco lo pilla',
        ctx._lineas.length === 1 && Math.abs(ctx._lineas[0] - 37.6) < 0.01, JSON.stringify(ctx._lineas));
    });
  });
})().then(bloqueD);
}

function bloqueD() {
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n══ D · 🛑 LAS CASILLAS Y LOS CAMPOS VACIADOS NO RESUCITAN ══');
(function () {
  const { els, doc } = montarDom({ f_ref: '6600', f_nom: 'Cliente', f_email: '', f_rec: 'Calle X 5', f_hserv: '' });
  const ctx = contexto(doc, { dirCompleta: (p) => (p === 'rec' ? 'Calle X 5' : ''), tarifaKmParaGuardar: () => 0 });
  ctx._currentPlataforma = false; ctx._currentOruga = false; ctx._currentGuardamuebles = false; ctx._currentPermuta = false; ctx._currentArchivado2026 = false;
  corre(ctx, SRC_COLLECT + '\n' + SRC_SAVE + '\n' + SRC_RESTORE, 'D');
  const data = ctx.collectFormData();
  c('D1 · 🛑 plataforma DESMARCADA → el objeto lleva _plataforma:false (no «nada»)', data._plataforma === false);
  c('D2 · y las otras cuatro casillas, también como booleano', data._oruga === false && data._guardamuebles === false && data._permuta === false && data._archivado2026 === false);
  ctx._currentPlataforma = true;
  c('D3 · marcada → true', ctx.collectFormData()._plataforma === true);
  // la ficha se cargó CON email; el usuario lo borra; a la nube tiene que ir el borrado
  let subido = null; let quitado = 0;
  const BORRAR = { _deleteField: true };
  ctx.firebaseConfigured = true;
  ctx._fb = { db: {}, doc: () => ({}), setDoc: async (_r, d) => { subido = d; }, deleteField: () => { quitado++; return BORRAR; } };
  ctx._camposCargados = ctx.apuntarCamposCargados({ f_ref: '6600', f_nom: 'Cliente', f_email: 'cliente@mail.com', f_rec: 'Calle X 5', _plataforma: true, rows: [] });
  c('D4 · la foto de lo cargado apunta el email (venía con valor) y no la hora (venía vacía)', ctx._camposCargados.campos.f_email === true && !ctx._camposCargados.campos.f_hserv);
  ctx._currentPlataforma = false;
  const d2 = ctx.collectFormData(); d2.id = '6600';
  return ctx.savePresupuestoFull(d2).then(() => {
    c('D5 · 🛑 lo que sube a la nube lleva _plataforma:false', subido && subido._plataforma === false, JSON.stringify(subido && subido._plataforma));
    c('D6 · 🛑 el email borrado va como deleteField (borrado de verdad en la nube)', subido && subido.f_email === BORRAR && quitado >= 1);
    c('D7 · la hora, que nunca tuvo valor, NO se manda (protección v126b: no pisar desde un formulario a medio cargar)', subido && !('f_hserv' in subido));
    c('D8 · el nombre, que sigue con valor, sube tal cual', subido && subido.f_nom === 'Cliente');
    c('D9 · tras guardar, el email ya no cuenta como «cargado» y el nombre sí', !ctx._camposCargados.campos.f_email && ctx._camposCargados.campos.f_nom === true);
    // misma sesión: escribe un email, se guarda, lo borra → también se borra en la nube
    els.f_email.value = 'nuevo@mail.com';
    const d3 = ctx.collectFormData(); d3.id = '6600';
    return ctx.savePresupuestoFull(d3);
  }).then(() => {
    c('D10 · un email escrito ahora sube con valor', subido.f_email === 'nuevo@mail.com' && ctx._camposCargados.campos.f_email === true);
    els.f_email.value = '';
    const d4 = ctx.collectFormData(); d4.id = '6600';
    return ctx.savePresupuestoFull(d4);
  }).then(() => {
    c('D11 · 🛑 y borrado en la misma sesión (sin reabrir), también se borra en la nube', subido.f_email === BORRAR);
    // sin deleteField en el SDK: '' explícito
    ctx._fb.deleteField = undefined;
    const d5 = ctx.collectFormData(); d5.id = '6600';
    ctx._camposCargados.campos.f_email = true;
    return ctx.savePresupuestoFull(d5);
  }).then(() => {
    c('D12 · si el SDK no trae deleteField, va \'\' explícito (solo para lo que tenía valor)', subido.f_email === '' && !('f_hserv' in subido));
    // otra ficha: la foto de lo cargado no vale
    ctx._camposCargados = { ref: '6599', campos: { f_email: true } };
    const d6 = ctx.collectFormData(); d6.id = '6600';
    return ctx.savePresupuestoFull(d6);
  }).then(() => {
    c('D13 · la foto de OTRA ficha no manda a borrar nada en esta', !('f_email' in subido));
    // las reglas de mezcla: rellenar solo lo que falta, nunca pisar un false
    const a = ctx.rellenaFlagsQueFaltan({ _plataforma: false }, { _plataforma: true });
    const b = ctx.rellenaFlagsQueFaltan({}, { _plataforma: true, _enMarcha: true });
    c('D14 · 🛑 un false explícito NO se pisa con el true del otro lado', a._plataforma === false);
    c('D15 · pero lo que falta sí se rellena', b._plataforma === true && b._enMarcha === true);
    c('D16 · onSnapshot ya no tiene el «nunca de true a false» (usa rellena y respeta lo nuestro)',
      !/if \(!fbData\._plataforma && localData\._plataforma\)/.test(H) && /const esNuestro = \(change\.doc\.id === window\._currentPresupuestoRef\)/.test(H));
    c('D17 · ni autoRepair', !/if \(cloud\._plataforma && !toUpload\._plataforma\)/.test(H) && (H.match(/rellenaFlagsQueFaltan\(/g) || []).length >= 3);
    c('D18 · 🛑 el guardado de los 60 s ya no resucita casillas desde IndexedDB',
      !/if \(existing\._plataforma\) window\._currentPlataforma = true;/.test(H) && !/if \(existing\._guardamuebles\) window\._currentGuardamuebles = true;/.test(H));
    c('D19 · y comprueba que la ficha sigue siendo la misma antes de guardar (J)',
      /const refAlEmpezar = ref\.value;[\s\S]{0,400}if \(ref\.value !== refAlEmpezar[\s\S]{0,900}if \(data\.f_ref !== refAlEmpezar\) return;/.test(H));
    // SABOTAJE: con el collectFormData de antes (solo si true), el false no llega
    const ctxS = contexto(montarDom({ f_ref: '6600' }).doc, { dirCompleta: () => '', tarifaKmParaGuardar: () => 0 });
    corre(ctxS, SRC_COLLECT.replace('data._plataforma = !!window._currentPlataforma;', 'if (window._currentPlataforma) data._plataforma = true;'), 'D-sab');
    ctxS._currentPlataforma = false;
    c('D20 · 🧨 SABOTAJE: con el «solo si true» de antes, el false no se escribiría — el banco lo pilla', ctxS.collectFormData()._plataforma === undefined);
  });
})().then(bloqueE);
}

function bloqueE() {
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n══ E · 🛑 EL «6d» DENTRO DEL MISMO CLIENTE ══');
(function () {
  // 1) «Calle X 5» + «6d» se guarda, 2) se cambia a «Calle Y 9» sin piso y se guarda,
  // 3) la nube aplica el borrado, 4) se reabre → «Calle Y 9» sin piso.
  const { els, doc } = montarDom({ f_ref: '6600', f_rec: 'Calle X 5', f_rec_pta: '6d' });
  const ctx = contexto(doc, { tarifaKmParaGuardar: () => 0 });
  corre(ctx, SRC_COLLECT + '\n' + SRC_SAVE + '\n' + SRC_RESTORE + '\n' + SRC_FECHA, 'E');
  // las de verdad: dirCompleta / limpiarPisos / repartirDirecciones
  ctx.monta = () => true;
  corre(ctx, SRC_DIRC + '\n' + SRC_PISOS + 'window.dirCompleta = dirCompleta; window.limpiarPisos = limpiarPisos; window.repartirDirecciones = repartirDirecciones;', 'E-pisos');
  const BORRAR = { _deleteField: true };
  let nube = {};
  ctx.firebaseConfigured = true;
  ctx._fb = { db: {}, doc: () => ({}), deleteField: () => BORRAR,
    setDoc: async (_r, d) => { Object.keys(d).forEach(k => { if (d[k] === BORRAR) delete nube[k]; else nube[k] = d[k]; }); } };
  const d1 = ctx.collectFormData(); d1.id = '6600';
  c('E1 · con piso: se guardan la entera, la calle y el piso', d1.f_rec === 'Calle X 5, 6d' && d1.f_rec_calle === 'Calle X 5' && d1.f_rec_pta === '6d');
  return ctx.savePresupuestoFull(d1).then(() => {
    c('E2 · y llegan a la nube', nube.f_rec_pta === '6d' && nube.f_rec_calle === 'Calle X 5');
    els.f_rec.value = 'Calle Y 9'; els.f_rec_pta.value = '';
    const d2 = ctx.collectFormData(); d2.id = '6600';
    c('E3 · 🛑 sin piso: la calle nueva y el piso VACÍO se guardan igualmente (antes ni se escribían)', d2.f_rec === 'Calle Y 9' && d2.f_rec_calle === 'Calle Y 9' && d2.f_rec_pta === '');
    return ctx.savePresupuestoFull(d2);
  }).then(() => {
    c('E4 · 🛑 en la nube el piso se ha BORRADO y la calle es la nueva', !('f_rec_pta' in nube) && nube.f_rec_calle === 'Calle Y 9' && nube.f_rec === 'Calle Y 9', JSON.stringify(nube));
    // reabrir: restoreFormData de verdad con lo que hay en la nube
    ctx.restoreFormData(Object.assign({ id: '6600', rows: [] }, nube));
    c('E5 · 🛑 al reabrir sale «Calle Y 9» SIN piso', els.f_rec.value === 'Calle Y 9' && els.f_rec_pta.value === '', els.f_rec.value + ' | ' + els.f_rec_pta.value);
    // una ficha de ANTES con las piezas rancias (lo que dejaba el bug): la entera manda
    ctx.restoreFormData({ id: '6600', f_ref: '6600', f_rec: 'Calle Y 9', f_rec_calle: 'Calle X 5', f_rec_pta: '6d', rows: [] });
    c('E6 · 🛑 una ficha vieja con piezas que no cuadran: manda la entera («Calle Y 9»), sin el 6d', els.f_rec.value === 'Calle Y 9' && els.f_rec_pta.value === '', els.f_rec.value + ' | ' + els.f_rec_pta.value);
    ctx.restoreFormData({ id: '6600', f_ref: '6600', f_rec: 'Calle X 5, 6d', f_rec_calle: 'Calle X 5', f_rec_pta: '6d', rows: [] });
    c('E7 · y una ficha sana se reparte como siempre: «Calle X 5» + «6d»', els.f_rec.value === 'Calle X 5' && els.f_rec_pta.value === '6d');
    // SABOTAJE: el repartirDirecciones de antes pisaba la calle nueva con la vieja
    ctx.repartirDirecciones = function (data) { ctx.limpiarPisos(); ['rec'].forEach(p => { const inp = els.f_rec, pta = els.f_rec_pta; if (data && data['f_' + p + '_pta']) { inp.value = data['f_' + p + '_calle'] || inp.value; pta.value = data['f_' + p + '_pta']; } }); };
    ctx.restoreFormData({ id: '6600', f_ref: '6600', f_rec: 'Calle Y 9', f_rec_calle: 'Calle X 5', f_rec_pta: '6d', rows: [] });
    c('E8 · 🧨 SABOTAJE: con el reparto de antes saldría «Calle X 5» + «6d» — el banco lo pilla', els.f_rec.value === 'Calle X 5' && els.f_rec_pta.value === '6d');
    c('E9 · el cuadradito del piso avisa al guardado automático al escribir en él', /extra\.oninput = function \(\) \{[\s\S]{0,400}window\.scheduleSave\(\)/.test(H));
  });
})().then(bloqueF);
}

function bloqueF() {
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n══ F · FECHA ABIERTA: SE RESTAURA Y SE DEVUELVE ══');
(function () {
  const { els, doc } = montarDom({ f_ref: '6600' });
  const ctx = contexto(doc, { tarifaKmParaGuardar: () => 0, pintarBorradorAviso: () => {} });
  corre(ctx, SRC_BLANCO + '\n' + SRC_FECHA + '\n' + SRC_RESTORE, 'F');
  // el navegador de mentira tira un texto en un <input type="date">, como el de verdad
  els.f_fserv.value = 'FECHA ABIERTA';
  c('F0 · (el input date de mentira se comporta como el real: tira el texto)', els.f_fserv.value === '');
  ctx.restoreFormData({ id: '6600', f_ref: '6600', f_fserv: 'FECHA ABIERTA', rows: [] });
  c('F1 · 🛑 al abrir una ficha con FECHA ABIERTA, el campo la ENSEÑA (type=text, bloqueado)', els.f_fserv.value === 'FECHA ABIERTA' && els.f_fserv.type === 'text' && els.f_fserv.readOnly === true, els.f_fserv.value + '/' + els.f_fserv.type);
  c('F2 · y el botón dice «PONER FECHA»', /PONER FECHA/.test(els['btn-fecha-abierta'].textContent));
  ctx.restoreFormData({ id: '6601', f_ref: '6601', f_fserv: '2026-09-20', rows: [] });
  c('F3 · 🛑 al abrir OTRA con fecha normal, el campo vuelve a ser calendario editable con su fecha', els.f_fserv.type === 'date' && els.f_fserv.readOnly === false && els.f_fserv.value === '2026-09-20', els.f_fserv.type + '/' + els.f_fserv.value);
  ctx.restoreFormData({ id: '6600', f_ref: '6600', f_fserv: 'FECHA ABIERTA', rows: [] });
  ctx.dejarLaFichaEnBlanco();
  c('F4 · 🛑 al dejar la ficha en blanco, el campo vuelve a ser calendario editable y vacío', els.f_fserv.type === 'date' && els.f_fserv.readOnly === false && els.f_fserv.value === '');
  c('F5 · el botón vuelve a «ABIERTA»', /ABIERTA/.test(els['btn-fecha-abierta'].textContent) && !/PONER/.test(els['btn-fecha-abierta'].textContent));
  ctx.toggleFechaAbierta();
  c('F6 · el botón sigue funcionando: pone FECHA ABIERTA…', els.f_fserv.value === 'FECHA ABIERTA' && els.f_fserv.type === 'text');
  ctx.toggleFechaAbierta();
  c('F7 · …y la quita', els.f_fserv.value === '' && els.f_fserv.type === 'date');
  c('F8 · forceSync y el auto-restore llaman a restoreFechaAbierta como loadPresupuesto',
    /window\._initialLoadDone = true;\s*restoreFechaAbierta\(\);\s*\/\/ v567: como en loadPresupuesto/.test(H)
    && /window\._currentArchivado2026 = !!data\._archivado2026;\s*restoreFechaAbierta\(\);/.test(H));
  // SABOTAJE: sin poner el tipo antes del bucle, el texto se pierde
  const ctxS = contexto(montarDom({ f_ref: '6600' }).doc, { tarifaKmParaGuardar: () => 0 });
  const elsS = ctxS.document.getElementById('f_fserv');
  corre(ctxS, SRC_FECHA + '\n' + SRC_RESTORE.replace("try { if (typeof ponerFechaAbiertaUI === 'function') ponerFechaAbiertaUI(data.f_fserv === 'FECHA ABIERTA'); } catch (e) {}", '/* saboteado */'), 'F-sab');
  ctxS.restoreFormData({ id: '6600', f_ref: '6600', f_fserv: 'FECHA ABIERTA', rows: [] });
  c('F9 · 🧨 SABOTAJE: sin cambiar el tipo ANTES de meter el texto, la fecha abierta se pierde — el banco lo pilla', elsS.value === '');
})();

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n══ G · LA PANTALLA SE LIMPIA DEL CLIENTE ANTERIOR ══');
(function () {
  const { els, doc } = montarDom({ f_ref: '' });
  const ctx = contexto(doc);
  corre(ctx, SRC_BLANCO, 'G');
  els['distancia-box'].style.display = 'block'; els['dist-km'].textContent = '18.8 km'; els['dist-coste'].textContent = '45 €';
  els['sv-main-recogida'].style.display = 'block'; els['sv-main-recogida'].setAttribute('data-lat', '43.2'); els['sv-main-recogida-png'].setAttribute('src', 'data:png');
  els['sv-ruta'].style.display = 'block'; els['sv-ruta-png'].setAttribute('src', 'data:png');
  els['zbe-f-recogida'].innerHTML = '<b>ZBE Bilbao</b>'; els['btn-aplicar-autonomo'].style.display = 'flex';
  els['fc-grid'].innerHTML = '<img src="foto-del-otro.jpg">';
  let etiqueta = 0, cartel = 0; ctx._dupPintaEtiqueta = () => { etiqueta++; }; ctx._cartelNoElegidaPinta = () => { cartel++; };
  ctx.limpiarPantallaDeCliente();
  c('G1 · la caja de la distancia se esconde y se vacía', els['distancia-box'].style.display === 'none' && els['dist-km'].textContent === '' && els['dist-coste'].textContent === '');
  c('G2 · los chivatos de sitios y del km entero se quitan', els['dist-sitios']._quitado === true && els['aviso-km-entero']._quitado === true);
  c('G3 · los mapas de recogida/entrega se esconden, sin foto ni coordenadas', els['sv-main-recogida'].style.display === 'none' && !els['sv-main-recogida-png'].hasAttribute('src') && !els['sv-main-recogida'].hasAttribute('data-lat'));
  c('G4 · el mapa del recorrido también', els['sv-ruta'].style.display === 'none' && !els['sv-ruta-png'].hasAttribute('src'));
  c('G5 · los carteles de ZBE se vacían', els['zbe-f-recogida'].innerHTML === '' && els['zbe-f-recogida'].style.display === 'none');
  c('G6 · el botón del precio del autónomo se esconde', els['btn-aplicar-autonomo'].style.display === 'none');
  c('G7 · la galería de fotos del otro cliente se vacía', els['fc-grid'].innerHTML === '');
  c('G8 · la etiqueta «⧉ Variante» y el cartel «NO ACEPTADO» se repintan', etiqueta === 1 && cartel === 1);
  c('G9 · y la llaman las DOS puertas: la ficha en blanco y abrir otro cliente',
    /limpiarPantallaDeCliente\(\);\s*try \{ if \(typeof CT === 'function'\) CT\(\); \}/.test(SRC_BLANCO) && /soltarEstadoDeRuta\(\);\s*limpiarPantallaDeCliente\(\);/.test(SRC_LOAD));
  c('G10 · 🛑 las fotos, la grúa y los mapas se recargan SIEMPRE al abrir una ficha, tenga filas o no',
    /^  try\{ if\(window\.fcCargarFotos\) setTimeout\(window\.fcCargarFotos, 300\);/m.test(SRC_RESTORE) && !/finally \{ window\._restaurandoFicha = false; try\{ if\(window\.fcCargarFotos\)/.test(SRC_RESTORE));
  // las listas de distancia y operarios se guardan, se restauran y se resetean
  const d2 = montarDom({ f_ref: '6600', t_distancia: 'fuera', 'num-operarios': '4' });
  const ctx2 = contexto(d2.doc, { tarifaKmParaGuardar: () => 0, dirCompleta: () => '' });
  corre(ctx2, SRC_BLANCO + '\n' + SRC_FECHA + '\n' + SRC_COLLECT + '\n' + SRC_RESTORE, 'G2');
  const dd = ctx2.collectFormData();
  c('G11 · la distancia y los operarios se GUARDAN con la ficha', dd.t_distancia === 'fuera' && dd['num-operarios'] === '4');
  ctx2.restoreFormData({ id: '6601', f_ref: '6601', t_distancia: 'vizcaya_lejos', 'num-operarios': '3', rows: [] });
  c('G12 · y se RESTAURAN', d2.els.t_distancia.value === 'vizcaya_lejos' && d2.els['num-operarios'].value === '3');
  ctx2.restoreFormData({ id: '6602', f_ref: '6602', rows: [] });
  c('G13 · una ficha sin ellas vuelve a lo de siempre (Bilbao, 2 operarios)', d2.els.t_distancia.value === 'bilbao' && d2.els['num-operarios'].value === '2');
  d2.els.t_distancia.value = 'fuera'; d2.els['num-operarios'].value = '5';
  ctx2.dejarLaFichaEnBlanco();
  c('G14 · y la ficha en blanco también', d2.els.t_distancia.value === 'bilbao' && d2.els['num-operarios'].value === '2');
})();

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n══ H/I/J · LO QUE LLEGA TARDE NO PINTA EN LA FICHA EQUIVOCADA ══');
(function () {
  const { els, doc } = montarDom({ f_ref: '6600' });
  const ctx = contexto(doc);
  corre(ctx, SRC_BLANCO, 'HIJ');
  c('I1 · selloDeFicha: con ficha abierta, su número', (ctx._currentPresupuestoRef = '6600', ctx.selloDeFicha() === '6600'));
  c('I2 · con «+ NUEVO» (sin ref abierto), el número del campo', (ctx._currentPresupuestoRef = null, els.f_ref.value = '6601', ctx.selloDeFicha() === '6601'));
  c('I3 · con la ficha en blanco, nada', (els.f_ref.value = '', ctx.selloDeFicha() === ''));
  const fn = (n) => funcionEntera(n) || '';
  c('I4 · 🛑 calcularDistancia apunta el sello al salir y no pinta si cambió', /var refAlEmpezar = \(typeof selloDeFicha/.test(fn('calcularDistancia')) && (fn('calcularDistancia').match(/sigueSiendoLaMisma\(\)/g) || []).length >= 3);
  c('I5 · la galería de fotos (cargar) también', /refAlEmpezar/.test(fn('cargar')) && /if \(!sigue\(\)\) return;/.test(fn('cargar')));
  c('I6 · y la foto del mapa (fotoMapaPara)', /refAlEmpezar/.test(fn('fotoMapaPara')) && /if \(!sigue\(\)\) \{ _ultima\[prefijo\] = null; return; \}/.test(fn('fotoMapaPara')));
  c('I7 · y los km de la grúa', /refAlEmpezar/.test(fn('kmDeLaGrua')) && /!sigue\(\)\) return;/.test(fn('kmDeLaGrua')));
  c('I8 · la oferta del autónomo comprueba la ficha al volver y al aplicar',
    /if \(String\(\(\(document\.getElementById\('f_ref'\) \|\| \{\}\)\.value\) \|\| ''\) !== String\(ref\)\) return;/.test(fn('comprobarOfertaAutonomo'))
    && /_precioAutonomoData\.ref \|\| ''\) !== _refAhora/.test(fn('aplicarPrecioAutonomo')));
  c('H1 · 🛑 el auto-restore vuelve a mirar, JUSTO ANTES de pintar, que no hay ya otra ficha',
    /if \(data && \(ref\.value \|\| window\._currentPresupuestoRef\)\) \{[\s\S]{0,300}data = null;/.test(SRC_CLOSURE || '') || /if \(data && \(ref\.value \|\| window\._currentPresupuestoRef\)\) \{[\s\S]{0,300}data = null;/.test(H));
  c('J1 · loadPresupuesto cancela el guardado pendiente DE VERDAD (cancelarAutosavePendiente)', /window\.cancelarAutosavePendiente\(\)/.test(SRC_LOAD) && !/typeof _saveTimeout !== 'undefined'/.test(SRC_LOAD));
  c('J2 · y resetea la marca de «recién abierta»', /window\._fichaRecienAbierta = false;/.test(SRC_LOAD));
  // el estado (EN MARCHA, PAGADO…) solo se toca en memoria si el cliente tocado es el abierto
  ctx._currentPresupuestoRef = '6600'; ctx._currentEnMarcha = true;
  c('I9 · estadoALaFichaAbierta: tocar OTRO cliente no cambia la ficha abierta', ctx.estadoALaFichaAbierta('6601', { _currentEnMarcha: false }) === false && ctx._currentEnMarcha === true);
  c('I10 · tocar el abierto, sí', ctx.estadoALaFichaAbierta('6600', { _currentEnMarcha: false }) === true && ctx._currentEnMarcha === false);
  // volverACaptacion de verdad, con otro cliente abierto
  ctx.RAILWAY_API = ''; ctx.fetch = async () => ({ json: async () => ({ success: true }) });
  ctx._idb['6601'] = { id: '6601', _enMarcha: true };
  ctx._currentEnMarcha = true; ctx._currentPresupuestoRef = '6600';
  corre(ctx, SRC_MOVER, 'mover');
  return ctx.volverACaptacion('6601').then(() => {
    c('I11 · 🛑 «volver a captación» del 6601 con el 6600 abierto: el 6600 sigue EN MARCHA en memoria', ctx._currentEnMarcha === true);
    c('I12 · y el 6601 queda en captación en la ficha guardada (no se borra nada)', ctx._idb['6601']._enMarcha === false && ctx._idb['6601'].id === '6601');
  });
})().then(bloqueKL);
}

function bloqueKL() {
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n══ K/L · EL BOTÓN «⏹ PARAR» Y EL GESTOR ══');
(function () {
  const chat = trozo("var bubble = document.getElementById('chatbot-bubble');", "// v281: \"Hey Google, abre Azkarin\"") || '';
  c('K1 · chatSpeakStop se expone desde dentro del chat', /window\.chatSpeakStop = chatSpeakStop;/.test(chat));
  c('K2 · y el botón «⏹ Parar» usa la expuesta', /b\.onclick = function\(\)\{\s*try \{ if \(typeof window\.chatSpeakStop === 'function'\) window\.chatSpeakStop\(\); \}/.test(H));
  // el escape del gestor, ejecutado
  const SRC_ESC = trozo('function _esc(s) {', '// v256: Actualizar panel');
  const esc = new Function(SRC_ESC + '; var _escMgr = function (t) { return _esc(t).replace(/"/g, \'&quot;\'); }; return _escMgr;')();
  c('L1 · un nombre con <, > y & no rompe la lista', esc('<b>Pepe & "Cía"</b>') === '&lt;b&gt;Pepe &amp; &quot;Cía&quot;&lt;/b&gt;', esc('<b>Pepe & "Cía"</b>'));
  c('L2 · y el gestor lo usa para el nombre y la dirección', /_escMgr\(p\.f_nom \|\| 'Sin nombre'\)/.test(H) && /_escMgr\(p\.f_rec \?/.test(H));
})();

console.log('\n══ M · VERSIÓN, AYUDA Y REGISTRO ══');
const _v = parseInt((H.match(/var APP_VERSION\s*=\s*['"]v?(\d+)/) || [])[1] || '0', 10);
c('M1 · la versión es la de este cambio o más nueva', _v >= 567, 'va por v' + _v);
const _sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
c('M2 · y la caché del sw.js va a la par', new RegExp('azkar-pwa-v' + _v).test(_sw));
const _vj = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
c('M3 · y version.json', _vj.version === 'v' + _v && _vj.ts > 0);
c('M4 · la Ayuda lo cuenta', /app v567/.test(H) && /no se cruzan/i.test(H));

console.log('\n──────────────────────────────────────────────');
console.log('  ' + bien + ' bien · ' + mal + ' mal');
console.log('──────────────────────────────────────────────');
process.exit(mal ? 1 : 0);
}
