'use strict';
// Carga datos de EJEMPLO para enseñar la aplicación. Solo funciona sobre una base de datos vacía.
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const { crearApp, cifrar } = require('../server');
const { DIR_ARCHIVOS } = require('./db');
const F = require('./fiscal');

function pdf(lineas) {
  const texto = 'BT /F1 12 Tf 60 780 Td 16 TL ' + lineas.map((l) => `(${l.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '?')}) Tj T*`).join(' ') + ' ET';
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${texto.length} >>\nstream\n${texto}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const pos = [];
  objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 6\n0000000000 65535 f \n${pos.map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

(async () => {
  const { q, N, db } = crearApp();
  if (q.get('SELECT 1 x FROM usuarios LIMIT 1')) { console.error('La base de datos ya tiene datos: la demo solo se carga en una instalación vacía.'); process.exit(1); }
  const clave = process.env.CLAVE_DEMO || crypto.randomBytes(9).toString('base64url');
  q.ajuste('asesoria', 'Asesoría Ejemplo'); q.ajuste('territorio', 'comun');
  const admin = Number(q.run("INSERT INTO usuarios (email, pass_hash, nombre, rol) VALUES ('admin@ejemplo.test', ?, 'Marta Ibarra', 'admin')", cifrar(clave)).lastInsertRowid);
  const gestor = Number(q.run("INSERT INTO usuarios (email, pass_hash, nombre, rol) VALUES ('gestor@ejemplo.test', ?, 'Jon Etxebarria', 'gestor')", cifrar(clave)).lastInsertRowid);

  const hoy = F.hoyISO(); const anio = Number(hoy.slice(0, 4));
  const clientes = [
    ['Ana Ruiz Soler', '12345678Z', 'autonomo', 1, 0, 1, 65, admin], ['Reformas Bidea SL', 'B12345674', 'sociedad', 1, 1, 1, 180, gestor],
    ['Iker Lasa Goñi', 'X1234567L', 'autonomo', 1, 1, 0, 65, gestor], ['Cafetería Arriaga SL', 'B87654321', 'sociedad', 1, 0, 1, 150, admin],
    ['Lucía Prado Vidal', '00000014Z', 'autonomo', 1, 0, 0, 55, gestor],
  ].filter((c) => F.validarNIF(c[1]));
  const proveedores = [['Iberdrola Clientes SAU', 'A95758389', 'suministros', 21], ['Telefónica de España SAU', 'A82018474', 'suministros', 21], ['Inmobiliaria Zabala SL', 'B12345674', 'alquiler', 21],
    ['Papelería Central SL', 'B87654321', 'material_oficina', 21], ['Seguros Norte SA', 'A28000727', 'seguros', 0]].filter((p) => F.validarNIF(p[1]));
  let semilla = 7; const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;

  for (const [nombre, nif, tipo, iva, retiene, alquiler, cuota, g] of clientes) {
    const email = nombre.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '') + '@cliente.test';
    const id = Number(q.run("INSERT INTO clientes (nombre, nif, tipo, email, gestor_id, iva, retiene, alquiler, cuota_mensual, creado) VALUES (?,?,?,?,?,?,?,?,?,?)",
      nombre, nif, tipo, email, g, iva, retiene, alquiler, cuota, `${anio}-01-02 09:00:00`).lastInsertRowid);
    q.run("INSERT INTO usuarios (email, pass_hash, nombre, rol, cliente_id) VALUES (?, ?, ?, 'cliente', ?)", email, cifrar(clave), nombre, id);
    let n = 1;
    for (let m = 1; m <= Number(hoy.slice(5, 7)); m++) {
      const dia = (d) => { const f = `${anio}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return f > hoy ? hoy : f; };
      for (let k = 0; k < 2; k++) {
        const base = F.r2(600 + azar() * 2400); const ret = tipo === 'autonomo' && k === 0 ? F.r2(base * 0.15) : 0;
        N.guardarFactura(id, { tipo: 'emitida', numero: `${anio}-${String(n++).padStart(3, '0')}`, fecha: dia(5 + k * 12), contraparte_nombre: k ? 'Construcciones Urola SL' : 'Talleres Gorbea SA',
          contraparte_nif: k ? 'B12345674' : 'A28000727', base, tipo_iva: 21, cuota_iva: F.r2(base * 0.21), tipo_irpf: ret ? 15 : null, retencion: ret, total: F.r2(base * 1.21 - ret), categoria: 'ventas', descripcion: 'Servicios del mes' });
        q.registrar('documento', 1, id, 'Factura emitida');
      }
      for (const [pn, pnif, cat, tiva] of proveedores) {
        if (cat === 'alquiler' && !alquiler) continue;
        if (pnif === nif || azar() < 0.25) continue;
        const base = F.r2(cat === 'alquiler' ? 700 : 40 + azar() * 260); const ret = cat === 'alquiler' ? F.r2(base * 0.19) : 0;
        N.guardarFactura(id, { tipo: 'recibida', numero: 'F' + Math.floor(azar() * 90000 + 10000), fecha: dia(3 + Math.floor(azar() * 24)), contraparte_nombre: pn, contraparte_nif: pnif, base, tipo_iva: tiva,
          cuota_iva: F.r2(base * tiva / 100), tipo_irpf: ret ? 19 : null, retencion: ret, total: F.r2(base * (1 + tiva / 100) - ret), categoria: cat, descripcion: 'Gasto del mes' });
        q.registrar('documento', azar() < 0.8 ? 1 : 0, id, 'Factura recibida');
      }
    }
    N.asegurarCalendario(q.get('SELECT * FROM clientes WHERE id = ?', id), hoy);
  }

  // Dos documentos esperando revisión, con su archivo.
  const dudosos = [
    [1, 'ticket-gasolinera.pdf', ['ESTACION DE SERVICIO LARRABE SL', 'NIF B87654321', 'Factura simplificada 004-118273', 'Gasoleo A   45,20 L', 'Base 54,96   IVA 21% 11,54', 'TOTAL 66,50 EUR'],
      { tipo: 'recibida', numero: '004-118273', fecha: hoy, contraparte_nombre: 'Estación de Servicio Larrabe SL', contraparte_nif: 'B87654321', base: 54.96, tipo_iva: 21, cuota_iva: 11.54, retencion: 0, total: 66.5, categoria: 'vehiculo', descripcion: 'Gasóleo', deducible: 1 },
      ['La lectura avisa: combustible de un vehículo; el IVA puede ser deducible solo en parte según su uso']],
    [2, 'factura-materiales.pdf', ['SUMINISTROS DE OBRA ARANA SL', 'NIF B1234567?', 'Factura 2291', 'Cliente: Reformas Bidea SL  B12345674', 'Base 1.840,00  IVA 21% 386,40', 'TOTAL 2.236,40 EUR'],
      { tipo: 'recibida', numero: '2291', fecha: hoy, contraparte_nombre: 'Suministros de Obra Arana SL', contraparte_nif: null, base: 1840, tipo_iva: 21, cuota_iva: 386.4, retencion: 0, total: 2236.4, categoria: 'compras', descripcion: 'Materiales de obra', deducible: 1 },
      ['Falta el NIF de la otra parte (importe superior a 400 €)', 'Los importes no cuadran: base + IVA − retención = 2226.40 y el total dice 2236.40']],
  ];
  for (const [cid, nombre, lineas, propuesta, motivos] of dudosos) {
    const buf = pdf(lineas); const ruta = `${cid}/${crypto.randomUUID()}.pdf`;
    fs.mkdirSync(path.join(DIR_ARCHIVOS, String(cid)), { recursive: true }); fs.writeFileSync(path.join(DIR_ARCHIVOS, ruta), buf);
    const id = Number(q.run("INSERT INTO documentos (cliente_id, nombre, ruta, mime, tamano, hash, origen, estado, motivos, propuesta) VALUES (?, ?, ?, 'application/pdf', ?, ?, 'portal', 'revisar', ?, ?)",
      cid, nombre, ruta, buf.length, crypto.createHash('sha256').update(buf).digest('hex'), JSON.stringify(motivos), JSON.stringify(propuesta)).lastInsertRowid);
    N.tareaAuto('doc:' + id, cid, 'Revisar documento: ' + nombre, motivos.join(' · '), F.sumarDias(hoy, 3));
  }
  q.run("INSERT INTO mensajes (cliente_id, autor, texto) VALUES (1, 'cliente', '¿Cuándo tengo que pagar el IVA de este trimestre?')");
  q.run("INSERT INTO mensajes (cliente_id, autor, texto) VALUES (1, 'ia', 'Lo tienes en «Mis impuestos»: ahí aparece el plazo del modelo 303 y el importe provisional, que tu gestor revisa antes de presentarlo.')");
  q.registrar('consulta', 1, 1, 'Plazo del IVA');
  q.run("INSERT INTO mensajes (cliente_id, autor, texto) VALUES (3, 'cliente', 'Me he comprado un portátil de 1.400 €. ¿Me lo puedo deducir entero este trimestre?')");
  q.run("INSERT INTO mensajes (cliente_id, autor, texto, derivado) VALUES (3, 'ia', 'Eso depende de cómo se amortice y del uso que le des, así que se lo paso a tu gestor. Mientras tanto, sube la factura al portal.', 1)");
  q.run("INSERT INTO tareas (cliente_id, titulo, detalle, vence, asignado_a, auto) VALUES (3, 'Responder consulta del cliente', 'Pregunta si puede deducir entero un portátil de 1.400 €', ?, ?, 1)", F.sumarDias(hoy, 1), gestor);

  // Lo que ya venció se da por presentado, para que la demo arranque al día.
  for (const c of q.all('SELECT id FROM clientes')) N.recalcularCliente(c.id, hoy);
  for (const o of q.all("SELECT id, cliente_id, modelo, periodo, ejercicio FROM obligaciones WHERE vence < ?", hoy)) {
    q.run("UPDATE obligaciones SET estado = 'presentado', presentado_en = datetime('now'), presentado_por = ? WHERE id = ?", admin, o.id);
    q.registrar('presentacion', 0, o.cliente_id, `${o.modelo} ${o.periodo} ${o.ejercicio}`);
  }
  const r = await N.rutina(hoy);
  db.close();
  console.log('Datos de ejemplo cargados.', r);
  console.log(`\n  Asesoría:  admin@ejemplo.test   /  ${clave}\n  Gestor:    gestor@ejemplo.test  /  ${clave}\n  Cliente:   ana@cliente.test     /  ${clave}\n\nArranca con:  npm start`);
})();
