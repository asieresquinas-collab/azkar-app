'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { abrir, ayudas, DIR_ARCHIVOS } = require('./src/db');
const F = require('./src/fiscal');
const ia = require('./src/ia');
const nucleo = require('./src/nucleo');

const PUBLICO = path.join(__dirname, 'public');
const MAX_ARCHIVO = 15 * 1024 * 1024;
const MIMES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

class ErrorHTTP extends Error { constructor(estado, msg) { super(msg); this.estado = estado; } }
const fallo = (estado, msg) => { throw new ErrorHTTP(estado, msg); };

// ---------- Contraseñas y sesiones ----------
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function cifrar(clave) {
  const sal = crypto.randomBytes(16);
  return 'scrypt$' + sal.toString('hex') + '$' + crypto.scryptSync(clave, sal, 64).toString('hex');
}
function comprobar(clave, guardado) {
  const [, sal, h] = String(guardado || '').split('$');
  if (!sal || !h) return false;
  const calc = crypto.scryptSync(clave, Buffer.from(sal, 'hex'), 64);
  return crypto.timingSafeEqual(calc, Buffer.from(h, 'hex'));
}
const claveValida = (c) => typeof c === 'string' && c.length >= 10 && c.length <= 200;

function tipoReal(buf) {
  if (buf.subarray(0, 5).toString() === '%PDF-') return ['application/pdf', '.pdf'];
  if (buf[0] === 0xff && buf[1] === 0xd8) return ['image/jpeg', '.jpg'];
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ['image/png', '.png'];
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return ['image/webp', '.webp'];
  return null;
}

