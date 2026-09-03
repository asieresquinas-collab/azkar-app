// ══════════════════════════════════════════════════════════════════════════════
//  LO QUE VA ENTRE DOS: PRECIO CERRADO, SIN DESCUENTO (app v403 · v474)
//
//  Asier, 8-ago-2026: «el COLCHÓN, si es grande, no lo puede llevar una persona sola.
//  Que suba el precio y que NO se pueda modificar ni hacer descuento en ese ítem, y que
//  eso no lo vea el cliente, es interno nuestro». Y el 9-ago, con el PDF del 6500
//  delante: «el canapé, un 15% menos de lo que tiene ahora, que son 84,02; y el colchón
//  déjalo en 19,91». Se acabó el recargo por medida: el precio de estas piezas es FIJO
//  (71,42 / 89,06 / 19,91), cerrado y sin descuento. Lo ya guardado no se toca. Y desde
//  la v474: un precio EN BLANCO no se bloquea jamás (antes que un campo muerto, que lo
//  escriba Asier).
//
//  (Este banco nació con la regla del +30% de la v393; el 3-sep-2026 se puso al día con
//  la regla vigente, que llevaba un mes en la app sin que el banco la mirase.)
//
//  Aquí se ejecuta la lógica de verdad con un navegador de mentira: se comprueban los
//  EUROS que salen, que la línea quede cerrada y que los presupuestos viejos no se toquen.
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
let bien = 0, mal = 0;
function comprueba(n, c, d) { if (c) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } }

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// ── Se saca del index el motor de "entre dos" tal cual, y se ejecuta ──────────
const ini = html.indexOf('var DOS_PERSONAS =');
const fin = html.indexOf('function AR(c,z,u,p,d,tm,tam){');
const motor = html.slice(ini, fin);

// Un DOM de juguete: solo lo que el motor toca.
function nuevoInput(v) {
  return { value: v == null ? '' : String(v), readOnly: false, style: {}, title: '', type: 'number' };
}
function nuevaFila(concepto, precio, dto) {
  const attrs = {};
  const concInp = { value: concepto, style: {} };
  const nums = [nuevoInput(1), nuevoInput(precio), nuevoInput(dto || 0)];
  const hijos = [];
  return {
    style: {},
    getAttribute: k => (k in attrs ? attrs[k] : null),
    setAttribute: (k, v) => { attrs[k] = String(v); },
    removeAttribute: k => { delete attrs[k]; },
    querySelector: sel => {
      if (sel === 'input[list="dl"]') return concInp;
      if (sel === '.dosp') return hijos.find(h => h.className === 'dosp') || null;
      return null;
    },
    querySelectorAll: sel => (sel === 'input[type=number]' ? nums : []),
    appendChild: n => hijos.push(n),
    _attrs: attrs, _nums: nums, _conc: concInp
  };
}
const ctx = {
  PRECIOS_FLAT: { 'Canapé': 64.63, 'Canapé/Cama nido': 80.60, 'Colchón': 19.91, 'Armario': 100 },
  CA: () => {},
  document: { createElement: () => ({ style: {}, className: '', setAttribute() {}, querySelector: () => ({}) }), body: { appendChild() {}, removeChild() {} } },
  window: { _restaurandoFicha: false }
};
const fn = new Function('PRECIOS_FLAT', 'CA', 'document', 'window', 'function _fichaEsAnterior(){ return false; }\n' + motor + '\n; return {esDeDos, aplica2p, quita2p, precio2p};');
const M = fn(ctx.PRECIOS_FLAT, ctx.CA, ctx.document, ctx.window);

console.log('\n══ A · LOS EUROS QUE SALEN (precio cerrado de hoy) ══');
const canape = nuevaFila('Canapé', 64.63);
M.aplica2p(canape);
comprueba('A1 · un canapé nuevo se va al precio cerrado (71,42)', canape._nums[1].value === '71.42', 'salió ' + canape._nums[1].value);
const colchon = nuevaFila('Colchón', 10);
M.aplica2p(colchon);
comprueba('A2 · el colchón, a 19,91', colchon._nums[1].value === '19.91', 'salió ' + colchon._nums[1].value);
const nido = nuevaFila('Canapé/Cama nido', 80.60);
M.aplica2p(nido);
comprueba('A3 · el canapé/cama nido, a 89,06', nido._nums[1].value === '89.06', 'salió ' + nido._nums[1].value);
comprueba('A4 · sin acentos, el mismo precio', M.precio2p('canape') === 71.42 && M.precio2p('COLCHON') === 19.91);
comprueba('A5 · lo que no va entre dos no tiene precio cerrado', M.precio2p('Armario') === 0);

