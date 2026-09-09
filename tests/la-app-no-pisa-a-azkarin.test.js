'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  LA APP NO PISA LO QUE AZKARIN HA METIDO EN LA FICHA  ·  app v648  (9-sep-2026)
//
//  Koldo, ficha 6617. Azkarin metió a las 19:51 los 6 cuadros, el reloj, las cajas y
//  el colchón; a las 20:01 la ficha volvía a tener SOLO las 4 líneas originales. A las
//  20:03 metió los cuadros a 20, el reloj a 8 (y el papel); a las 21:25 la ficha tenía
//  otra vez las 6 líneas de las 20:01. Lo dice _rowsHistorial de la propia ficha.
//
//  Quién pisaba: la app del móvil. Con la ficha abierta y el foco en el CHAT de Azkarin
//  (un textarea), el cambio remoto se trataba como «usuario editando» → no se cargaba,
//  y encima se subía el sello: el siguiente guardado mandaba las líneas VIEJAS del
//  formulario con merge:true, y el array rows se sustituye entero. Y al reconectar
//  (venía de la carretera) syncToFirebase subía TODAS las fichas locales tal cual.
// ══════════════════════════════════════════════════════════════════════════════
const path = require('path'), fs = require('fs');
const RAIZ = path.join(__dirname, '..');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };
const H = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

function fnSrc(nombre) {
  const i = H.indexOf('async function ' + nombre + '(');
  if (i < 0) throw new Error('no está ' + nombre);
  let j = H.indexOf('{', i), depth = 0;
  for (let k = j; k < H.length; k++) { if (H[k] === '{') depth++; else if (H[k] === '}') { depth--; if (depth === 0) return H.slice(i, k + 1); } }
  throw new Error('llaves ' + nombre);
}

function montar(nube, opts) {
  opts = opts || {};
  const escritos = [], locales = [];
  const el = (id) => ({ id, tagName: opts.activoTag || 'TEXTAREA', closest: (sel) => (opts.activoEnFicha && sel === '#page-presupuesto') ? {} : null });
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    window: {
      _lastSavedTimestamp: opts.cargadoTs || 0, _camposTocados: opts.tocados || {}, _rowsTocadasTs: opts.rowsTocadasTs || 0,
      _currentPresupuestoRef: '6617', _presupuestoLoading: false,
      _fb: {
        db: {}, doc: (db, col, id) => ({ col, id }),
        getDoc: async () => ({ exists: () => !!nube, data: () => nube }),
        setDoc: async (d, data, o) => { escritos.push({ id: d.id, data: JSON.parse(JSON.stringify(data)), merge: !!(o && o.merge) }); },
        deleteField: () => ({ __del: true })
      }
    },
    document: { activeElement: el(opts.activoId || 'chatbot-input'), querySelectorAll: () => [], getElementById: () => null },
    firebaseConfigured: true,
    savePresupuesto: async (d) => { locales.push(JSON.parse(JSON.stringify(d))); },
    getPresupuesto: async () => null,
    getAllPresupuestos: async () => opts.locales || [],
    showSyncStatus: (m) => { sandbox._avisos.push(m); },
    actualizarCamposCargados: () => {},
    restoreFormData: (d) => { sandbox._restaurado = d; },
    queueOfflineOp: () => {},
    rid: 0, _avisos: [], _restaurado: null
  };
  const src = fnSrc('savePresupuestoFull') + '\n' + fnSrc('syncToFirebase') + '\nreturn { savePresupuestoFull, syncToFirebase };';
  const keys = Object.keys(sandbox);
  const f = new Function(...keys, src);
  const api = f(...keys.map(k => sandbox[k]));
  return { api, sandbox, escritos, locales };
}