function crearApp(opciones = {}) {
  const db = abrir(opciones.rutaDb);
  const q = ayudas(db);
  const N = nucleo.crear(q, { ia: opciones.ia });
  const IA = opciones.ia || ia;
  const intentos = new Map(); // límite de intentos de acceso por IP + correo

  const personal = ['admin', 'gestor'];
  const rutas = [];
  const ruta = (metodo, patron, roles, fn) => rutas.push({ metodo, re: new RegExp('^' + patron.replace(/:(\w+)/g, '(?<$1>\\d+)') + '$'), roles, fn });

  // El cliente del portal solo puede tocar su propio expediente.
  const clienteDe = (u, pedido) => {
    if (u.rol === 'cliente') return u.cliente_id;
    const id = Number(pedido);
    if (!id || !q.get('SELECT id FROM clientes WHERE id = ?', id)) fallo(404, 'Cliente no encontrado');
    return id;
  };
  const publico = (u) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, cliente_id: u.cliente_id });

  function abrirSesion(res, usuarioId, segura) {
    const token = crypto.randomBytes(32).toString('base64url');
    q.run("INSERT INTO sesiones (token_hash, usuario_id, expira) VALUES (?, ?, datetime('now', '+14 days'))", sha(token), usuarioId);
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1209600${segura ? '; Secure' : ''}`);
  }

  // ---------- Instalación y acceso ----------
  ruta('GET', '/api/estado', null, (c) => ({
    instalado: !!q.get('SELECT 1 x FROM usuarios LIMIT 1'), usuario: c.u ? publico(c.u) : null,
    asesoria: q.ajustes().asesoria || null, ia: IA.disponible(), pide_codigo: !!process.env.CODIGO_INSTALACION,
  }));

  ruta('POST', '/api/instalar', null, (c) => {
    if (q.get('SELECT 1 x FROM usuarios LIMIT 1')) fallo(409, 'La aplicación ya está instalada');
    const { asesoria, nombre, email, clave, codigo } = c.body;
    if (process.env.CODIGO_INSTALACION && codigo !== process.env.CODIGO_INSTALACION) fallo(403, 'Código de instalación incorrecto');
    if (!asesoria || !nombre || !/^\S+@\S+\.\S+$/.test(email || '')) fallo(400, 'Faltan datos');
    if (!claveValida(clave)) fallo(400, 'La contraseña debe tener al menos 10 caracteres');
    const r = q.run("INSERT INTO usuarios (email, pass_hash, nombre, rol) VALUES (?, ?, ?, 'admin')", email.toLowerCase().trim(), cifrar(clave), nombre.trim());
    q.ajuste('asesoria', asesoria.trim()); q.ajuste('territorio', 'comun');
    abrirSesion(c.res, Number(r.lastInsertRowid), c.segura);
    return { ok: true };
  });

  ruta('POST', '/api/acceso', null, (c) => {
    const email = String(c.body.email || '').toLowerCase().trim();
    const k = c.ip + '|' + email; const ahora = Date.now();
    const it = intentos.get(k) || { n: 0, hasta: 0 };
    if (it.hasta > ahora) fallo(429, 'Demasiados intentos. Espera unos minutos.');
    const u = q.get('SELECT * FROM usuarios WHERE email = ? AND activo = 1', email);
    if (!u || !u.pass_hash || !comprobar(String(c.body.clave || ''), u.pass_hash)) {
      it.n++; if (it.n >= 5) { it.hasta = ahora + 10 * 60000; it.n = 0; }
      intentos.set(k, it);
      fallo(401, 'Correo o contraseña incorrectos');
    }
    intentos.delete(k);
    abrirSesion(c.res, u.id, c.segura);
    return { usuario: publico(u) };
  });

  ruta('POST', '/api/salir', null, (c) => {
    if (c.token) q.run('DELETE FROM sesiones WHERE token_hash = ?', sha(c.token));
    c.res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return { ok: true };
  });

  ruta('POST', '/api/invitacion', null, (c) => {
    const u = q.get("SELECT * FROM usuarios WHERE invitacion_hash = ? AND invitacion_expira > datetime('now') AND activo = 1", sha(String(c.body.token || '')));
    if (!u) fallo(400, 'El enlace no es válido o ha caducado. Pide uno nuevo a tu asesoría.');
    if (!claveValida(c.body.clave)) fallo(400, 'La contraseña debe tener al menos 10 caracteres');
    q.run('UPDATE usuarios SET pass_hash = ?, invitacion_hash = NULL, invitacion_expira = NULL WHERE id = ?', cifrar(c.body.clave), u.id);
    q.run('DELETE FROM sesiones WHERE usuario_id = ?', u.id);
    abrirSesion(c.res, u.id, c.segura);
    return { ok: true };
  });

  function invitar(usuarioId, base) {
    const token = crypto.randomBytes(24).toString('base64url');
    q.run("UPDATE usuarios SET invitacion_hash = ?, invitacion_expira = datetime('now', '+7 days') WHERE id = ?", sha(token), usuarioId);
    return `${base}/#/invitacion/${token}`;
  }

  // ---------- Panel ----------
  ruta('GET', '/api/panel', personal, (c) => {
    const hoy = F.hoyISO(); const aj = q.ajustes();
    const mio = c.u.rol === 'gestor' ? c.u.id : null;
    return {
      automatizacion: N.automatizacion(90),
      clientes: q.get('SELECT COUNT(*) n FROM clientes WHERE activo = 1').n,
      por_revisar: q.get("SELECT COUNT(*) n FROM documentos WHERE estado = 'revisar'").n,
      con_error: q.get("SELECT COUNT(*) n FROM documentos WHERE estado = 'error'").n,
      consultas: q.get("SELECT COUNT(DISTINCT cliente_id) n FROM mensajes WHERE derivado = 1 AND atendido = 0").n,
      tareas: q.get("SELECT COUNT(*) n FROM tareas WHERE estado = 'abierta' AND (? IS NULL OR asignado_a = ? OR asignado_a IS NULL)", mio, mio).n,
      vencimientos: q.all(`SELECT o.id, o.modelo, o.periodo, o.ejercicio, o.vence, o.estado, o.importe, c.nombre cliente, c.id cliente_id
        FROM obligaciones o JOIN clientes c ON c.id = o.cliente_id WHERE o.estado != 'presentado' AND c.activo = 1 AND o.vence <= ? ORDER BY o.vence LIMIT 40`, F.sumarDias(hoy, 30))
        .map((o) => ({ ...o, codigo: F.codigoModelo(o.modelo, aj), dias: F.diasEntre(hoy, o.vence) })),
      ultima_rutina: aj.ultima_rutina || null, ia: IA.disponible(), hoy,
    };
  });

  ruta('POST', '/api/rutina', personal, async () => N.rutina());

  // ---------- Clientes ----------
  const camposCliente = (b) => {
    const nif = F.normalizarNIF(b.nif);
    if (!b.nombre || !String(b.nombre).trim()) fallo(400, 'Falta el nombre');
    if (!F.validarNIF(nif)) fallo(400, 'El NIF no es válido');
    if (!['autonomo', 'sociedad'].includes(b.tipo)) fallo(400, 'Tipo de cliente no válido');
    if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) fallo(400, 'Correo no válido');
    return [String(b.nombre).trim(), nif, b.tipo, b.email ? String(b.email).toLowerCase().trim() : null, b.telefono || null,
      Number(b.gestor_id) || null, b.iva ? 1 : 0, b.retiene ? 1 : 0, b.alquiler ? 1 : 0, Math.max(0, Number(b.cuota_mensual) || 0), b.notas || null];
  };

  ruta('GET', '/api/clientes', personal, () => q.all(`SELECT c.*, u.nombre gestor,
      (SELECT COUNT(*) FROM documentos d WHERE d.cliente_id = c.id AND d.estado = 'revisar') por_revisar,
      (SELECT MIN(vence) FROM obligaciones o WHERE o.cliente_id = c.id AND o.estado != 'presentado') proximo
    FROM clientes c LEFT JOIN usuarios u ON u.id = c.gestor_id ORDER BY c.activo DESC, c.nombre`));

  ruta('POST', '/api/clientes', personal, (c) => {
    const v = camposCliente(c.body);
    if (q.get('SELECT 1 x FROM clientes WHERE nif = ?', v[1])) fallo(409, 'Ya existe un cliente con ese NIF');
    const r = q.run('INSERT INTO clientes (nombre, nif, tipo, email, telefono, gestor_id, iva, retiene, alquiler, cuota_mensual, notas) VALUES (?,?,?,?,?,?,?,?,?,?,?)', ...v);
    const id = Number(r.lastInsertRowid);
    N.asegurarCalendario(q.get('SELECT * FROM clientes WHERE id = ?', id), F.hoyISO());
    return { id };
  });

  ruta('GET', '/api/clientes/:id', personal, (c) => {
    const cl = q.get('SELECT * FROM clientes WHERE id = ?', c.p.id) || fallo(404, 'Cliente no encontrado');
    return { cliente: cl, acceso: q.get("SELECT id, email, pass_hash IS NOT NULL activado FROM usuarios WHERE cliente_id = ? AND rol = 'cliente'", cl.id) || null };
  });

  ruta('PUT', '/api/clientes/:id', personal, (c) => {
    const id = clienteDe(c.u, c.p.id);
    const v = camposCliente(c.body);
    if (q.get('SELECT 1 x FROM clientes WHERE nif = ? AND id != ?', v[1], id)) fallo(409, 'Ya existe un cliente con ese NIF');
    q.run('UPDATE clientes SET nombre=?, nif=?, tipo=?, email=?, telefono=?, gestor_id=?, iva=?, retiene=?, alquiler=?, cuota_mensual=?, notas=?, activo=? WHERE id=?', ...v, c.body.activo === false || c.body.activo === 0 ? 0 : 1, id);
    const cl = q.get('SELECT * FROM clientes WHERE id = ?', id);
    // Si cambian sus obligaciones, se quitan las que ya no aplican (solo las no trabajadas) y se crean las nuevas.
    const validos = new Set(F.modelosCliente(cl).map((m) => m[0]));
    for (const o of q.all("SELECT id, modelo FROM obligaciones WHERE cliente_id = ? AND estado = 'pendiente'", id)) if (!validos.has(o.modelo)) q.run('DELETE FROM obligaciones WHERE id = ?', o.id);
    if (cl.activo) { N.asegurarCalendario(cl, F.hoyISO()); N.recalcularCliente(id); }
    return { ok: true };
  });

  ruta('POST', '/api/clientes/:id/invitar', personal, (c) => {
    const cl = q.get('SELECT * FROM clientes WHERE id = ?', c.p.id) || fallo(404, 'Cliente no encontrado');
    if (!cl.email) fallo(400, 'El cliente no tiene correo: añádelo en su ficha');
    let u = q.get("SELECT * FROM usuarios WHERE cliente_id = ? AND rol = 'cliente'", cl.id);
    if (!u) {
      if (q.get('SELECT 1 x FROM usuarios WHERE email = ?', cl.email)) fallo(409, 'Ese correo ya lo usa otro usuario');
      const r = q.run("INSERT INTO usuarios (email, nombre, rol, cliente_id) VALUES (?, ?, 'cliente', ?)", cl.email, cl.nombre, cl.id);
      u = { id: Number(r.lastInsertRowid) };
    }
    const enlace = invitar(u.id, c.base);
    const aj = q.ajustes();
    N.encolarCorreo(cl.id, `Tu acceso al portal de ${aj.asesoria}`, `Hola:\n\nYa puedes entrar en tu portal de cliente para subir facturas, ver tus impuestos y consultarnos dudas.\n\nCrea tu contraseña aquí (el enlace caduca en 7 días):\n${enlace}\n\n${aj.asesoria}`, 'invitacion');
    N.enviarCorreos().catch(() => {});
    return { enlace };
  });

  // ---------- Documentos ----------
  ruta('GET', '/api/documentos', null, (c) => {
    const { cliente, estado } = c.q;
    if (c.u.rol === 'cliente') return q.all('SELECT id, nombre, subido_en, estado FROM documentos WHERE cliente_id = ? ORDER BY id DESC LIMIT 200', c.u.cliente_id);
    return q.all(`SELECT d.id, d.cliente_id, d.nombre, d.mime, d.subido_en, d.estado, d.motivos, d.propuesta, d.auto, d.origen, c.nombre cliente, c.nif cliente_nif
      FROM documentos d JOIN clientes c ON c.id = d.cliente_id WHERE (? IS NULL OR d.cliente_id = ?) AND (? IS NULL OR d.estado = ?) ORDER BY d.id DESC LIMIT 300`,
    cliente || null, cliente || null, estado || null, estado || null).map((d) => ({ ...d, motivos: d.motivos ? JSON.parse(d.motivos) : [], propuesta: d.propuesta ? JSON.parse(d.propuesta) : null }));
  });

  ruta('PUT', '/api/documentos/subir', null, (c) => {
    const clienteId = clienteDe(c.u, c.q.cliente);
    const buf = c.crudo;
    if (!buf || !buf.length) fallo(400, 'Archivo vacío');
    const t = tipoReal(buf) || fallo(415, 'Formato no admitido. Sube un PDF o una foto (JPG, PNG o WEBP).');
    const hash = sha(buf);
    const repetido = q.get("SELECT id FROM documentos WHERE cliente_id = ? AND hash = ? AND estado != 'descartado'", clienteId, hash);
    if (repetido) return { id: repetido.id, repetido: true };
    const nombre = String(c.q.nombre || 'documento').replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 120) || 'documento';
    const rutaRel = `${clienteId}/${crypto.randomUUID()}${t[1]}`;
    fs.mkdirSync(path.join(DIR_ARCHIVOS, String(clienteId)), { recursive: true });
    fs.writeFileSync(path.join(DIR_ARCHIVOS, rutaRel), buf);
    const r = q.run('INSERT INTO documentos (cliente_id, nombre, ruta, mime, tamano, hash, subido_por, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      clienteId, nombre, rutaRel, t[0], buf.length, hash, c.u.id, c.u.rol === 'cliente' ? 'portal' : 'gestor');
    const id = Number(r.lastInsertRowid);
    N.encolarDocumento(id);
    return { id };
  });

  const documento = (c) => {
    const d = q.get('SELECT * FROM documentos WHERE id = ?', c.p.id);
    if (!d || (c.u.rol === 'cliente' && d.cliente_id !== c.u.cliente_id)) fallo(404, 'Documento no encontrado');
    return d;
  };

  ruta('GET', '/api/documentos/:id/archivo', null, (c) => {
    const d = documento(c);
    c.res.writeHead(200, { 'Content-Type': d.mime, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(d.nombre)}`, 'Cache-Control': 'private, max-age=300',
      'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "frame-ancestors 'self'" });
    fs.createReadStream(path.join(DIR_ARCHIVOS, d.ruta)).pipe(c.res);
    return undefined;
  });

  const leerFactura = (b, cl) => {
    const f = { tipo: b.tipo, numero: b.numero, fecha: b.fecha, contraparte_nombre: b.contraparte_nombre, contraparte_nif: b.contraparte_nif,
      base: b.base, tipo_iva: b.tipo_iva, cuota_iva: b.cuota_iva, tipo_irpf: b.tipo_irpf, retencion: b.retencion, total: b.total,
      categoria: F.CATEGORIAS[b.categoria] ? b.categoria : 'otros', descripcion: b.descripcion, deducible: b.deducible === false || b.deducible === 0 ? 0 : 1 };
    if (f.tipo === 'emitida') f.categoria = 'ventas';
    const avisos = F.comprobarFactura(f, cl);
    // Lo que impide guardar aunque el gestor insista:
    const graves = avisos.filter((a) => /emitida o recibida|Fecha ilegible|Importe total/.test(a));
    if (graves.length) fallo(400, graves.join('. '));
    return { f, avisos };
  };

  ruta('POST', '/api/documentos/:id/contabilizar', personal, (c) => {
    const d = documento(c);
    if (!['revisar', 'error', 'pendiente'].includes(d.estado)) fallo(409, 'Este documento ya está ' + d.estado);
    const cl = q.get('SELECT * FROM clientes WHERE id = ?', d.cliente_id);
    const { f, avisos } = leerFactura(c.body, cl);
    if (avisos.length && !c.body.confirmar) return { avisos };
    q.tx(() => {
      N.guardarFactura(d.cliente_id, f, d.id, c.u.id);
      q.run("UPDATE documentos SET estado = 'contabilizado', auto = 0 WHERE id = ?", d.id);
      q.registrar('documento', 0, d.cliente_id, d.nombre);
      N.cerrarTareaClave('doc:' + d.id);
    });
    N.recalcularCliente(d.cliente_id);
    return { ok: true };
  });

  ruta('POST', '/api/documentos/:id/descartar', personal, (c) => {
    const d = documento(c);
    if (d.estado === 'contabilizado') fallo(409, 'Ya está contabilizado: borra antes la factura');
    q.run("UPDATE documentos SET estado = 'descartado' WHERE id = ?", d.id);
    q.registrar('documento', 0, d.cliente_id, 'Descartado: ' + d.nombre);
    N.cerrarTareaClave('doc:' + d.id);
    return { ok: true };
  });

  ruta('POST', '/api/documentos/:id/releer', personal, (c) => {
    const d = documento(c);
    if (!['revisar', 'error'].includes(d.estado)) fallo(409, 'Solo se pueden releer documentos en revisión o con error');
    q.run("UPDATE documentos SET estado = 'pendiente' WHERE id = ?", d.id);
    N.encolarDocumento(d.id);
    return { ok: true };
  });

  // ---------- Facturas (libros registro) ----------
  const filtroFacturas = (c) => {
    const clienteId = clienteDe(c.u, c.q.cliente);
    const ej = Number(c.q.ejercicio) || Number(F.hoyISO().slice(0, 4));
    const t = Number(c.q.t);
    const r = t >= 1 && t <= 4 ? F.rangoTrimestre(ej, t) : { desde: ej + '-01-01', hasta: ej + '-12-31' };
    return q.all('SELECT * FROM facturas WHERE cliente_id = ? AND fecha BETWEEN ? AND ? AND (? IS NULL OR tipo = ?) ORDER BY fecha, id', clienteId, r.desde, r.hasta, c.q.tipo || null, c.q.tipo || null);
  };
  ruta('GET', '/api/facturas', personal, filtroFacturas);
  ruta('GET', '/api/facturas.csv', personal, (c) => {
    const cols = ['tipo', 'fecha', 'numero', 'contraparte_nif', 'contraparte_nombre', 'base', 'tipo_iva', 'cuota_iva', 'tipo_irpf', 'retencion', 'total', 'categoria', 'cuenta', 'deducible', 'descripcion'];
    const celda = (v) => {
      if (v == null) return '';
      if (typeof v === 'number') return String(v).replace('.', ',');
      let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita fórmulas al abrir en Excel
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = '﻿' + [cols.join(';'), ...filtroFacturas(c).map((f) => cols.map((k) => celda(f[k])).join(';'))].join('\r\n');
    c.res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="libro-registro.csv"' });
    c.res.end(csv);
    return undefined;
  });
  ruta('POST', '/api/facturas', personal, (c) => {
    const clienteId = clienteDe(c.u, c.body.cliente_id);
    const { f, avisos } = leerFactura(c.body, q.get('SELECT * FROM clientes WHERE id = ?', clienteId));
    if (N.duplicada(clienteId, f)) avisos.push('Posible duplicado de una factura ya contabilizada');
    if (avisos.length && !c.body.confirmar) return { avisos };
    const id = N.guardarFactura(clienteId, f, null, c.u.id);
    q.registrar('documento', 0, clienteId, 'Factura introducida a mano');
    N.recalcularCliente(clienteId);
    return { id };
  });
  ruta('DELETE', '/api/facturas/:id', personal, (c) => {
    const f = q.get('SELECT * FROM facturas WHERE id = ?', c.p.id) || fallo(404, 'Factura no encontrada');
    q.tx(() => {
      q.run('DELETE FROM facturas WHERE id = ?', f.id);
      if (f.documento_id) q.run("UPDATE documentos SET estado = 'revisar', auto = 0, motivos = ? WHERE id = ?", JSON.stringify(['Factura borrada por un gestor: volver a contabilizar o descartar']), f.documento_id);
    });
    N.recalcularCliente(f.cliente_id);
    return { ok: true };
  });

  // ---------- Impuestos ----------
  ruta('GET', '/api/obligaciones', null, (c) => {
    const aj = q.ajustes(); const hoy = F.hoyISO();
    const cliente = c.u.rol === 'cliente' ? c.u.cliente_id : (Number(c.q.cliente) || null);
    return q.all(`SELECT o.*, c.nombre cliente FROM obligaciones o JOIN clientes c ON c.id = o.cliente_id
      WHERE c.activo = 1 AND (? IS NULL OR o.cliente_id = ?) AND (? = 1 OR o.estado != 'presentado') AND o.vence >= ? ORDER BY o.vence, c.nombre LIMIT 500`,
    cliente, cliente, c.q.todas ? 1 : 0, F.sumarDias(hoy, c.q.todas ? -400 : -60))
      .map((o) => ({ ...o, datos: o.datos ? JSON.parse(o.datos) : null, codigo: F.codigoModelo(o.modelo, aj), nombre_modelo: F.MODELOS[o.modelo], dias: F.diasEntre(hoy, o.vence) }));
  });

  ruta('POST', '/api/obligaciones/:id/estado', personal, (c) => {
    const o = q.get('SELECT * FROM obligaciones WHERE id = ?', c.p.id) || fallo(404, 'No encontrada');
    const { estado } = c.body;
    if (!['pendiente', 'borrador', 'revisado', 'presentado'].includes(estado)) fallo(400, 'Estado no válido');
    if (estado === 'presentado') {
      const imp = c.body.importe === '' || c.body.importe == null ? o.importe : Number(c.body.importe);
      q.run("UPDATE obligaciones SET estado = 'presentado', importe = ?, presentado_en = datetime('now'), presentado_por = ? WHERE id = ?", imp, c.u.id, o.id);
      q.registrar('presentacion', 0, o.cliente_id, `${o.modelo} ${o.periodo} ${o.ejercicio}`);
      N.cerrarTareaClave('obl:' + o.id);
    } else {
      q.run('UPDATE obligaciones SET estado = ?, presentado_en = NULL, presentado_por = NULL WHERE id = ?', estado, o.id);
      if (estado !== 'revisado') N.recalcularCliente(o.cliente_id);
    }
    return { ok: true };
  });

  // ---------- Tareas ----------
  ruta('GET', '/api/tareas', personal, (c) => q.all(`SELECT t.*, c.nombre cliente, u.nombre asignado FROM tareas t LEFT JOIN clientes c ON c.id = t.cliente_id LEFT JOIN usuarios u ON u.id = t.asignado_a
    WHERE t.estado = ? AND (? IS NULL OR t.cliente_id = ?) ORDER BY COALESCE(t.vence, '9999'), t.id LIMIT 300`, c.q.hechas ? 'hecha' : 'abierta', c.q.cliente || null, c.q.cliente || null));
  ruta('POST', '/api/tareas', personal, (c) => {
    if (!c.body.titulo) fallo(400, 'Falta el título');
    const r = q.run('INSERT INTO tareas (cliente_id, titulo, detalle, vence, asignado_a) VALUES (?, ?, ?, ?, ?)', Number(c.body.cliente_id) || null, String(c.body.titulo).slice(0, 200), c.body.detalle || null, c.body.vence || null, Number(c.body.asignado_a) || c.u.id);
    return { id: Number(r.lastInsertRowid) };
  });
  ruta('POST', '/api/tareas/:id/cerrar', personal, (c) => {
    const t = q.get("SELECT * FROM tareas WHERE id = ? AND estado = 'abierta'", c.p.id) || fallo(404, 'Tarea no encontrada');
    q.run("UPDATE tareas SET estado = 'hecha', cerrado = datetime('now'), minutos = ? WHERE id = ?", Number(c.body.minutos) || null, t.id);
    if (!t.auto) q.registrar('tarea_manual', 0, t.cliente_id, t.titulo);
    return { ok: true };
  });

  // ---------- Mensajes ----------
  ruta('GET', '/api/mensajes', null, (c) => {
    const id = clienteDe(c.u, c.q.cliente);
    return q.all('SELECT m.id, m.autor, m.texto, m.derivado, m.creado, u.nombre usuario FROM mensajes m LEFT JOIN usuarios u ON u.id = m.usuario_id WHERE m.cliente_id = ? ORDER BY m.id DESC LIMIT 200', id).reverse();
  });
  ruta('POST', '/api/mensajes', null, async (c) => {
    const id = clienteDe(c.u, c.body.cliente);
    const texto = String(c.body.texto || '').trim().slice(0, 4000);
    if (!texto) fallo(400, 'Mensaje vacío');
    if (c.u.rol === 'cliente') { await N.mensajeCliente(id, c.u.id, texto); return { ok: true }; }
    q.run("INSERT INTO mensajes (cliente_id, autor, usuario_id, texto) VALUES (?, 'gestor', ?, ?)", id, c.u.id, texto);
    const pendientes = q.run('UPDATE mensajes SET atendido = 1 WHERE cliente_id = ? AND derivado = 1 AND atendido = 0', id).changes;
    if (pendientes) q.registrar('consulta', 0, id, 'Respondida por el gestor');
    q.run("UPDATE tareas SET estado = 'hecha', cerrado = datetime('now') WHERE cliente_id = ? AND titulo = 'Responder consulta del cliente' AND estado = 'abierta'", id);
    return { ok: true };
  });
  ruta('GET', '/api/consultas', personal, () => q.all(`SELECT c.id cliente_id, c.nombre cliente, COUNT(*) n, MAX(m.creado) ultimo,
      (SELECT texto FROM mensajes x WHERE x.cliente_id = c.id AND x.autor = 'cliente' ORDER BY x.id DESC LIMIT 1) ultimo_texto
    FROM mensajes m JOIN clientes c ON c.id = m.cliente_id WHERE m.derivado = 1 AND m.atendido = 0 GROUP BY c.id ORDER BY ultimo`));

  // ---------- Correos ----------
  ruta('GET', '/api/correos', personal, (c) => q.all('SELECT m.*, c.nombre cliente FROM correos m LEFT JOIN clientes c ON c.id = m.cliente_id WHERE (? IS NULL OR m.cliente_id = ?) ORDER BY m.id DESC LIMIT 200', c.q.cliente || null, c.q.cliente || null));
  ruta('POST', '/api/correos/redactar', personal, async (c) => {
    const id = clienteDe(c.u, c.body.cliente);
    if (!IA.disponible()) fallo(503, 'La redacción automática necesita la clave de la IA');
    if (!c.body.instruccion) fallo(400, 'Di qué quieres comunicar');
    return IA.redactarCorreo(N.expediente(id), String(c.body.instruccion).slice(0, 2000), q.ajustes().asesoria);
  });
  ruta('POST', '/api/correos', personal, async (c) => {
    const id = clienteDe(c.u, c.body.cliente);
    if (!c.body.asunto || !c.body.cuerpo) fallo(400, 'Faltan el asunto o el texto');
    N.encolarCorreo(id, String(c.body.asunto).slice(0, 200), String(c.body.cuerpo).slice(0, 10000), 'manual');
    await N.enviarCorreos();
    return { ok: true };
  });

  // ---------- Honorarios ----------
  ruta('GET', '/api/recibos', personal, () => q.all('SELECT r.*, c.nombre cliente FROM recibos r JOIN clientes c ON c.id = r.cliente_id ORDER BY r.periodo DESC, c.nombre LIMIT 500'));
  ruta('POST', '/api/recibos/:id/cobrar', personal, (c) => {
    q.run("UPDATE recibos SET estado = CASE estado WHEN 'cobrado' THEN 'emitido' ELSE 'cobrado' END, cobrado_en = CASE estado WHEN 'cobrado' THEN NULL ELSE datetime('now') END WHERE id = ?", c.p.id);
    return { ok: true };
  });

  // ---------- Ajustes y usuarios ----------
  ruta('GET', '/api/ajustes', personal, () => {
    const a = q.ajustes();
    return { asesoria: a.asesoria, territorio: a.territorio || 'comun', dia_trimestre: a.dia_trimestre || '', dia_cuarto_trimestre: a.dia_cuarto_trimestre || '', dia_anuales: a.dia_anuales || '',
      ia: IA.disponible(), modelo_ia: ia.MODELO, correo: !!(process.env.RESEND_API_KEY && process.env.CORREO_REMITENTE), categorias: F.CATEGORIAS };
  });
  ruta('PUT', '/api/ajustes', ['admin'], (c) => {
    const b = c.body;
    if (b.asesoria) q.ajuste('asesoria', String(b.asesoria).slice(0, 120));
    if (['comun', 'bizkaia'].includes(b.territorio)) q.ajuste('territorio', b.territorio);
    for (const k of ['dia_trimestre', 'dia_cuarto_trimestre', 'dia_anuales']) {
      const n = Number(b[k]);
      if (b[k] === '' || b[k] == null) q.run('DELETE FROM ajustes WHERE clave = ?', k); else if (n >= 1 && n <= 31) q.ajuste(k, n);
    }
    // Los plazos cambian: se rehacen los vencimientos de lo que aún no se ha trabajado.
    q.run("DELETE FROM obligaciones WHERE estado = 'pendiente'");
    for (const cl of q.all('SELECT * FROM clientes WHERE activo = 1')) { N.asegurarCalendario(cl, F.hoyISO()); N.recalcularCliente(cl.id); }
    return { ok: true };
  });
  ruta('GET', '/api/usuarios', personal, () => q.all("SELECT id, email, nombre, rol, activo, pass_hash IS NOT NULL activado FROM usuarios WHERE rol != 'cliente' ORDER BY nombre"));
  ruta('POST', '/api/usuarios', ['admin'], (c) => {
    const { nombre, email, rol } = c.body;
    if (!nombre || !/^\S+@\S+\.\S+$/.test(email || '') || !personal.includes(rol)) fallo(400, 'Datos no válidos');
    if (q.get('SELECT 1 x FROM usuarios WHERE email = ?', email.toLowerCase().trim())) fallo(409, 'Ese correo ya existe');
    const r = q.run('INSERT INTO usuarios (email, nombre, rol) VALUES (?, ?, ?)', email.toLowerCase().trim(), nombre.trim(), rol);
    return { enlace: invitar(Number(r.lastInsertRowid), c.base) };
  });
  ruta('POST', '/api/usuarios/:id/activo', ['admin'], (c) => {
    if (Number(c.p.id) === c.u.id) fallo(400, 'No puedes desactivarte a ti mismo');
    q.run('UPDATE usuarios SET activo = ? WHERE id = ?', c.body.activo ? 1 : 0, c.p.id);
    if (!c.body.activo) q.run('DELETE FROM sesiones WHERE usuario_id = ?', c.p.id);
    return { ok: true };
  });

  // ---------- Portal del cliente ----------
  ruta('GET', '/api/portal', ['cliente'], (c) => N.expediente(c.u.cliente_id));

  // ---------- Servidor ----------
  const CABECERAS = {
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  };

  async function leerCuerpo(req, max) {
    const trozos = []; let n = 0;
    for await (const t of req) { n += t.length; if (n > max) fallo(413, 'El archivo supera el tamaño máximo (15 MB)'); trozos.push(t); }
    return Buffer.concat(trozos);
  }

  async function atender(req, res) {
    const url = new URL(req.url, 'http://x');
    for (const [k, v] of Object.entries(CABECERAS)) res.setHeader(k, v);
    if (!url.pathname.startsWith('/api/')) return estatico(url.pathname, res);

    const segura = req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted;
    const c = { req, res, q: Object.fromEntries(url.searchParams), body: {}, segura,
      ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(),
      base: `${segura ? 'https' : 'http'}://${req.headers.host}` };
    c.token = /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie || '')?.[1];
    if (c.token) c.u = q.get("SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ? AND s.expira > datetime('now') AND u.activo = 1", sha(c.token));

    try {
      const r = rutas.find((x) => x.metodo === req.method && x.re.test(url.pathname)) || fallo(404, 'No existe');
      c.p = r.re.exec(url.pathname).groups || {};
      const libre = ['/api/estado', '/api/instalar', '/api/acceso', '/api/salir', '/api/invitacion'].includes(url.pathname);
      if (!libre && !c.u) fallo(401, 'Sesión caducada');
      if (r.roles && !r.roles.includes(c.u.rol)) fallo(403, 'No tienes permiso');
      if (req.method !== 'GET') {
        // La cookie es SameSite=Strict; además se exige una cabecera que un formulario de otro sitio no puede enviar.
        if (req.headers['x-requested-with'] !== 'gestoria') fallo(403, 'Petición no permitida');
        if (url.pathname === '/api/documentos/subir') c.crudo = await leerCuerpo(req, MAX_ARCHIVO);
        else {
          const txt = (await leerCuerpo(req, 1024 * 1024)).toString('utf8');
          try { c.body = txt ? JSON.parse(txt) : {}; } catch { fallo(400, 'Datos mal formados'); }
          if (!c.body || typeof c.body !== 'object' || Array.isArray(c.body)) fallo(400, 'Datos mal formados');
        }
      }
      const out = await r.fn(c);
      if (out !== undefined && !res.writableEnded) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(out));
      }
    } catch (e) {
      const estado = e instanceof ErrorHTTP ? e.estado : e instanceof ia.ErrorIA ? 502 : 500;
      if (estado === 500) console.error('[error]', req.method, url.pathname, e);
      if (!res.headersSent) res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: estado === 500 ? 'Error interno' : e.message }));
    }
  }

  function estatico(ruta0, res) {
    const rel = ruta0 === '/' ? 'index.html' : ruta0.slice(1);
    const abs = path.join(PUBLICO, rel);
    if (!abs.startsWith(PUBLICO + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) { res.writeHead(404); return res.end('No existe'); }
    res.writeHead(200, { 'Content-Type': MIMES[path.extname(abs)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(abs).pipe(res);
  }

  const servidor = http.createServer((req, res) => { atender(req, res).catch((e) => { console.error(e); try { res.writeHead(500); res.end(); } catch {} }); });
  return { servidor, q, N, db };
}

if (require.main === module) {
  const app = crearApp();
  const puerto = Number(process.env.PORT) || 3000;
  app.servidor.listen(puerto, () => console.log(`Gestoría en http://localhost:${puerto}  ·  IA: ${ia.disponible() ? ia.MODELO : 'sin configurar'}`));
  const rutina = () => app.N.rutina().catch((e) => console.error('[rutina]', e));
  setTimeout(rutina, 5000);
  setInterval(rutina, 60 * 60 * 1000);
}

module.exports = { crearApp, cifrar };
