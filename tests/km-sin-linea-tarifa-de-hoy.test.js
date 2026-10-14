// v679 · una ficha que todavía no cobra kilómetros no tiene precio de km «de antes» que respetar
// (Asier, 14-oct, ficha 6848 Getxo → Madrid: con el botón salía 404 × 2,40 en vez de 404 × 3,50)
const assert = require('assert'); const fs = require('fs'); const vm = require('vm');
const H = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const ini = H.indexOf('var PRECIO_KM_CERCA = 2.40;');
const fin = H.indexOf('// ── LÍNEA DE KM EN PRESUPUESTO');
assert(ini > 0 && fin > ini, 'encuentro el bloque de la tarifa de km');
const BLOQUE = H.slice(ini, fin);

function app(filas) {
  const rows = (filas || []).map(f => ({ querySelectorAll: () => f.map(v => ({ value: String(v) })) }));
  const ctx = { document: { querySelectorAll: (sel) => (sel === '#tb .cr' ? rows : []) } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(BLOQUE, ctx);
  return ctx;
}
let n = 0; const ok = (cond, msg) => { assert(cond, msg); n++; };

// 1 · ficha nueva o hecha en el servidor: sin línea y sin tarifa apuntada
let A = app([['Servicio base: equipo y vehículo', '1', '100', '0'], ['Sofá 3 plazas', '1', '110.43', '0']]);
A.fijarTarifaKmDeFicha(undefined);
ok(A.precioKmDeLaFicha(404.3) === 3.5, 'sin línea de km, un Madrid va a 3,50 (antes 2,40)');
ok(A.precioKmDeLaFicha(30) === 2.4, 'y un viaje de cerca, a 2,40');
ok(A.tarifaKmParaGuardar() === 0, 'y no se apunta ninguna tarifa mientras no haya línea');

// 2 · la ficha que ya tenía el 2,40 apuntado sin haber cobrado nunca un km (el caso de la 6848)
A = app([['Servicio base: equipo y vehículo', '1', '100', '0']]);
A.fijarTarifaKmDeFicha(2.4);
ok(A.precioKmDeLaFicha(404.3) === 3.5, 'el 2,40 apuntado sin línea no manda');

// 3 · 🛑 los presupuestos de antes NO se tocan: si la ficha cobra km, manda su precio
A = app([['Desplazamiento (399.1 km)', '399', '2.5', '0']]);
A.fijarTarifaKmDeFicha(2.5);
ok(A.precioKmDeLaFicha(404.3) === 2.5, 'con su línea, el precio de la ficha (lo bajó él)');
A = app([['Desplazamiento (30.0 km)', '30', '2', '0']]);
A.fijarTarifaKmDeFicha(undefined);
ok(A.precioKmDeLaFicha(30) === 2, 'una ficha vieja sin tarifa apuntada, la de su propia línea');

// 4 · una línea «SIN CARGO» no cobra nada: tampoco fija precio
A = app([['Desplazamiento (12.0 km) - SIN CARGO', '0', '0', '0']]);
A.fijarTarifaKmDeFicha(2.4);
ok(A.precioKmDeLaFicha(404.3) === 3.5, 'SIN CARGO no fija precio');

// 5 · en cuanto entra la línea, eso es lo que se apunta en la ficha
A = app([['Desplazamiento (404.3 km)', '404', '3.50', '0']]);
A.soltarTarifaKm();
ok(A.tarifaKmParaGuardar() === 3.5, 'se apunta el precio de la línea');

ok(/if \(!lineaKmQueCobra\(\)\) \{ soltarTarifaKm\(\); return; \}/.test(H), 'el candado mira primero si la ficha cobra km');
ok(/var APP_VERSION = 'v(\d+)'/.test(H) && Number(/var APP_VERSION = 'v(\d+)'/.exec(H)[1]) >= 679, 'versión v679 o más');
console.log('km-sin-linea-tarifa-de-hoy: ' + n + '/' + n + ' ✅');
