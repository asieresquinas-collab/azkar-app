// ══════════════════════════════════════════════════════════════════════════════
//  LO QUE VA ENTRE DOS: +30%, Y DE 90 SOLO +10% (app v393)
//
//  Asier, 8-ago-2026: «el canapé son 80 € y parece que no dan, pero el problema es
//  el COLCHÓN: si es grande, no lo puede llevar una persona sola. Que suba el precio
//  y que NO se pueda modificar ni hacer descuento en ese ítem, y que eso no lo vea
//  el cliente, es interno nuestro». Y al concretar: «en el canapé sube siempre el
//  precio un 30% y el colchón un 30%; si es pequeño, de 90, solo un 10%. Siempre que
//  se ponga un canapé se tiene que preguntar de qué medida es».
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
  window: {}
};
const fn = new Function('PRECIOS_FLAT', 'CA', 'document', 'window', motor + '\n; return {esDeDos, aplica2p, quita2p};');
const M = fn(ctx.PRECIOS_FLAT, ctx.CA, ctx.document, ctx.window);

console.log('\n══ A · LOS EUROS QUE SALEN ══');
const canapeGrande = nuevaFila('Canapé', 64.63);
M.aplica2p(canapeGrande, 30);
comprueba('A1 · un canapé de más de 90 sube el 30% (64,63 → 84,02)',
  canapeGrande._nums[1].value === '84.02', 'salió ' + canapeGrande._nums[1].value);
const canape90 = nuevaFila('Canapé', 64.63);
M.aplica2p(canape90, 10);
comprueba('A2 · un canapé de 90 sube solo el 10% (64,63 → 71,09)',
  canape90._nums[1].value === '71.09', 'salió ' + canape90._nums[1].value);
const colchon = nuevaFila('Colchón', 19.91);
M.aplica2p(colchon, 30);
comprueba('A3 · el colchón grande también sube el 30% (19,91 → 25,88)',
  colchon._nums[1].value === '25.88', 'salió ' + colchon._nums[1].value);
const nido = nuevaFila('Canapé/Cama nido', 80.60);
M.aplica2p(nido, 30);
comprueba('A4 · el canapé/cama nido cuenta igual (80,60 → 104,78)',
  nido._nums[1].value === '104.78', 'salió ' + nido._nums[1].value);

console.log('\n══ B · LA LÍNEA QUEDA CERRADA (nadie la toca) ══');
comprueba('B1 · el precio queda bloqueado', canapeGrande._nums[1].readOnly === true);
comprueba('B2 · el descuento queda bloqueado Y a cero', canapeGrande._nums[2].readOnly === true && canapeGrande._nums[2].value === '0');
comprueba('B3 · si venía con un descuento puesto, se borra', (() => {
  const f = nuevaFila('Canapé', 64.63, 15); M.aplica2p(f, 30); return f._nums[2].value === '0';
})());
comprueba('B4 · queda apuntado en la fila que va entre dos (para el cálculo y el guardado)',
  canapeGrande.getAttribute('data-2p') === '30' && canapeGrande.getAttribute('data-2pbase') === '64.63');
comprueba('B5 · el recargo NO se aplica dos veces si se vuelve a marcar', (() => {
  M.aplica2p(canapeGrande, 30); return canapeGrande._nums[1].value === '84.02';
})(), 'salió ' + canapeGrande._nums[1].value);
comprueba('B6 · cambiar de 90 a grande recalcula desde el precio de tabla, no del recargado', (() => {
  const f = nuevaFila('Canapé', 64.63); M.aplica2p(f, 10); M.aplica2p(f, 30); return f._nums[1].value === '84.02';
})());

console.log('\n══ C · SI SE CAMBIA POR OTRA COSA, SE LIBERA ══');
const suelto = nuevaFila('Canapé', 64.63);
M.aplica2p(suelto, 30);
M.quita2p(suelto);
comprueba('C1 · vuelve el precio de tabla', suelto._nums[1].value === '64.63', 'salió ' + suelto._nums[1].value);
comprueba('C2 · y se puede volver a tocar precio y descuento',
  suelto._nums[1].readOnly === false && suelto._nums[2].readOnly === false);

console.log('\n══ D · QUÉ CUENTA COMO "ENTRE DOS" ══');
comprueba('D1 · canapé, cama nido y colchón, con o sin acentos',
  M.esDeDos('Canapé') && M.esDeDos('canape') && M.esDeDos('Colchón') && M.esDeDos('Canapé/Cama nido'));
comprueba('D2 · un armario NO (aquí no se toca ningún precio más)', !M.esDeDos('Armario') && !M.esDeDos('Somier'));

console.log('\n══ E · CÓMO QUEDA ENGANCHADO EN LA APP ══');
comprueba('E1 · se pregunta la medida al poner un canapé o un colchón',
  /if\(esDeDos\(inp\.value\)\) preguntaMedida2p\(row\)/.test(html) && /¿De qué medida es /.test(html));
comprueba('E2 · el aviso ofrece las dos medidas (90 y más de 90)',
  /De 90 \(cama pequeña\)/.test(html) && /Más de 90 \(135, 150, 160/.test(html));
comprueba('E3 · esa línea queda FUERA de la promo del 20% (si no, el recargo se lo comería)',
  /PROMO_CONCEPTOS_EXCLUIDOS\.indexOf\(nombre\) >= 0 \|\| !!rows\[i\]\.getAttribute\('data-2p'\)/.test(html));
comprueba('E4 · la marca se guarda con la ficha (dp y el precio de tabla)',
  /dp: cr\.getAttribute\('data-2p'\)/.test(html) && /dpb: cr\.getAttribute\('data-2pbase'\)/.test(html));
comprueba('E5 · SOLO de hoy en adelante: al abrir una ficha vieja NO se pregunta nada',
  /window\._restaurandoFicha = true/.test(html) && /if\(window\._restaurandoFicha\) return;/.test(html),
  'si preguntara al cargar, tocaría presupuestos ya cerrados');
comprueba('E6 · y una ficha ya marcada se restaura bloqueada, sin volver a preguntar',
  /if\(window\._dp2pRestore\) aplica2p\(div, parseFloat\(window\._dp2pRestore\)/.test(html));
comprueba('E7 · el cliente no ve el recargo: no se escribe nada de esto en el presupuesto',
  !/recargo|\+30%|entre dos/i.test(html.slice(html.indexOf('function buildCompleteHTML'), html.indexOf('function buildCompleteHTML') + 6000)),
  'se ha colado texto interno en el documento del cliente');

console.log('\n══ RESULTADO ══');
console.log('  ' + bien + ' bien, ' + mal + ' mal');
console.log(mal === 0 ? '  ✅ TODO OK' : '  ❌ HAY FALLOS');
process.exit(mal === 0 ? 0 : 1);