(async () => {
  console.log('\n══ A · LA NUBE ES MÁS NUEVA Y EL USUARIO NO HA TOCADO LOS ARTÍCULOS ══');
  const NUBE = { id: '6617', timestamp: 2000, f_obs: 'Observaciones de Azkarin, con las medidas', rows: [{ c: '60-70x90', u: '25', p: '20' }, { c: 'Cuadros', u: '6', p: '20' }, { c: 'Reloj de pared', u: '1', p: '8' }] };
  const LOCAL = { id: '6617', f_ref: '6617', timestamp: 3000, f_nom: 'KOLDO', f_obs: 'Observaciones viejas del formulario', rows: [{ c: '60-70x90', u: '25', p: '20' }] };
  let m = montar(NUBE, { cargadoTs: 1000 });
  await m.api.savePresupuestoFull(Object.assign({}, LOCAL));
  const w = m.escritos[0];
  c('A1 · se guarda en la nube (merge)', !!w && w.merge === true);
  c('A2 · 🛑 los artículos viejos del formulario NO se mandan: se conservan los de Azkarin', w && w.data.rows === undefined, JSON.stringify(w && w.data).slice(0, 200));
  c('A3 · 🛑 las observaciones de Azkarin tampoco se pisan', w && w.data.f_obs === undefined);
  c('A4 · lo que la nube no tenía (f_nom) sí se manda', w && w.data.f_nom === 'KOLDO');
  c('A5 · con el foco en el chat de Azkarin, el formulario se recarga con lo de la nube', m.sandbox._restaurado && m.sandbox._restaurado.rows.length === 3 && /Azkarin/.test(m.sandbox._restaurado.f_obs));
  c('A6 · y se avisa de lo conservado', m.sandbox._avisos.some(x => /conservado/.test(x) && /artículos/.test(x)));
  c('A7 · la copia local queda con lo de la nube', m.locales.some(l => Array.isArray(l.rows) && l.rows.length === 3));

  console.log('\n══ B · EL USUARIO SÍ HA TOCADO DESPUÉS DEL CAMBIO DE LA NUBE ══');
  m = montar(NUBE, { cargadoTs: 1000, rowsTocadasTs: 2500, tocados: { f_obs: 2600 } });
  await m.api.savePresupuestoFull(Object.assign({}, LOCAL));
  c('B1 · si tocó los artículos después, mandan los suyos', m.escritos[0].data.rows && m.escritos[0].data.rows.length === 1);
  c('B2 · si tocó las observaciones después, mandan las suyas', m.escritos[0].data.f_obs === 'Observaciones viejas del formulario');
  m = montar(NUBE, { cargadoTs: 1000, rowsTocadasTs: 1500 });
  await m.api.savePresupuestoFull(Object.assign({}, LOCAL));
  c('B3 · tocar ANTES del cambio de la nube no cuenta: la nube manda', m.escritos[0].data.rows === undefined);

  console.log('\n══ C · LA NUBE NO ES MÁS NUEVA: TODO COMO SIEMPRE ══');
  m = montar(Object.assign({}, NUBE, { timestamp: 900 }), { cargadoTs: 1000 });
  await m.api.savePresupuestoFull(Object.assign({}, LOCAL));
  c('C1 · si lo cargado es igual o más nuevo que la nube, se manda todo', m.escritos[0].data.rows && m.escritos[0].data.rows.length === 1 && m.escritos[0].data.f_obs === 'Observaciones viejas del formulario');
  c('C2 · y no se recarga nada', m.sandbox._restaurado === null);
  m = montar(null, { cargadoTs: 0 });
  await m.api.savePresupuestoFull(Object.assign({}, LOCAL));
  c('C3 · ficha que no existe en la nube: se sube entera', m.escritos[0].data.rows && m.escritos[0].data.rows.length === 1);

  console.log('\n══ D · EDITANDO LA FICHA DE VERDAD, NO SE RECARGA ENCIMA ══');
  m = montar(NUBE, { cargadoTs: 1000, activoId: 'f_rec', activoTag: 'INPUT', activoEnFicha: true });
  await m.api.savePresupuestoFull(Object.assign({}, LOCAL));
  c('D1 · con el foco en un campo de la ficha, no se pisa pero tampoco se recarga', m.escritos[0].data.rows === undefined && m.sandbox._restaurado === null);
  c('D2 · y se le dice que pulse Sync', m.sandbox._avisos.some(x => /Sync/.test(x)));

  console.log('\n══ E · AL RECONECTAR NO SE SUBEN COPIAS VIEJAS ══');
  m = montar(NUBE, { locales: [{ id: '6617', timestamp: 1500, rows: [{ c: 'vieja' }] }, { id: '7000', timestamp: 5000, rows: [{ c: 'nueva' }] }] });
  await m.api.syncToFirebase();
  c('E1 · 🛑 la copia local VIEJA de la 6617 no se sube', !m.escritos.some(e => e.id === '6617'));
  c('E2 · y se baja la nube al móvil', m.locales.some(l => l.id === '6617' && l.rows.length === 3));
  c('E3 · la que es más nueva en el móvil sí se sube', m.escritos.some(e => e.id === '7000'));

  console.log('\n══ F · LO QUE TOCA EL USUARIO SE APUNTA ══');
  c('F1 · hay un oyente de input/change que apunta campos y artículos tocados', /document\.addEventListener\('input', _toca, true\)/.test(H) && /window\._rowsTocadasTs = Date\.now\(\)/.test(H));
  c('F2 · añadir o quitar una fila cuenta como tocar (AR / DR)', /function AR\(c,z,u,p,d,tm,tam\)\{\n  if \(!window\._presupuestoLoading\) window\._rowsTocadasTs = Date\.now\(\)/.test(H) && /function DR\(id\)\{\n  if \(!window\._presupuestoLoading\) window\._rowsTocadasTs = Date\.now\(\)/.test(H));
  c('F3 · al cargar una ficha se olvida lo tocado', (H.match(/window\._camposTocados = \{\}; window\._rowsTocadasTs = 0;/g) || []).length >= 3);
  c('F4 · 🛑 onSnapshot: el chat de Azkarin NO cuenta como «editando la ficha»', /activeEl\.id !== 'chatbot-input'/.test(H) && /activeEl\.closest\('#page-presupuesto'\)/.test(H));
  c('F5 · 🛑 y ya no sube el sello cuando no recarga', /window\._nubeMasNuevaTs = remoteTs;/.test(H) && !/Actualizar timestamp para no repetir el aviso\n\s*window\._lastSavedTimestamp = remoteTs;/.test(H));
  c('F6 · versión v648', /var APP_VERSION = 'v648'/.test(H));

  console.log('\n' + bien + ' bien · ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
