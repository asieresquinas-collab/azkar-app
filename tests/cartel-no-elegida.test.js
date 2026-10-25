/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
//  EL CARTEL DE «NO ACEPTADO» SE VA CUANDO SE QUITA LA MARCA (app v730)  ·  node tests/cartel-no-elegida.test.js
//
//  Asier, 24-oct-2026, 23:01: le pidió a Azkarin quitar la marca de «no aceptado» de la 6827-B, Azkarin la quitó en la nube…
//  y el cartel rojo seguía: «Sigue la señal». El cartel se pintaba con la copia del móvil y no se volvía a mirar.
//  Aquí se prueba el trozo DE VERDAD del index.html con una ficha de mentira:
//    A · la copia del móvil dice «marcada» y la nube ya no: el cartel NO sale y la copia del móvil se arregla
//    B · si la nube sigue diciendo «marcada», el cartel sale (no se esconde nada que sea verdad)
//    C · se vuelve a mirar al llegar un cambio de la nube de la ficha abierta y después de cada respuesta de Azkarin
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path'), vm = require('vm');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = HTML.indexOf("if (document.getElementById('cartel-no-elegida')) return;");
const ini = HTML.lastIndexOf('<script>', a), fin = HTML.indexOf('</script>', a);
const TROZO = HTML.slice(ini + 8, fin);
let ok = 0, mal = 0;
function t(n, x, d) { if (x) { ok++; console.log('  OK  ' + n); } else { mal++; console.log('  ❌  ' + n + (d ? '\n      → ' + d : '')); } }
if (a < 0) { console.log('❌ no encuentro el trozo del cartel'); process.exit(1); }

function app(local, nube) {
  const els = {};
  const mk = (id) => ({ id, value: '', style: {}, innerHTML: '', parentElement: { appendChild: (c) => { els[c.id] = c; } }, addEventListener() {} });
  els.f_ref = mk('f_ref'); els.f_ref.value = '9101-B';
  const guardados = [];
  const win = {
    document: { readyState: 'complete', getElementById: (id) => els[id] || null, createElement: () => ({ style: {}, innerHTML: '' }), addEventListener() {} },
    setTimeout: () => 0, String, Object, Date, Promise, console,
    firebaseConfigured: true,
    getPresupuesto: async () => local,
    savePresupuesto: async (d) => { guardados.push(d); },
    _fb: { db: {}, doc: (db, col, id) => ({ col, id }), getDoc: async () => ({ exists: () => !!nube, data: () => nube }) }
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(TROZO, win);
  return { win, els, guardados };
}

(async () => {
  console.log('\n══ A · LA NUBE YA NO LA TIENE MARCADA ══');
  const x = app({ id: '9101-B', _noElegida: true, _eleccionCliente: '9101' }, { _noElegida: false, _noElegidaQuitadaTs: 123 });
  await x.win._cartelNoElegidaPinta();
  const c = x.els['cartel-no-elegida'];
  t('A1 · el cartel no sale', c && c.style.display === 'none', c && JSON.stringify(c.style));
  t('A2 · y la copia del móvil queda arreglada', x.guardados.length === 1 && x.guardados[0]._noElegida === false, JSON.stringify(x.guardados));

  console.log('\n══ B · LA NUBE SIGUE DICIENDO QUE NO SE ACEPTÓ ══');
  const y = app({ id: '9101-B', _noElegida: true, _eleccionCliente: '9101' }, { _noElegida: true, _eleccionCliente: '9101' });
  await y.win._cartelNoElegidaPinta();
  const c2 = y.els['cartel-no-elegida'];
  t('B1 · el cartel sale, con la ficha elegida', c2 && c2.style.display === 'block' && /eligió el <b>9101<\/b>/.test(c2.innerHTML));
  t('B2 · y no se toca la copia del móvil', y.guardados.length === 0);

  console.log('\n══ C · SE VUELVE A MIRAR ══');
  t('C1 · al llegar de la nube un cambio de la ficha abierta', /changes\.some\(function \(c\) \{ return c\.doc && c\.doc\.id === window\._currentPresupuestoRef; \}\)\) setTimeout\(window\._cartelNoElegidaPinta, 300\)/.test(HTML));
  t('C2 · y después de cada respuesta de Azkarin', /if \(type === 'bot' && window\._cartelNoElegidaPinta && window\._currentPresupuestoRef\) setTimeout\(window\._cartelNoElegidaPinta, 1500\)/.test(HTML));

  console.log('\n' + (mal ? '❌ ' : '✅ ') + ok + ' bien, ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
