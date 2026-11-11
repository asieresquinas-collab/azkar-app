'use strict';
// Flujo completo contra el servidor real, con la IA sustituida por una simulada.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os'); const fs = require('node:fs'); const path = require('node:path');
process.env.DIR_DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'gestoria-'));
const { crearApp } = require('../server');
const F = require('../src/fiscal');

const hoy = F.hoyISO();
const lectura = { clase: 'factura', emisor_nombre: 'Luz SA', emisor_nif: 'B12345674', receptor_nombre: 'Ana', receptor_nif: '12345678Z', numero: 'L-1', fecha: hoy,
  base: 100, tipo_iva: 21, cuota_iva: 21, tipo_irpf: null, retencion: 0, total: 121, categoria: 'suministros', descripcion: 'Electricidad', dudas: [] };
let siguiente = lectura; let respuestaChat = { respuesta: 'El 303 vence pronto.', derivar: false, resumen_para_gestor: '' };
const iaFalsa = { disponible: () => true, extraerFactura: async () => siguiente, responderCliente: async () => respuestaChat, redactarCorreo: async () => ({ asunto: 'a', cuerpo: 'b' }) };

const app = crearApp({ rutaDb: ':memory:', ia: iaFalsa });
let base;
const sesion = () => { let cookie = ''; return async (metodo, url, cuerpo, crudo) => {
  const headers = { 'X-Requested-With': 'gestoria', cookie };
  if (cuerpo !== undefined && !crudo) headers['Content-Type'] = 'application/json';
  const r = await fetch(base + url, { method: metodo, headers, body: crudo ? cuerpo : cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const ct = r.headers.get('content-type') || '';
  return { estado: r.status, d: ct.includes('json') ? await r.json() : await r.text() };
}; };
const admin = sesion(); const cliente = sesion(); const otro = sesion();
const pdf = (n) => Buffer.from('%PDF-1.4 factura ' + n);

test.before(async () => { await new Promise((ok) => app.servidor.listen(0, ok)); base = 'http://127.0.0.1:' + app.servidor.address().port; });
test.after(() => { app.servidor.close(); app.db.close(); });

test('instalación, acceso y permisos', async () => {
  assert.equal((await admin('GET', '/api/panel')).estado, 401);
  assert.equal((await admin('POST', '/api/instalar', { asesoria: 'Asesoría Prueba', nombre: 'Marta', email: 'marta@a.es', clave: 'corta' })).estado, 400);
  assert.equal((await admin('POST', '/api/instalar', { asesoria: 'Asesoría Prueba', nombre: 'Marta', email: 'marta@a.es', clave: 'una-clave-larga' })).estado, 200);
  assert.equal((await otro('POST', '/api/instalar', { asesoria: 'X', nombre: 'X', email: 'x@a.es', clave: 'una-clave-larga' })).estado, 409);
  assert.equal((await otro('POST', '/api/acceso', { email: 'marta@a.es', clave: 'mala-mala-mala' })).estado, 401);
  assert.equal((await admin('GET', '/api/panel')).estado, 200);
  // Sin la cabecera propia, una petición de escritura se rechaza aunque lleve la cookie.
  const r = await fetch(base + '/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 401);
});

test('cliente, calendario e invitación al portal', async () => {
  assert.equal((await admin('POST', '/api/clientes', { nombre: 'Ana Ruiz', nif: '12345678A', tipo: 'autonomo', iva: true })).estado, 400);
  const r = await admin('POST', '/api/clientes', { nombre: 'Ana Ruiz', nif: '12345678Z', tipo: 'autonomo', iva: true, email: 'ana@c.es', cuota_mensual: 60 });
  assert.equal(r.estado, 200);
  await admin('POST', '/api/clientes', { nombre: 'Otro SL', nif: 'B12345674', tipo: 'sociedad', iva: true });
  const obs = (await admin('GET', '/api/obligaciones?cliente=1&todas=1')).d;
  assert.ok(obs.some((o) => o.modelo === '303') && obs.some((o) => o.modelo === '130') && !obs.some((o) => o.modelo === '111'));
  const inv = await admin('POST', '/api/clientes/1/invitar', {});
  const token = inv.d.enlace.split('/').pop();
  assert.equal((await cliente('POST', '/api/invitacion', { token, clave: 'clave-del-cliente' })).estado, 200);
  assert.equal((await otro('POST', '/api/invitacion', { token, clave: 'clave-del-cliente' })).estado, 400); // de un solo uso
  assert.equal((await cliente('GET', '/api/portal')).d.cliente.nombre, 'Ana Ruiz');
});

test('el cliente no puede ver datos de la asesoría ni de otros clientes', async () => {
  for (const u of ['/api/panel', '/api/clientes', '/api/facturas?cliente=2', '/api/correos', '/api/tareas']) assert.equal((await cliente('GET', u)).estado, 403, u);
  await admin('PUT', '/api/documentos/subir?cliente=2&nombre=ajeno.pdf', pdf('ajeno'), true);
  await app.N.encolarDocumento(0);
  const ajeno = (await admin('GET', '/api/documentos?cliente=2')).d[0].id;
  assert.equal((await cliente('GET', `/api/documentos/${ajeno}/archivo`)).estado, 404);
  assert.equal((await cliente('GET', '/api/mensajes?cliente=2')).d.length, 0); // se ignora el parámetro: ve los suyos
  // Aunque pida subir a otro cliente, el documento entra en el suyo.
  siguiente = { ...lectura, numero: 'L-0' };
  const s = await cliente('PUT', '/api/documentos/subir?cliente=2&nombre=mio.pdf', pdf('mio'), true);
  await app.N.encolarDocumento(0);
  assert.equal(app.q.get('SELECT cliente_id FROM documentos WHERE id = ?', s.d.id).cliente_id, 1);
});

test('documento claro: se contabiliza solo y actualiza el borrador del 303', async () => {
  siguiente = lectura;
  const s = await cliente('PUT', '/api/documentos/subir?nombre=luz.pdf', pdf(1), true);
  assert.equal(s.estado, 200);
  await app.N.encolarDocumento(0);
  const d = app.q.get('SELECT * FROM documentos WHERE id = ?', s.d.id);
  assert.equal(d.estado, 'contabilizado'); assert.equal(d.auto, 1);
  const f = app.q.get('SELECT * FROM facturas WHERE documento_id = ?', s.d.id);
  assert.equal(f.tipo, 'recibida'); assert.equal(f.cuenta, '628'); assert.equal(f.contraparte_nif, 'B12345674');
  const { t, ejercicio } = F.trimestreDe(hoy);
  const o = app.q.get("SELECT * FROM obligaciones WHERE cliente_id = 1 AND modelo = '303' AND periodo = ? AND ejercicio = ?", t + 'T', ejercicio);
  assert.equal(JSON.parse(o.datos).iva_deducible, 42); // esta factura y la del test anterior
  assert.equal((await cliente('PUT', '/api/documentos/subir?nombre=luz-otra-vez.pdf', pdf(1), true)).d.repetido, true);
});

test('documento dudoso: va a revisión con sus motivos y lo cierra el gestor', async () => {
  siguiente = { ...lectura, numero: 'L-2', total: 130, dudas: ['El total está tachado'] };
  const s = await cliente('PUT', '/api/documentos/subir?nombre=dudosa.jpg', Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]), true);
  await app.N.encolarDocumento(0);
  const [d] = (await admin('GET', '/api/documentos?estado=revisar')).d.filter((x) => x.id === s.d.id);
  assert.match(d.motivos.join('|'), /no cuadran/); assert.match(d.motivos.join('|'), /tachado/);
  assert.ok(app.q.get('SELECT 1 x FROM tareas WHERE clave = ?', 'doc:' + d.id));
  const mal = await admin('POST', `/api/documentos/${d.id}/contabilizar`, { ...d.propuesta });
  assert.ok(mal.d.avisos.length); // avisa antes de guardar
  const bien = await admin('POST', `/api/documentos/${d.id}/contabilizar`, { ...d.propuesta, total: 121 });
  assert.equal(bien.d.ok, true);
  assert.equal(app.q.get('SELECT estado FROM tareas WHERE clave = ?', 'doc:' + d.id).estado, 'hecha');
  // Factura idéntica a una ya contabilizada: duplicado.
  siguiente = lectura;
  const dup = await cliente('PUT', '/api/documentos/subir?nombre=copia.pdf', pdf('copia'), true);
  await app.N.encolarDocumento(0);
  assert.match(app.q.get('SELECT motivos FROM documentos WHERE id = ?', dup.d.id).motivos, /duplicado/);
  assert.equal((await cliente('PUT', '/api/documentos/subir?nombre=virus.exe', Buffer.from('MZ....'), true)).estado, 415);
});

test('asistente: responde solo o deriva al gestor', async () => {
  assert.equal((await cliente('POST', '/api/mensajes', { texto: '¿Cuándo vence el IVA?' })).estado, 200);
  respuestaChat = { respuesta: 'Se lo paso a tu gestor.', derivar: true, resumen_para_gestor: 'Pregunta si el coche es deducible' };
  await cliente('POST', '/api/mensajes', { texto: '¿Puedo deducir el coche?' });
  assert.equal((await admin('GET', '/api/consultas')).d.length, 1);
  await admin('POST', '/api/mensajes', { cliente: 1, texto: 'Depende del uso; te llamo.' });
  assert.equal((await admin('GET', '/api/consultas')).d.length, 0);
  const ms = (await cliente('GET', '/api/mensajes')).d;
  assert.equal(ms.at(-1).autor, 'gestor');
});

test('rutina: reclama documentación tras cerrar el trimestre, avisa de plazos y emite recibos', async () => {
  await admin('POST', '/api/clientes', { nombre: 'Luis Gil', nif: 'X1234567L', tipo: 'autonomo', iva: true, email: 'luis@c.es', cuota_mensual: 50 });
  const dia = '2027-04-06'; // tras cerrar el 1T de 2027: nadie ha subido nada de ese trimestre
  const r = await app.N.rutina(dia);
  assert.ok(r.recordatorios >= 2 && r.recibos >= 2);
  assert.ok(app.q.get("SELECT 1 x FROM correos WHERE cliente_id = 3 AND tipo = 'recordatorio' AND asunto LIKE '%1º trimestre de 2027%'"));
  assert.equal((await app.N.rutina(dia)).recordatorios, 0); // no insiste el mismo día
  const r2 = await app.N.rutina('2027-04-12'); // a los seis días vuelve a reclamar y ya avisa del plazo del día 20
  assert.ok(r2.recordatorios >= 2 && r2.avisos >= 1);
  assert.ok(app.q.get("SELECT 1 x FROM tareas WHERE titulo LIKE 'Presentar modelo 303 · 1T 2027%'"));
  const a = (await admin('GET', '/api/panel')).d.automatizacion;
  assert.ok(a.total > 0 && a.porcentaje > 0 && a.porcentaje <= 100);
});

test('presentar un modelo cierra su aviso; exportación CSV', async () => {
  const t = app.q.get("SELECT clave FROM tareas WHERE titulo LIKE 'Presentar modelo 303 · 1T 2027%' AND cliente_id = 3");
  const id = Number(t.clave.split(':')[1]);
  assert.equal((await admin('POST', `/api/obligaciones/${id}/estado`, { estado: 'presentado' })).estado, 200);
  assert.equal(app.q.get('SELECT estado FROM tareas WHERE clave = ?', t.clave).estado, 'hecha');
  const csv = await admin('GET', `/api/facturas.csv?cliente=1&ejercicio=${hoy.slice(0, 4)}`);
  assert.match(csv.d, /"B12345674";"Luz SA";100;21;21/);
});
