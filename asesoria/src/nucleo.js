'use strict';
// Lógica de negocio: lo que la aplicación hace sola.
const fs = require('node:fs');
const path = require('node:path');
const F = require('./fiscal');
const ia = require('./ia');
const { DIR_ARCHIVOS } = require('./db');

function crear(q, opciones = {}) {
  const IA = opciones.ia || ia;
  const N = {};

  // ---------- Correos ----------
  // Se guardan siempre (y el cliente los ve en su portal). Se envían por correo si hay RESEND_API_KEY y CORREO_REMITENTE.
  N.encolarCorreo = (clienteId, asunto, cuerpo, tipo, dia) => {
    const c = clienteId ? q.get('SELECT email FROM clientes WHERE id = ?', clienteId) : null;
    const r = q.run("INSERT INTO correos (cliente_id, para, asunto, cuerpo, tipo, creado) VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))",
      clienteId ?? null, c?.email || null, asunto, cuerpo, tipo, dia ? dia + ' 08:00:00' : null);
    return Number(r.lastInsertRowid);
  };

  N.enviarCorreos = async () => {
    const pendientes = q.all("SELECT * FROM correos WHERE estado = 'pendiente' ORDER BY id LIMIT 50");
    const clave = process.env.RESEND_API_KEY; const de = process.env.CORREO_REMITENTE;
    for (const m of pendientes) {
      if (!clave || !de || !m.para) {
        q.run("UPDATE correos SET estado = 'solo_portal', error = ? WHERE id = ?", !m.para ? 'El cliente no tiene correo' : 'Envío de correo no configurado', m.id);
        continue;
      }
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: 'Bearer ' + clave, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: de, to: [m.para], subject: m.asunto, text: m.cuerpo }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
        q.run("UPDATE correos SET estado = 'enviado', enviado_en = datetime('now'), error = NULL WHERE id = ?", m.id);
      } catch (e) {
        q.run("UPDATE correos SET estado = 'error', error = ? WHERE id = ?", String(e.message).slice(0, 300), m.id);
      }
    }
  };

  // ---------- Tareas ----------
  N.tareaAuto = (clave, clienteId, titulo, detalle, vence) => {
    const c = clienteId ? q.get('SELECT gestor_id FROM clientes WHERE id = ?', clienteId) : null;
    q.run('INSERT OR IGNORE INTO tareas (clave, cliente_id, titulo, detalle, vence, asignado_a, auto) VALUES (?, ?, ?, ?, ?, ?, 1)',
      clave, clienteId ?? null, titulo, detalle ?? null, vence ?? null, c?.gestor_id ?? null);
  };
  N.cerrarTareaClave = (clave) => q.run("UPDATE tareas SET estado = 'hecha', cerrado = datetime('now') WHERE clave = ? AND estado = 'abierta'", clave);

  // ---------- Documentos ----------
  // Convierte la lectura de la IA en una propuesta de asiento desde el punto de vista del cliente.
  N.propuestaDesdeLectura = (x, c) => {
    const nifC = F.normalizarNIF(c.nif);
    const emisorEsCliente = x.emisor_nif && F.normalizarNIF(x.emisor_nif) === nifC;
    const receptorEsCliente = x.receptor_nif && F.normalizarNIF(x.receptor_nif) === nifC;
    let tipo = null;
    if (emisorEsCliente && !receptorEsCliente) tipo = 'emitida';
    else if (receptorEsCliente && !emisorEsCliente) tipo = 'recibida';
    else if (x.clase === 'ticket') tipo = 'recibida'; // un ticket simplificado no lleva receptor
    const otra = tipo === 'emitida' ? [x.receptor_nombre, x.receptor_nif] : [x.emisor_nombre, x.emisor_nif];
    const categoria = tipo === 'emitida' ? 'ventas' : (x.categoria === 'ventas' ? 'otros' : x.categoria);
    return {
      tipo, numero: x.numero, fecha: x.fecha, contraparte_nombre: otra[0], contraparte_nif: otra[1] ? F.normalizarNIF(otra[1]) : null,
      base: x.base, tipo_iva: x.tipo_iva, cuota_iva: x.cuota_iva ?? 0, tipo_irpf: x.tipo_irpf, retencion: Math.abs(x.retencion ?? 0),
      total: x.total, categoria, descripcion: x.descripcion, deducible: 1,
    };
  };

  N.duplicada = (clienteId, f, exceptoId) => q.get(
    `SELECT id FROM facturas WHERE cliente_id = ? AND tipo = ? AND ABS(total - ?) < 0.005 AND fecha = ?
     AND COALESCE(numero, '') = COALESCE(?, '') AND COALESCE(contraparte_nif, contraparte_nombre, '') = COALESCE(?, ?, '') AND id != ?`,
    clienteId, f.tipo, Number(f.total) || 0, f.fecha, f.numero ?? null, f.contraparte_nif ?? null, f.contraparte_nombre ?? null, exceptoId ?? 0);

  N.guardarFactura = (clienteId, f, documentoId, validadaPor) => {
    const n = (x) => F.r2(x);
    const r = q.run(
      `INSERT INTO facturas (cliente_id, documento_id, tipo, numero, fecha, contraparte_nombre, contraparte_nif, base, tipo_iva, cuota_iva,
        tipo_irpf, retencion, total, categoria, cuenta, deducible, descripcion, validada_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      clienteId, documentoId ?? null, f.tipo, f.numero || null, f.fecha, f.contraparte_nombre || null,
      f.contraparte_nif ? F.normalizarNIF(f.contraparte_nif) : null, n(f.base), f.tipo_iva === '' || f.tipo_iva == null ? null : Number(f.tipo_iva),
      n(f.cuota_iva), f.tipo_irpf === '' || f.tipo_irpf == null ? null : Number(f.tipo_irpf), n(f.retencion), n(f.total),
      f.categoria || 'otros', F.cuentaDe(f.categoria, f.tipo), f.deducible === 0 || f.deducible === false ? 0 : 1, f.descripcion || null, validadaPor ?? null);
    return Number(r.lastInsertRowid);
  };

  // Lee un documento con la IA y, si pasa todas las comprobaciones, lo contabiliza sin intervención.
  N.procesarDocumento = async (id) => {
    const d = q.get('SELECT * FROM documentos WHERE id = ?', id);
    if (!d || !['pendiente', 'error'].includes(d.estado)) return;
    const c = q.get('SELECT * FROM clientes WHERE id = ?', d.cliente_id);
    const aRevision = (motivos, propuesta) => {
      q.run("UPDATE documentos SET estado = 'revisar', motivos = ?, propuesta = ? WHERE id = ?", JSON.stringify(motivos), propuesta ? JSON.stringify(propuesta) : null, id);
      N.tareaAuto('doc:' + id, d.cliente_id, 'Revisar documento: ' + d.nombre, motivos.join(' · '), F.sumarDias(F.hoyISO(), 3));
    };
    if (!IA.disponible()) return aRevision(['Lectura automática no configurada: hay que introducir los datos a mano']);
    q.run("UPDATE documentos SET estado = 'procesando' WHERE id = ?", id);
    let x;
    try {
      x = await IA.extraerFactura(fs.readFileSync(path.join(DIR_ARCHIVOS, d.ruta)), d.mime, c);
    } catch (e) {
      q.run("UPDATE documentos SET estado = 'error', motivos = ? WHERE id = ?", JSON.stringify([String(e.message).slice(0, 300)]), id);
      return;
    }
    if (x.clase === 'otro') return aRevision(['No parece una factura ni un ticket: ' + (x.descripcion || 'documento sin clasificar')]);
    const p = N.propuestaDesdeLectura(x, c);
    const motivos = F.comprobarFactura(p, c);
    for (const duda of x.dudas || []) motivos.push('La lectura avisa: ' + duda);
    if (p.fecha && p.tipo && N.duplicada(d.cliente_id, p)) motivos.push('Posible duplicado de una factura ya contabilizada');
    if (motivos.length) return aRevision(motivos, p);
    q.tx(() => {
      N.guardarFactura(d.cliente_id, p, id, null);
      q.run("UPDATE documentos SET estado = 'contabilizado', auto = 1, motivos = NULL, propuesta = ? WHERE id = ?", JSON.stringify(p), id);
      q.registrar('documento', 1, d.cliente_id, d.nombre);
    });
    N.recalcularCliente(d.cliente_id);
  };

  // Cola en serie para no lanzar muchas lecturas a la vez.
  let cola = Promise.resolve();
  N.encolarDocumento = (id) => { cola = cola.then(() => N.procesarDocumento(id)).catch((e) => console.error('[documento]', id, e)); return cola; };

  // ---------- Impuestos ----------
  N.asegurarCalendario = (c, hoy) => {
    const aj = q.ajustes();
    const anio = Number(hoy.slice(0, 4));
    const alta = Number(String(c.creado || hoy).slice(0, 4));
    for (const ej of [anio - 1, anio]) {
      if (ej < alta - 1) continue;
      for (const o of F.generarCalendario(c, ej, aj)) {
        if (ej === anio - 1 && o.vence < F.sumarDias(hoy, -30)) continue; // lo ya vencido del año anterior no se crea
        q.run('INSERT OR IGNORE INTO obligaciones (cliente_id, modelo, ejercicio, periodo, vence) VALUES (?, ?, ?, ?, ?)', c.id, o.modelo, ej, o.periodo, o.vence);
      }
    }
  };

  // Recalcula los borradores de las obligaciones no presentadas de un cliente.
  N.recalcularCliente = (clienteId, hoy = F.hoyISO()) => {
    const obs = q.all("SELECT * FROM obligaciones WHERE cliente_id = ? AND estado IN ('pendiente', 'borrador')", clienteId);
    const porEj = new Map();
    for (const o of obs) {
      if (!porEj.has(o.ejercicio)) porEj.set(o.ejercicio, q.all('SELECT * FROM facturas WHERE cliente_id = ? AND fecha BETWEEN ? AND ?', clienteId, o.ejercicio + '-01-01', o.ejercicio + '-12-31'));
      const datos = F.calcularModelo(o.modelo, o.periodo, o.ejercicio, porEj.get(o.ejercicio));
      if (!datos) continue;
      const cerrado = F.finPeriodo(o.periodo, o.ejercicio) < hoy;
      const estado = cerrado ? 'borrador' : 'pendiente';
      q.run("UPDATE obligaciones SET datos = ?, importe = ?, estado = ?, calculado_en = datetime('now') WHERE id = ?", JSON.stringify(datos), o.modelo === '347' ? null : datos.resultado, estado, o.id);
      if (cerrado && o.estado === 'pendiente') q.registrar('borrador_modelo', 1, clienteId, `${o.modelo} ${o.periodo} ${o.ejercicio}`);
    }
  };

  // ---------- Expediente (lo que ve el asistente y el portal) ----------
  N.expediente = (clienteId, hoy = F.hoyISO()) => {
    const c = q.get('SELECT * FROM clientes WHERE id = ?', clienteId);
    const aj = q.ajustes();
    const { ejercicio, t } = F.trimestreDe(hoy);
    const rango = F.rangoTrimestre(ejercicio, t);
    const proximas = q.all("SELECT modelo, periodo, ejercicio, vence, estado, importe, datos FROM obligaciones WHERE cliente_id = ? AND estado != 'presentado' AND vence >= ? ORDER BY vence LIMIT 8", clienteId, F.sumarDias(hoy, -15));
    const docs = q.get("SELECT COUNT(*) n, SUM(estado = 'revisar') revisar FROM documentos WHERE cliente_id = ? AND date(subido_en) >= ?", clienteId, rango.desde);
    const fact = q.get("SELECT SUM(tipo = 'emitida') emitidas, SUM(tipo = 'recibida') recibidas FROM facturas WHERE cliente_id = ? AND fecha BETWEEN ? AND ?", clienteId, rango.desde, rango.hasta);
    return {
      hoy, asesoria: aj.asesoria || 'la asesoría',
      cliente: { nombre: c.nombre, tipo: c.tipo, sujeto_a_iva: !!c.iva },
      trimestre_en_curso: `${t}T ${ejercicio}`,
      documentos_subidos_este_trimestre: docs.n, documentos_pendientes_de_revisar_por_el_gestor: docs.revisar || 0,
      facturas_contabilizadas_este_trimestre: { emitidas: fact.emitidas || 0, recibidas: fact.recibidas || 0 },
      proximas_obligaciones: proximas.map((o) => ({
        modelo: F.codigoModelo(o.modelo, aj), que_es: F.MODELOS[o.modelo], periodo: `${o.periodo} ${o.ejercicio}`, vence: o.vence,
        estado: o.estado, importe_provisional: o.importe, sentido: o.datos ? JSON.parse(o.datos).sentido : null,
      })),
    };
  };

  // ---------- Asistente del portal ----------
  N.mensajeCliente = async (clienteId, usuarioId, texto) => {
    q.run("INSERT INTO mensajes (cliente_id, autor, usuario_id, texto) VALUES (?, 'cliente', ?, ?)", clienteId, usuarioId, texto);
    let r = null;
    if (IA.disponible()) {
      try {
        const historial = q.all("SELECT autor, texto FROM (SELECT * FROM mensajes WHERE cliente_id = ? AND autor != 'sistema' ORDER BY id DESC LIMIT 20) ORDER BY id", clienteId);
        r = await IA.responderCliente(N.expediente(clienteId), historial);
      } catch (e) { console.error('[asistente]', e.message); }
    }
    if (!r) r = { respuesta: 'He pasado tu consulta a tu gestor. Te responderá por aquí en cuanto la vea.', derivar: true, resumen_para_gestor: texto.slice(0, 200) };
    q.run("INSERT INTO mensajes (cliente_id, autor, texto, derivado) VALUES (?, 'ia', ?, ?)", clienteId, r.respuesta, r.derivar ? 1 : 0);
    if (r.derivar) {
      const c = q.get('SELECT gestor_id FROM clientes WHERE id = ?', clienteId);
      q.run("INSERT INTO tareas (cliente_id, titulo, detalle, vence, asignado_a, auto) VALUES (?, 'Responder consulta del cliente', ?, ?, ?, 1)",
        clienteId, r.resumen_para_gestor || texto.slice(0, 200), F.sumarDias(F.hoyISO(), 1), c?.gestor_id ?? null);
    } else q.registrar('consulta', 1, clienteId, texto.slice(0, 120));
    return r;
  };

  // ---------- Rutina periódica ----------
  N.rutina = async (hoy = F.hoyISO()) => {
    const aj = q.ajustes();
    const resumen = { recordatorios: 0, avisos: 0, recibos: 0, documentos: 0 };
    const clientes = q.all('SELECT * FROM clientes WHERE activo = 1');
    for (const c of clientes) {
      N.asegurarCalendario(c, hoy);
      N.recalcularCliente(c.id, hoy);

      // 1) Reclamar documentación: tras cerrar el trimestre, si el cliente no ha subido nada de ese trimestre.
      const act = F.trimestreDe(hoy); // último trimestre cerrado
      const ejercicio = act.t === 1 ? act.ejercicio - 1 : act.ejercicio; const t = act.t === 1 ? 4 : act.t - 1;
      const rango = F.rangoTrimestre(ejercicio, t);
      const trimestral = q.get("SELECT MIN(vence) vence FROM obligaciones WHERE cliente_id = ? AND ejercicio = ? AND periodo = ? AND estado != 'presentado'", c.id, ejercicio, t + 'T');
      if (hoy > rango.hasta && trimestral.vence && hoy <= trimestral.vence) {
        const nDocs = q.get('SELECT COUNT(*) n FROM facturas WHERE cliente_id = ? AND fecha BETWEEN ? AND ?', c.id, rango.desde, rango.hasta).n
          + q.get("SELECT COUNT(*) n FROM documentos WHERE cliente_id = ? AND date(subido_en) >= ? AND estado IN ('pendiente', 'procesando', 'revisar', 'error')", c.id, rango.desde).n;
        const ultimo = q.get("SELECT MAX(date(creado)) f FROM correos WHERE cliente_id = ? AND tipo = 'recordatorio'", c.id).f;
        if (nDocs === 0 && (!ultimo || F.diasEntre(ultimo, hoy) >= 5)) {
          const dias = F.diasEntre(hoy, trimestral.vence);
          const asunto = `Nos faltan tus facturas del ${t}º trimestre de ${ejercicio}`;
          const cuerpo = `Hola, ${c.nombre.split(' ')[0]}:\n\nTodavía no hemos recibido ninguna factura tuya del ${t}º trimestre de ${ejercicio} y el plazo de presentación termina el ${fechaLarga(trimestral.vence)} (quedan ${dias} días).\n\nPuedes subirlas desde tu portal, en "Subir documentos": basta con una foto o el PDF de cada factura emitida y recibida.\n\nSi este trimestre no has tenido actividad, respóndenos por el portal y lo presentamos sin movimientos.\n\n${aj.asesoria || 'Tu asesoría'}`;
          N.encolarCorreo(c.id, asunto, cuerpo, 'recordatorio', hoy);
          q.run("INSERT INTO mensajes (cliente_id, autor, texto) VALUES (?, 'sistema', ?)", c.id, asunto + `. El plazo termina el ${fechaLarga(trimestral.vence)}.`);
          q.registrar('recordatorio', 1, c.id, asunto);
          resumen.recordatorios++;
        }
      }

      // 2) Avisar al gestor de lo que vence en 10 días y sigue sin presentar.
      for (const o of q.all("SELECT * FROM obligaciones WHERE cliente_id = ? AND estado != 'presentado' AND vence BETWEEN ? AND ?", c.id, F.sumarDias(hoy, -30), F.sumarDias(hoy, 10))) {
        const antes = q.get('SELECT id FROM tareas WHERE clave = ?', 'obl:' + o.id);
        N.tareaAuto('obl:' + o.id, c.id, `Presentar modelo ${F.codigoModelo(o.modelo, aj)} · ${o.periodo} ${o.ejercicio}`,
          o.importe != null ? `Borrador: ${o.importe.toFixed(2)} € · vence ${o.vence}` : `Vence ${o.vence}`, o.vence);
        if (!antes) resumen.avisos++;
      }

      // 3) Recibo mensual de honorarios.
      if (c.cuota_mensual > 0) {
        const r = q.run('INSERT OR IGNORE INTO recibos (cliente_id, periodo, importe) VALUES (?, ?, ?)', c.id, hoy.slice(0, 7), c.cuota_mensual);
        if (r.changes) { q.registrar('recibo', 1, c.id, hoy.slice(0, 7)); resumen.recibos++; }
      }
    }
    // 4) Documentos atascados (por ejemplo, tras un reinicio o un fallo de la IA).
    q.run("UPDATE documentos SET estado = 'pendiente' WHERE estado = 'procesando'");
    for (const d of q.all("SELECT id FROM documentos WHERE estado IN ('pendiente', 'error') ORDER BY id LIMIT 40")) { await N.procesarDocumento(d.id); resumen.documentos++; }
    await N.enviarCorreos();
    q.run("DELETE FROM sesiones WHERE expira < datetime('now')");
    q.ajuste('ultima_rutina', new Date().toISOString());
    return resumen;
  };

  // ---------- Indicadores ----------
  N.automatizacion = (dias = 90) => {
    const filas = q.all("SELECT tipo, SUM(auto) auto, COUNT(*) total FROM actividad WHERE cuando >= datetime('now', ?) GROUP BY tipo", `-${dias} days`);
    const auto = filas.reduce((s, f) => s + f.auto, 0); const total = filas.reduce((s, f) => s + f.total, 0);
    return { dias, auto, total, porcentaje: total ? Math.round((auto / total) * 100) : null, por_tipo: filas };
  };

  return N;
}

function fechaLarga(isoF) {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(isoF + 'T00:00:00Z'));
}

module.exports = { crear, fechaLarga };
