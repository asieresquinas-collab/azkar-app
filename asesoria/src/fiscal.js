'use strict';
// Motor fiscal: funciones puras (sin base de datos) para poder probarlas.
// Los importes son BORRADORES de trabajo: el gestor los revisa antes de presentar.

const r2 = (n) => Math.round((Number(n) || 0) * 100 + Number.EPSILON) / 100;

// ---------- NIF / NIE / CIF ----------
const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';

function normalizarNIF(nif) {
  return String(nif || '').toUpperCase().replace(/^ES/, '').replace(/[^A-Z0-9]/g, '');
}

function validarNIF(nifCrudo) {
  const nif = normalizarNIF(nifCrudo);
  if (/^\d{8}[A-Z]$/.test(nif)) return LETRAS_DNI[Number(nif.slice(0, 8)) % 23] === nif[8];
  if (/^[XYZ]\d{7}[A-Z]$/.test(nif)) {
    const n = Number('XYZ'.indexOf(nif[0]) + nif.slice(1, 8));
    return LETRAS_DNI[n % 23] === nif[8];
  }
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(nif)) {
    const d = nif.slice(1, 8);
    let suma = 0;
    for (let i = 0; i < 7; i++) {
      const x = Number(d[i]);
      if (i % 2 === 0) { const y = x * 2; suma += Math.floor(y / 10) + (y % 10); } else suma += x;
    }
    const c = (10 - (suma % 10)) % 10;
    const ctl = nif[8];
    const letra = 'JABCDEFGHI'[c];
    if ('PQRSNW'.includes(nif[0])) return ctl === letra;
    if ('ABEH'.includes(nif[0])) return ctl === String(c);
    return ctl === String(c) || ctl === letra;
  }
  return false;
}

// ---------- Fechas ----------
const iso = (d) => d.toISOString().slice(0, 10);

function hoyISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
}

function trimestreDe(fechaISO) {
  const [a, m] = String(fechaISO).split('-').map(Number);
  return { ejercicio: a, t: Math.ceil(m / 3) };
}

function rangoTrimestre(ejercicio, t) {
  const m0 = (t - 1) * 3;
  const fin = new Date(Date.UTC(ejercicio, m0 + 3, 0));
  return { desde: iso(new Date(Date.UTC(ejercicio, m0, 1))), hasta: iso(fin) };
}

// Si el último día cae en sábado o domingo, pasa al lunes. (Los festivos locales los ajusta el gestor.)
function siguienteHabil(a, mes, dia) {
  const d = new Date(Date.UTC(a, mes - 1, dia));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}

