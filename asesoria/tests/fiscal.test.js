'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/fiscal');

test('valida NIF, NIE y CIF', () => {
  assert.ok(F.validarNIF('12345678Z'));
  assert.ok(!F.validarNIF('12345678A'));
  assert.ok(F.validarNIF('X1234567L'));
  assert.ok(F.validarNIF('B-12345674'));
  assert.ok(!F.validarNIF('B12345670'));
  assert.ok(F.validarNIF('ES12345678Z'));
  assert.ok(!F.validarNIF(''));
});

test('calendario: plazos y fin de semana', () => {
  const c = { tipo: 'autonomo', iva: 1, retiene: 1, alquiler: 0 };
  const cal = F.generarCalendario(c, 2026, {});
  const de = (m, p) => cal.find((o) => o.modelo === m && o.periodo === p).vence;
  assert.equal(de('303', '1T'), '2026-04-20');
  assert.equal(de('303', '3T'), '2026-10-20');
  assert.equal(de('303', '4T'), '2027-02-01'); // 30 de enero de 2027 es sábado
  assert.equal(de('130', '2T'), '2026-07-20');
  assert.equal(de('347', '0A'), '2027-03-01'); // 28 de febrero de 2027 es domingo
  assert.ok(!cal.some((o) => o.modelo === '115'));
  assert.ok(!cal.some((o) => o.modelo === '200'));
  const soc = F.generarCalendario({ tipo: 'sociedad', iva: 1 }, 2026, { dia_trimestre: 25 });
  assert.equal(soc.find((o) => o.modelo === '303' && o.periodo === '2T').vence, '2026-07-27'); // 25 de julio es sábado
  assert.ok(soc.some((o) => o.modelo === '200') && !soc.some((o) => o.modelo === '130'));
  assert.equal(F.codigoModelo('111', { territorio: 'bizkaia' }), '110');
});

const fac = (tipo, fecha, base, iva, ret = 0, extra = {}) => ({ tipo, fecha, base, cuota_iva: base * iva / 100, retencion: ret, total: base + base * iva / 100 - ret, deducible: 1, categoria: 'otros', contraparte_nif: 'B12345674', contraparte_nombre: 'Proveedor', ...extra });

test('303: resultado y compensación de trimestres negativos', () => {
  const fs = [
    fac('emitida', '2026-02-10', 1000, 21), fac('recibida', '2026-03-05', 3000, 21), // 1T: 210 - 630 = -420
    fac('emitida', '2026-05-10', 5000, 21), fac('recibida', '2026-06-01', 1000, 21, 0, { deducible: 0 }), // 2T: 1050, compensa 420
  ];
  const t1 = F.calcular303(fs, 2026, 1);
  assert.equal(t1.resultado, -420); assert.equal(t1.sentido, 'a compensar');
  const t2 = F.calcular303(fs, 2026, 2);
  assert.equal(t2.iva_deducible, 0); assert.equal(t2.compensacion_anterior, 420); assert.equal(t2.resultado, 630);
  assert.equal(F.calcular303(fs, 2026, 3).resultado, 0);
});

test('130: acumulado, retenciones y pagos anteriores', () => {
  const fs = [
    fac('emitida', '2026-01-15', 10000, 21), fac('recibida', '2026-02-01', 2000, 21), // 1T: rendimiento 8000 -> 1600
    fac('emitida', '2026-04-15', 5000, 21, 750), // 2T: acumulado 13000 -> 2600 - 750 - 1600 = 250
    fac('recibida', '2026-08-01', 20000, 21), // 3T: rendimiento negativo -> 0
  ];
  assert.equal(F.calcular130(fs, 2026, 1).resultado, 1600);
  const t2 = F.calcular130(fs, 2026, 2);
  assert.equal(t2.rendimiento_neto, 13000); assert.equal(t2.pagos_anteriores, 1600); assert.equal(t2.resultado, 250);
  assert.equal(F.calcular130(fs, 2026, 3).resultado, 0);
});

test('111 y 115 separan profesionales y alquiler', () => {
  const fs = [fac('recibida', '2026-02-01', 1000, 21, 150, { categoria: 'profesionales' }), fac('recibida', '2026-02-01', 800, 21, 152, { categoria: 'alquiler', contraparte_nif: '12345678Z' }), fac('recibida', '2026-05-01', 1000, 21, 150)];
  assert.equal(F.calcular111(fs, 2026, 1).resultado, 150);
  assert.equal(F.calcular115(fs, 2026, 1).resultado, 152);
});

test('347: solo terceros por encima del umbral y sin retención', () => {
  const fs = [fac('recibida', '2026-02-01', 2000, 21), fac('recibida', '2026-09-01', 1000, 21), fac('emitida', '2026-03-01', 100, 21, 0, { contraparte_nif: '12345678Z' }), fac('recibida', '2026-03-01', 9000, 21, 1350, { contraparte_nif: 'X1234567L' })];
  const r = F.calcular347(fs, 2026);
  assert.equal(r.terceros.length, 1); assert.equal(r.terceros[0].importe, 3630); assert.equal(r.terceros[0].clave, 'compras');
});

test('comprobaciones de una factura', () => {
  const cliente = { nif: '12345678Z' };
  const buena = { tipo: 'recibida', fecha: '2026-03-01', numero: 'A1', contraparte_nombre: 'Luz SA', contraparte_nif: 'B12345674', base: 100, tipo_iva: 21, cuota_iva: 21, retencion: 0, total: 121 };
  assert.deepEqual(F.comprobarFactura(buena, cliente, '2026-04-01'), []);
  assert.match(F.comprobarFactura({ ...buena, total: 120 }, cliente, '2026-04-01').join(), /no cuadran/);
  assert.match(F.comprobarFactura({ ...buena, contraparte_nif: 'B12345670' }, cliente, '2026-04-01').join(), /NIF/);
  assert.match(F.comprobarFactura({ ...buena, fecha: '2026-05-01' }, cliente, '2026-04-01').join(), /futura/);
  assert.match(F.comprobarFactura({ ...buena, tipo: null }, cliente, '2026-04-01').join(), /emitida o recibida/);
  assert.match(F.comprobarFactura({ ...buena, cuota_iva: 10, total: 110 }, cliente, '2026-04-01').join(), /cuota de IVA/);
  assert.match(F.comprobarFactura({ ...buena, contraparte_nif: '12345678Z' }, cliente, '2026-04-01').join(), /propio cliente/);
});