console.log('\n══ B · LA LÍNEA QUEDA CERRADA (nadie la toca) ══');
comprueba('B1 · el precio queda bloqueado', canape._nums[1].readOnly === true);
comprueba('B2 · el descuento queda bloqueado Y a cero', canape._nums[2].readOnly === true && canape._nums[2].value === '0');
comprueba('B3 · si venía con un descuento puesto, se borra', (() => {
  const f = nuevaFila('Canapé', 64.63, 15); M.aplica2p(f); return f._nums[2].value === '0';
})());
comprueba('B4 · queda apuntado en la fila que va entre dos (para el cálculo y el guardado)',
  canape.getAttribute('data-2p') === '1');
comprueba('B5 · volver a marcarla no cambia el precio', (() => {
  M.aplica2p(canape); return canape._nums[1].value === '71.42';
})(), 'salió ' + canape._nums[1].value);
comprueba('B6 · 🛑 al ABRIR una ficha guardada se respeta SU precio (lo viejo no se toca)', (() => {
  const f = nuevaFila('Canapé', 84.02); M.aplica2p(f, 84.02); return f._nums[1].value === '84.02' && f._nums[1].readOnly === true;
})());
comprueba('B7 · 🛑 un precio EN BLANCO no se bloquea jamás (v474): que lo escriba Asier', (() => {
  const f = nuevaFila('Canapé', ''); ctx.window._restaurandoFicha = true;
  try { M.aplica2p(f); } finally { ctx.window._restaurandoFicha = false; }
  return f._nums[1].value === '' && f._nums[1].readOnly === false && f._nums[2].readOnly === true;
})());

console.log('\n══ C · SI SE CAMBIA POR OTRA COSA, SE LIBERA ══');
const suelto = nuevaFila('Canapé', 64.63);
M.aplica2p(suelto);
M.quita2p(suelto);
comprueba('C1 · se puede volver a tocar precio y descuento',
  suelto._nums[1].readOnly === false && suelto._nums[2].readOnly === false);
comprueba('C2 · y se quita la marca', suelto.getAttribute('data-2p') === null);

console.log('\n══ D · QUÉ CUENTA COMO "ENTRE DOS" ══');
comprueba('D1 · canapé, cama nido y colchón, con o sin acentos',
  M.esDeDos('Canapé') && M.esDeDos('canape') && M.esDeDos('Colchón') && M.esDeDos('Canapé/Cama nido'));
comprueba('D2 · un armario NO (aquí no se toca ningún precio más)', !M.esDeDos('Armario') && !M.esDeDos('Somier'));

console.log('\n══ E · CÓMO QUEDA ENGANCHADO EN LA APP ══');
comprueba('E1 · al escribir un canapé o un colchón se cierra el precio, sin preguntar medida',
  /if\(esDeDos\(inp\.value\)\) aplica2p\(row\);/.test(html));
comprueba('E2 · la tabla de precios cerrados es la de Asier (71,42 / 89,06 / 19,91)',
  /PRECIO_2P = \{ 'canape': 71\.42, 'canape\/cama nido': 89\.06, 'colchon': 19\.91 \}/.test(html));
comprueba('E3 · esa línea queda FUERA de la promo del 20% (si no, el recargo se lo comería)',
  /PROMO_CONCEPTOS_EXCLUIDOS\.indexOf\(nombre\) >= 0 \|\| !!rows\[i\]\.getAttribute\('data-2p'\)/.test(html));
comprueba('E4 · la marca se guarda con la ficha (dp y el precio de tabla)',
  /dp: cr\.getAttribute\('data-2p'\)/.test(html) && /dpb: cr\.getAttribute\('data-2pbase'\)/.test(html));
comprueba('E5 · SOLO de hoy en adelante: al abrir una ficha vieja NO se pregunta nada',
  /window\._restaurandoFicha = true/.test(html) && /if\(window\._restaurandoFicha\) return;/.test(html),
  'si preguntara al cargar, tocaría presupuestos ya cerrados');
comprueba('E6 · y una ficha ya marcada se restaura bloqueada CON SU PRECIO, sin volver a preguntar',
  /if\(window\._dp2pRestore\) aplica2p\(div, parseFloat\(p\) \|\| 0\);/.test(html));
comprueba('E7 · el cliente no ve el recargo: no se escribe nada de esto en el presupuesto',
  !/recargo|\+30%|entre dos/i.test(html.slice(html.indexOf('function buildCompleteHTML'), html.indexOf('function buildCompleteHTML') + 6000)),
  'se ha colado texto interno en el documento del cliente');

console.log('\n══ RESULTADO ══');
console.log('  ' + bien + ' bien, ' + mal + ' mal');
console.log(mal === 0 ? '  ✅ TODO OK' : '  ❌ HAY FALLOS');
process.exit(mal === 0 ? 0 : 1);