function sumarDias(fechaISO, n) {
  const d = new Date(fechaISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

function diasEntre(aISO, bISO) {
  return Math.round((new Date(bISO + 'T00:00:00Z') - new Date(aISO + 'T00:00:00Z')) / 86400000);
}

// ---------- Catálogo de modelos ----------
const MODELOS = {
  303: 'IVA trimestral',
  130: 'Pago fraccionado IRPF (estimación directa)',
  111: 'Retenciones de trabajo y profesionales',
  115: 'Retenciones de alquileres',
  390: 'Resumen anual de IVA',
  190: 'Resumen anual de retenciones',
  180: 'Resumen anual de retenciones de alquileres',
  347: 'Operaciones con terceros',
  100: 'Renta (IRPF)',
  200: 'Impuesto sobre Sociedades',
  202: 'Pago fraccionado de Sociedades',
};

// Plazos por defecto de territorio común (AEAT). En `ajustes` se pueden cambiar los días límite.
const PLAZOS_DEFECTO = { diaTrimestre: 20, diaCuartoTrimestre: 30, diaAnuales: 31 };

function plazos(ajustes = {}) {
  return {
    diaTrimestre: Number(ajustes.dia_trimestre) || PLAZOS_DEFECTO.diaTrimestre,
    diaCuartoTrimestre: Number(ajustes.dia_cuarto_trimestre) || PLAZOS_DEFECTO.diaCuartoTrimestre,
    diaAnuales: Number(ajustes.dia_anuales) || PLAZOS_DEFECTO.diaAnuales,
  };
}

// En Bizkaia las retenciones de trabajo y profesionales se presentan en el modelo 110.
function codigoModelo(modelo, ajustes = {}) {
  if (ajustes.territorio === 'bizkaia' && String(modelo) === '111') return '110';
  return String(modelo);
}

function modelosCliente(c) {
  const lista = [];
  if (c.iva) lista.push(['303', 'T'], ['390', 'A']);
  if (c.tipo === 'autonomo') lista.push(['130', 'T'], ['100', 'A']);
  if (c.tipo === 'sociedad') lista.push(['200', 'A'], ['202', 'F']);
  if (c.retiene) lista.push(['111', 'T'], ['190', 'A']);
  if (c.alquiler) lista.push(['115', 'T'], ['180', 'A']);
  lista.push(['347', 'A']);
  return lista;
}

// Calendario de obligaciones del ejercicio `ej` (lo devengado en ese año).
function generarCalendario(cliente, ej, ajustes = {}) {
  const p = plazos(ajustes);
  const out = [];
  const venceT = (t) => (t < 4
    ? siguienteHabil(ej, t * 3 + 1, p.diaTrimestre)
    : siguienteHabil(ej + 1, 1, p.diaCuartoTrimestre));
  for (const [modelo, per] of modelosCliente(cliente)) {
    if (per === 'T') {
      for (let t = 1; t <= 4; t++) out.push({ modelo, periodo: t + 'T', vence: venceT(t) });
    } else if (per === 'F') {
      out.push({ modelo, periodo: '1P', vence: siguienteHabil(ej, 4, 20) });
      out.push({ modelo, periodo: '2P', vence: siguienteHabil(ej, 10, 20) });
      out.push({ modelo, periodo: '3P', vence: siguienteHabil(ej, 12, 20) });
    } else {
      let vence;
      if (modelo === '390') vence = siguienteHabil(ej + 1, 1, p.diaCuartoTrimestre);
      else if (modelo === '190' || modelo === '180') vence = siguienteHabil(ej + 1, 1, p.diaAnuales);
      else if (modelo === '347') vence = siguienteHabil(ej + 1, 2, 28);
      else if (modelo === '100') vence = siguienteHabil(ej + 1, 6, 30);
      else if (modelo === '200') vence = siguienteHabil(ej + 1, 7, 25);
      out.push({ modelo, periodo: '0A', vence });
    }
  }
  return out;
}

// ---------- Cálculo de borradores ----------
// `facturas`: todas las del cliente en el ejercicio: {tipo, fecha, base, cuota_iva, retencion, categoria, deducible, contraparte_nif, contraparte_nombre, total}
const delTrim = (fs, ej, t) => {
  const { desde, hasta } = rangoTrimestre(ej, t);
  return fs.filter((f) => f.fecha >= desde && f.fecha <= hasta);
};
const hastaTrim = (fs, ej, t) => fs.filter((f) => f.fecha >= `${ej}-01-01` && f.fecha <= rangoTrimestre(ej, t).hasta);
const suma = (fs, campo) => r2(fs.reduce((s, f) => s + (Number(f[campo]) || 0), 0));

function calcular303(facturas, ej, t) {
  let aCompensar = 0; // cuotas negativas de trimestres anteriores del mismo ejercicio
  let res;
  for (let i = 1; i <= t; i++) {
    const fs = delTrim(facturas, ej, i);
    const em = fs.filter((f) => f.tipo === 'emitida');
    const re = fs.filter((f) => f.tipo === 'recibida' && f.deducible);
    const devengado = suma(em, 'cuota_iva');
    const deducible = suma(re, 'cuota_iva');
    const diferencia = r2(devengado - deducible);
    const compensado = diferencia > 0 ? Math.min(aCompensar, diferencia) : 0;
    const resultado = r2(diferencia - compensado);
    res = {
      base_devengada: suma(em, 'base'), iva_devengado: devengado,
      base_deducible: suma(re, 'base'), iva_deducible: deducible,
      diferencia, compensacion_anterior: r2(compensado), resultado,
      n_emitidas: em.length, n_recibidas: re.length,
    };
    aCompensar = r2(aCompensar - compensado + (resultado < 0 ? -resultado : 0));
  }
  res.sentido = res.resultado > 0 ? 'a ingresar' : res.resultado < 0 ? (t === 4 ? 'a compensar o devolver' : 'a compensar') : 'sin actividad / cero';
  return res;
}

function calcular130(facturas, ej, t) {
  let pagosPrevios = 0;
  let res;
  for (let i = 1; i <= t; i++) {
    const fs = hastaTrim(facturas, ej, i);
    const ingresos = suma(fs.filter((f) => f.tipo === 'emitida'), 'base');
    const gastos = suma(fs.filter((f) => f.tipo === 'recibida' && f.deducible), 'base');
    const rendimiento = r2(ingresos - gastos);
    const cuota = rendimiento > 0 ? r2(rendimiento * 0.2) : 0;
    const retenciones = suma(fs.filter((f) => f.tipo === 'emitida'), 'retencion');
    const resultado = Math.max(0, r2(cuota - retenciones - pagosPrevios));
    res = { ingresos_acumulados: ingresos, gastos_acumulados: gastos, rendimiento_neto: rendimiento,
      veinte_por_ciento: cuota, retenciones_soportadas: retenciones, pagos_anteriores: r2(pagosPrevios), resultado };
    pagosPrevios = r2(pagosPrevios + resultado);
  }
  res.sentido = res.resultado > 0 ? 'a ingresar' : 'cero / negativa';
  return res;
}

function calcular111(facturas, ej, t) {
  const fs = delTrim(facturas, ej, t).filter((f) => f.tipo === 'recibida' && f.categoria !== 'alquiler' && Number(f.retencion) > 0);
  const nifs = new Set(fs.map((f) => f.contraparte_nif || f.contraparte_nombre));
  const resultado = suma(fs, 'retencion');
  return { perceptores: nifs.size, base_retenciones: suma(fs, 'base'), retenciones: resultado, resultado,
    sentido: resultado > 0 ? 'a ingresar' : 'negativa', aviso: 'No incluye nóminas: añádelas si el cliente tiene trabajadores.' };
}

function calcular115(facturas, ej, t) {
  const fs = delTrim(facturas, ej, t).filter((f) => f.tipo === 'recibida' && f.categoria === 'alquiler' && Number(f.retencion) > 0);
  const resultado = suma(fs, 'retencion');
  return { arrendadores: new Set(fs.map((f) => f.contraparte_nif || f.contraparte_nombre)).size,
    base_retenciones: suma(fs, 'base'), retenciones: resultado, resultado, sentido: resultado > 0 ? 'a ingresar' : 'negativa' };
}

function calcular390(facturas, ej) {
  const fs = facturas.filter((f) => f.fecha.startsWith(String(ej)));
  const em = fs.filter((f) => f.tipo === 'emitida');
  const re = fs.filter((f) => f.tipo === 'recibida' && f.deducible);
  const resultado = r2(suma(em, 'cuota_iva') - suma(re, 'cuota_iva'));
  return { base_devengada: suma(em, 'base'), iva_devengado: suma(em, 'cuota_iva'),
    base_deducible: suma(re, 'base'), iva_deducible: suma(re, 'cuota_iva'), resultado, sentido: 'informativo' };
}

const UMBRAL_347 = 3005.06;
function calcular347(facturas, ej) {
  const porTercero = new Map();
  for (const f of facturas) {
    if (!f.fecha.startsWith(String(ej))) continue;
    if (Number(f.retencion) > 0) continue; // las operaciones con retención ya se declaran en el 190/180
    const clave = (f.tipo === 'emitida' ? 'V' : 'C') + '|' + (normalizarNIF(f.contraparte_nif) || f.contraparte_nombre);
    const x = porTercero.get(clave) || { clave: f.tipo === 'emitida' ? 'ventas' : 'compras', nif: f.contraparte_nif, nombre: f.contraparte_nombre, importe: 0 };
    x.importe = r2(x.importe + Number(f.total));
    porTercero.set(clave, x);
  }
  const terceros = [...porTercero.values()].filter((x) => Math.abs(x.importe) > UMBRAL_347).sort((a, b) => b.importe - a.importe);
  return { terceros, resultado: terceros.length, sentido: terceros.length ? 'informativo' : 'sin operaciones que declarar' };
}

// Devuelve el borrador de un modelo o null si ese modelo no se calcula solo (100, 200, 202, 190, 180).
function calcularModelo(modelo, periodo, ej, facturas) {
  const t = Number(periodo[0]);
  switch (String(modelo)) {
    case '303': return calcular303(facturas, ej, t);
    case '130': return calcular130(facturas, ej, t);
    case '111': return calcular111(facturas, ej, t);
    case '115': return calcular115(facturas, ej, t);
    case '390': return calcular390(facturas, ej);
    case '347': return calcular347(facturas, ej);
    default: return null;
  }
}

// Fin del periodo al que se refiere una obligación (a partir de ahí ya se puede calcular el borrador definitivo).
function finPeriodo(periodo, ej) {
  if (/^[1-4]T$/.test(periodo)) return rangoTrimestre(ej, Number(periodo[0])).hasta;
  if (periodo === '1P') return `${ej}-03-31`;
  if (periodo === '2P') return `${ej}-09-30`;
  if (periodo === '3P') return `${ej}-11-30`;
  return `${ej}-12-31`;
}

// ---------- Contabilidad ----------
const CATEGORIAS = {
  ventas: ['705', 'Prestaciones de servicios / ventas'],
  compras: ['600', 'Compras de mercaderías'],
  alquiler: ['621', 'Arrendamientos y cánones'],
  reparaciones: ['622', 'Reparaciones y conservación'],
  profesionales: ['623', 'Servicios de profesionales independientes'],
  transporte: ['624', 'Transportes'],
  seguros: ['625', 'Primas de seguros'],
  bancarios: ['626', 'Servicios bancarios'],
  publicidad: ['627', 'Publicidad y relaciones públicas'],
  suministros: ['628', 'Suministros'],
  vehiculo: ['629', 'Otros servicios (vehículo y combustible)'],
  restauracion: ['629', 'Otros servicios (dietas y restauración)'],
  material_oficina: ['629', 'Otros servicios (material de oficina)'],
  software: ['629', 'Otros servicios (software y suscripciones)'],
  inmovilizado: ['217', 'Inmovilizado material'],
  otros: ['629', 'Otros servicios'],
};
const cuentaDe = (categoria, tipo) => (tipo === 'emitida' ? '705' : (CATEGORIAS[categoria] || CATEGORIAS.otros)[0]);

// Comprobaciones deterministas de una factura. Devuelve la lista de motivos por los que NO se puede contabilizar sola.
function comprobarFactura(f, cliente, hoy = hoyISO()) {
  const m = [];
  const num = (x) => Number(x) || 0;
  if (!f.tipo || !['emitida', 'recibida'].includes(f.tipo)) m.push('No se sabe si es emitida o recibida');
  if (!f.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(f.fecha) || Number.isNaN(Date.parse(f.fecha))) m.push('Fecha ilegible');
  else {
    if (f.fecha > hoy) m.push('Fecha futura');
    if (diasEntre(f.fecha, hoy) > 4 * 366) m.push('Fecha de hace más de cuatro años');
  }
  if (!f.numero && f.tipo === 'emitida') m.push('Falta el número de factura');
  if (!f.contraparte_nombre) m.push('Falta el nombre de la otra parte');
  if (f.contraparte_nif && !validarNIF(f.contraparte_nif)) m.push('NIF de la otra parte no válido: ' + f.contraparte_nif);
  if (!f.contraparte_nif && Math.abs(num(f.total)) > 400) m.push('Falta el NIF de la otra parte (importe superior a 400 €)');
  if (!(Math.abs(num(f.total)) > 0)) m.push('Importe total ilegible o cero');
  const esperado = r2(num(f.base) + num(f.cuota_iva) - num(f.retencion));
  if (Math.abs(esperado - num(f.total)) > 0.02) m.push(`Los importes no cuadran: base + IVA − retención = ${esperado.toFixed(2)} y el total dice ${num(f.total).toFixed(2)}`);
  if (f.tipo_iva != null && f.tipo_iva !== '' && num(f.base) !== 0) {
    if (![0, 4, 5, 7.5, 10, 21].includes(num(f.tipo_iva))) m.push('Tipo de IVA no habitual: ' + f.tipo_iva + ' %');
    else if (Math.abs(r2(num(f.base) * num(f.tipo_iva) / 100) - num(f.cuota_iva)) > 0.05) m.push('La cuota de IVA no corresponde al tipo indicado');
  }
  if (cliente && f.contraparte_nif && normalizarNIF(f.contraparte_nif) === normalizarNIF(cliente.nif)) m.push('La otra parte es el propio cliente');
  return m;
}

module.exports = {
  r2, normalizarNIF, validarNIF, hoyISO, trimestreDe, rangoTrimestre, siguienteHabil, sumarDias, diasEntre,
  MODELOS, codigoModelo, modelosCliente, generarCalendario, calcular303, calcular130, calcular111, calcular115,
  calcular390, calcular347, calcularModelo, finPeriodo, CATEGORIAS, cuentaDe, comprobarFactura, UMBRAL_347,
};
