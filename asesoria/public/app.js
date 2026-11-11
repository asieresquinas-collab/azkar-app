'use strict';
/* Interfaz: panel de la asesoría y portal del cliente. Sin dependencias. */
const $app = document.getElementById('app');
let S = { usuario: null, asesoria: '', ia: false, categorias: {}, gestores: [] };

// ---------- Utilidades ----------
function h(tag, attrs, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'value') e.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') e[k] = !!v;
    else e.setAttribute(k, v);
  }
  for (const x of hijos.flat(Infinity)) if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(String(x)));
  return e;
}
async function api(metodo, url, cuerpo, crudo) {
  const op = { method: metodo, headers: { 'X-Requested-With': 'gestoria' }, credentials: 'same-origin' };
  if (crudo) { op.body = cuerpo; op.headers['Content-Type'] = 'application/octet-stream'; }
  else if (cuerpo !== undefined) { op.body = JSON.stringify(cuerpo); op.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(url, op);
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && S.usuario) { S.usuario = null; location.hash = '#/'; pintar(); }
  if (!r.ok) throw new Error(d.error || 'Error ' + r.status);
  return d;
}
const eur = (n) => (n == null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(n));
const fecha = (s) => (s ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(String(s).slice(0, 10) + 'T00:00:00Z')) : '—');
const hora = (s) => new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(String(s).replace(' ', 'T') + 'Z'));
const chip = (txt, clase) => h('span', { class: 'chip ' + (clase || '') }, txt);
const ESTADOS_DOC = { pendiente: ['En cola', 'azul'], procesando: ['Leyendo…', 'azul'], revisar: ['Por revisar', 'aviso'], contabilizado: ['Contabilizado', 'ok'], descartado: ['Descartado', ''], error: ['Error de lectura', 'mal'] };
const ESTADOS_OBL = { pendiente: ['Pendiente', ''], borrador: ['Borrador listo', 'azul'], revisado: ['Revisado', 'aviso'], presentado: ['Presentado', 'ok'] };
const chipDoc = (e) => chip(...(ESTADOS_DOC[e] || [e, '']));
const chipObl = (e) => chip(...(ESTADOS_OBL[e] || [e, '']));
const chipDias = (d) => chip(d < 0 ? `Vencido hace ${-d} d` : d === 0 ? 'Vence hoy' : `${d} días`, d < 0 ? 'mal' : d <= 7 ? 'aviso' : '');
const tabla = (cab, filas, vacio) => (filas.length
  ? h('div', { class: 'tabla-env' }, h('table', {}, h('thead', {}, h('tr', {}, cab.map((c) => h('th', { class: c.startsWith('#') ? 'num' : '' }, c.replace('#', ''))))), h('tbody', {}, filas)))
  : h('div', { class: 'vacio' }, vacio || 'Nada por aquí.'));
const campo = (etq, nombre, valor, extra) => h('label', {}, etq, h('input', { name: nombre, value: valor ?? '', ...(extra || {}) }));
const selector = (etq, nombre, opciones, valor) => h('label', {}, etq, h('select', { name: nombre }, opciones.map(([v, t]) => h('option', { value: v, selected: String(v) === String(valor ?? '') }, t))));
const marca = (etq, nombre, on) => h('label', { class: 'marca' }, h('input', { type: 'checkbox', name: nombre, checked: on }), etq);
function datosForm(f) {
  const o = {};
  for (const el of f.elements) { if (!el.name) continue; o[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim(); }
  return o;
}
function error(caja, e) { caja.replaceChildren(h('div', { class: 'error-caja' }, e.message || String(e))); }
function dialogo(titulo, contenido) {
  const d = h('dialog', {}, h('div', { class: 'fila entre' }, h('h2', {}, titulo), h('button', { class: 'mini', onclick: () => d.close() }, 'Cerrar')), contenido);
  d.addEventListener('close', () => d.remove());
  document.body.append(d); d.showModal();
  return d;
}
async function accion(boton, fn) {
  const txt = boton.textContent; boton.disabled = true;
  try { await fn(); } catch (e) { alert(e.message); } finally { boton.disabled = false; boton.textContent = txt; }
}

// ---------- Arranque ----------
async function pintar() {
  const est = await api('GET', '/api/estado');
  Object.assign(S, { usuario: est.usuario, asesoria: est.asesoria || 'Gestoría', ia: est.ia });
  document.title = S.asesoria;
  const ruta = location.hash.replace(/^#\/?/, '').split('/');
  if (ruta[0] === 'invitacion') return vistaInvitacion(ruta[1]);
  if (!est.instalado) return vistaInstalar(est.pide_codigo);
  if (!S.usuario) return vistaAcceso();
  if (S.usuario.rol === 'cliente') return marcoPortal(ruta);
  if (!Object.keys(S.categorias).length) {
    const [aj, us] = await Promise.all([api('GET', '/api/ajustes'), api('GET', '/api/usuarios')]);
    S.categorias = aj.categorias; S.gestores = us.filter((u) => u.activo);
  }
  return marcoGestor(ruta);
}
window.addEventListener('hashchange', () => { document.querySelectorAll('dialog').forEach((d) => d.close()); pintar().catch(console.error); });

function vistaInstalar(pideCodigo) {
  const err = h('div');
  $app.replaceChildren(h('div', { class: 'centro' }, h('h1', {}, 'Puesta en marcha'), h('p', { class: 'sub' }, 'Crea la cuenta del administrador de la asesoría.'), err,
    h('form', { class: 'caja', onsubmit: async (ev) => { ev.preventDefault(); try { await api('POST', '/api/instalar', datosForm(ev.target)); pintar(); } catch (e) { error(err, e); } } },
      campo('Nombre de la asesoría', 'asesoria', '', { required: true }), campo('Tu nombre', 'nombre', '', { required: true }),
      campo('Correo', 'email', '', { type: 'email', required: true }), campo('Contraseña (mínimo 10 caracteres)', 'clave', '', { type: 'password', required: true, minlength: 10 }),
      pideCodigo && campo('Código de instalación', 'codigo', '', { required: true }),
      h('button', { class: 'principal' }, 'Crear y entrar'))));
}
function vistaAcceso() {
  const err = h('div');
  $app.replaceChildren(h('div', { class: 'centro' }, h('h1', {}, S.asesoria), h('p', { class: 'sub' }, 'Acceso para el equipo y para clientes.'), err,
    h('form', { class: 'caja', onsubmit: async (ev) => { ev.preventDefault(); try { await api('POST', '/api/acceso', datosForm(ev.target)); location.hash = '#/'; pintar(); } catch (e) { error(err, e); } } },
      campo('Correo', 'email', '', { type: 'email', required: true, autocomplete: 'username' }), campo('Contraseña', 'clave', '', { type: 'password', required: true, autocomplete: 'current-password' }),
      h('button', { class: 'principal' }, 'Entrar'))));
}
function vistaInvitacion(token) {
  const err = h('div');
  $app.replaceChildren(h('div', { class: 'centro' }, h('h1', {}, 'Crea tu contraseña'), h('p', { class: 'sub' }, `Para entrar en ${S.asesoria}.`), err,
    h('form', { class: 'caja', onsubmit: async (ev) => { ev.preventDefault(); try { await api('POST', '/api/invitacion', { token, clave: ev.target.clave.value }); location.hash = '#/'; pintar(); } catch (e) { error(err, e); } } },
      campo('Contraseña (mínimo 10 caracteres)', 'clave', '', { type: 'password', required: true, minlength: 10, autocomplete: 'new-password' }),
      h('button', { class: 'principal' }, 'Guardar y entrar'))));
}
async function salir() { await api('POST', '/api/salir', {}); S = { ...S, usuario: null, categorias: {} }; location.hash = '#/'; pintar(); }

function marco(menu, activa, contenido) {
  $app.replaceChildren(h('div', { class: 'marco' },
    h('nav', { class: 'lado' }, h('div', { class: 'logo' }, S.asesoria),
      menu.map(([id, txt, n]) => h('a', { href: '#/' + id, class: activa === id ? 'activo' : '' }, txt, n ? chip(n, 'aviso') : null)),
      h('div', { class: 'pie' }, S.usuario.nombre, h('br'), h('a', { onclick: salir }, 'Cerrar sesión'))),
    h('main', { class: 'cont' }, contenido)));
}

// =====================================================================
// PANEL DE LA ASESORÍA
// =====================================================================
async function marcoGestor(ruta) {
  const vista = ruta[0] || 'panel';
  const p = await api('GET', '/api/panel');
  const menu = [['panel', 'Panel'], ['revision', 'Revisión', p.por_revisar + p.con_error], ['impuestos', 'Impuestos'], ['clientes', 'Clientes'],
    ['consultas', 'Consultas', p.consultas], ['tareas', 'Tareas', p.tareas], ['correos', 'Correos'], ['honorarios', 'Honorarios'], ['ajustes', 'Ajustes']];
  const cont = h('div');
  marco(menu, vista === 'cliente' ? 'clientes' : vista, cont);
  const vistas = { panel: () => vPanel(cont, p), revision: () => vRevision(cont, ruta[1]), impuestos: () => vImpuestos(cont), clientes: () => vClientes(cont),
    cliente: () => vCliente(cont, ruta[1], ruta[2]), consultas: () => vConsultas(cont), tareas: () => vTareas(cont), correos: () => vCorreos(cont), honorarios: () => vHonorarios(cont), ajustes: () => vAjustes(cont) };
  try { await (vistas[vista] || vistas.panel)(); } catch (e) { error(cont, e); }
}

function vPanel(cont, p) {
  const a = p.automatizacion;
  const barra = h('i'); barra.style.width = (a.porcentaje || 0) + '%';
  const NOMBRES = { documento: 'Documentos contabilizados', recordatorio: 'Reclamaciones de documentación', borrador_modelo: 'Borradores de impuestos', consulta: 'Consultas de clientes', presentacion: 'Presentaciones', recibo: 'Recibos de honorarios', tarea_manual: 'Tareas manuales' };
  cont.replaceChildren(
    h('div', { class: 'fila entre' }, h('div', {}, h('h1', {}, 'Panel'), h('p', { class: 'sub' }, 'Hoy, ' + fecha(p.hoy))),
      h('button', { onclick: (ev) => accion(ev.target, async () => { ev.target.textContent = 'Trabajando…'; const r = await api('POST', '/api/rutina', {}); alert(`Hecho: ${r.recordatorios} reclamaciones, ${r.avisos} avisos de plazo, ${r.recibos} recibos, ${r.documentos} documentos releídos.`); pintar(); }) }, 'Ejecutar automatismos ahora')),
    !p.ia && h('div', { class: 'aviso-caja' }, 'La lectura automática de facturas y el asistente no están activos: falta la clave de la IA (ANTHROPIC_API_KEY) en el servidor. Mientras tanto, los documentos entran en revisión manual y las consultas se derivan al gestor.'),
    h('div', { class: 'rejilla' },
      h('div', { class: 'dato' }, h('b', {}, a.porcentaje == null ? '—' : a.porcentaje + ' %'), h('span', {}, `Trabajo hecho sin intervención (${a.dias} días)`), h('div', { class: 'barra' }, barra)),
      h('div', { class: 'dato' }, h('b', {}, p.por_revisar), h('span', {}, 'Documentos por revisar')),
      h('div', { class: 'dato' }, h('b', {}, p.consultas), h('span', {}, 'Clientes esperando respuesta')),
      h('div', { class: 'dato' }, h('b', {}, p.tareas), h('span', {}, 'Tareas abiertas')),
      h('div', { class: 'dato' }, h('b', {}, p.clientes), h('span', {}, 'Clientes activos'))),
    h('div', { class: 'caja' }, h('h2', {}, 'Vencimientos de los próximos 30 días'),
      tabla(['Cliente', 'Modelo', 'Periodo', 'Vence', 'Estado', '#Borrador'], p.vencimientos.map((o) => h('tr', {},
        h('td', {}, h('a', { href: `#/cliente/${o.cliente_id}/impuestos` }, o.cliente)), h('td', {}, o.codigo), h('td', {}, `${o.periodo} ${o.ejercicio}`),
        h('td', {}, fecha(o.vence), ' ', chipDias(o.dias)), h('td', {}, chipObl(o.estado)), h('td', { class: 'num' }, eur(o.importe)))), 'No hay nada que venza en 30 días.')),
    h('div', { class: 'caja' }, h('h2', {}, 'De dónde sale el porcentaje'),
      h('p', { class: 'sub' }, 'Cada unidad de trabajo cuenta una vez: se marca como automática si nadie de la asesoría tuvo que tocarla.'),
      tabla(['Trabajo', '#Automático', '#Total', '#%'], a.por_tipo.map((f) => h('tr', {}, h('td', {}, NOMBRES[f.tipo] || f.tipo), h('td', { class: 'num' }, f.auto), h('td', { class: 'num' }, f.total), h('td', { class: 'num' }, Math.round((f.auto / f.total) * 100) + ' %'))), 'Aún no hay actividad registrada.')));
}

// ---------- Formulario de factura (revisión y alta manual) ----------
function formFactura(v, alGuardar, botones) {
  const err = h('div');
  const cats = Object.entries(S.categorias).map(([k, x]) => [k, `${x[1]} (${x[0]})`]);
  const f = h('form', {},
    h('div', { class: 'form' },
      selector('Tipo', 'tipo', [['', '— elegir —'], ['recibida', 'Recibida (gasto)'], ['emitida', 'Emitida (ingreso)']], v.tipo),
      campo('Fecha', 'fecha', v.fecha, { type: 'date', required: true }), campo('Número', 'numero', v.numero),
      campo('Proveedor / cliente', 'contraparte_nombre', v.contraparte_nombre), campo('NIF', 'contraparte_nif', v.contraparte_nif),
      campo('Base imponible', 'base', v.base, { type: 'number', step: '0.01' }), campo('% IVA', 'tipo_iva', v.tipo_iva, { type: 'number', step: '0.01' }),
      campo('Cuota de IVA', 'cuota_iva', v.cuota_iva ?? 0, { type: 'number', step: '0.01' }), campo('% IRPF', 'tipo_irpf', v.tipo_irpf, { type: 'number', step: '0.01' }),
      campo('Retención', 'retencion', v.retencion ?? 0, { type: 'number', step: '0.01' }), campo('Total', 'total', v.total, { type: 'number', step: '0.01', required: true }),
      selector('Categoría', 'categoria', cats, v.categoria || 'otros')),
    campo('Concepto', 'descripcion', v.descripcion), marca('IVA y gasto deducibles', 'deducible', v.deducible !== 0), err,
    h('div', { class: 'fila fin' }, botones, h('button', { class: 'principal' }, 'Contabilizar')));
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = datosForm(f);
    try {
      let r = await alGuardar(d);
      if (r.avisos) {
        if (!confirm('Antes de guardar, revisa:\n\n• ' + r.avisos.join('\n• ') + '\n\n¿Contabilizar igualmente?')) return;
        r = await alGuardar({ ...d, confirmar: true });
      }
    } catch (e) { error(err, e); }
  });
  return f;
}

async function vRevision(cont, idSel) {
  const docs = [...await api('GET', '/api/documentos?estado=revisar'), ...await api('GET', '/api/documentos?estado=error')];
  if (!docs.length) return cont.replaceChildren(h('h1', {}, 'Revisión'), h('div', { class: 'caja vacio' }, 'No hay documentos por revisar. Lo que la lectura automática da por bueno se contabiliza solo.'));
  const d = docs.find((x) => String(x.id) === idSel) || docs[0];
  const url = `/api/documentos/${d.id}/archivo`;
  const visor = d.mime === 'application/pdf' ? h('iframe', { class: 'visor', src: url, title: d.nombre }) : h('img', { class: 'visor', src: url, alt: d.nombre });
  const sig = () => { location.hash = '#/revision'; pintar(); };
  cont.replaceChildren(
    h('div', { class: 'fila entre' }, h('div', {}, h('h1', {}, 'Revisión'), h('p', { class: 'sub' }, `${docs.length} documento(s) esperan a una persona`)),
      h('select', { 'aria-label': 'Documento', onchange: (ev) => { location.hash = '#/revision/' + ev.target.value; } }, docs.map((x) => h('option', { value: x.id, selected: x.id === d.id }, `${x.cliente} · ${x.nombre}`)))),
    h('div', { class: 'revision' },
      h('div', {}, visor, h('p', { class: 'sub' }, h('a', { href: url, target: '_blank', rel: 'noopener' }, 'Abrir en otra pestaña'))),
      h('div', { class: 'caja' },
        h('h2', {}, d.cliente, ' ', h('span', { class: 'chip' }, d.cliente_nif)),
        h('div', { class: 'aviso-caja' }, 'Por qué no se ha contabilizado solo:', h('ul', {}, d.motivos.map((m) => h('li', {}, m)))),
        formFactura(d.propuesta || {}, async (datos) => { const r = await api('POST', `/api/documentos/${d.id}/contabilizar`, datos); if (!r.avisos) sig(); return r; }, [
          h('button', { type: 'button', class: 'peligro', onclick: (ev) => accion(ev.target, async () => { if (confirm('¿Descartar este documento? No se contabilizará.')) { await api('POST', `/api/documentos/${d.id}/descartar`, {}); sig(); } }) }, 'Descartar'),
          S.ia && h('button', { type: 'button', onclick: (ev) => accion(ev.target, async () => { await api('POST', `/api/documentos/${d.id}/releer`, {}); sig(); }) }, 'Volver a leer'),
        ]))));
}

async function vImpuestos(cont, clienteId) {
  const obs = await api('GET', '/api/obligaciones' + (clienteId ? `?cliente=${clienteId}&todas=1` : ''));
  const ver = (o) => {
    const d = o.datos || {};
    const filas = Object.entries(d).filter(([k]) => !['sentido', 'aviso', 'terceros'].includes(k)).map(([k, v]) => h('tr', {}, h('td', {}, k.replace(/_/g, ' ')), h('td', { class: 'num' }, /^n_|perceptores|arrendadores/.test(k) || (o.modelo === '347' && k === 'resultado') ? v : eur(v))));
    const imp = h('input', { type: 'number', step: '0.01', value: o.importe ?? '' });
    const dlg = dialogo(`Modelo ${o.codigo} · ${o.periodo} ${o.ejercicio} · ${o.cliente}`, h('div', {},
      h('p', { class: 'sub' }, o.nombre_modelo, ' · vence ', fecha(o.vence)),
      o.datos ? h('div', {}, h('p', {}, 'Borrador calculado con las facturas contabilizadas: ', h('b', {}, d.sentido)), d.aviso && h('div', { class: 'aviso-caja' }, d.aviso), tabla(['Concepto', '#Importe'], filas),
        d.terceros && tabla(['Tercero', 'NIF', 'Clave', '#Importe'], d.terceros.map((t) => h('tr', {}, h('td', {}, t.nombre), h('td', {}, t.nif), h('td', {}, t.clave), h('td', { class: 'num' }, eur(t.importe)))), 'Ningún tercero supera 3.005,06 €.'))
        : h('p', { class: 'vacio' }, 'Este modelo no se calcula solo: la aplicación solo controla su plazo y su estado.'),
      o.estado !== 'presentado' ? h('div', {}, h('label', {}, 'Importe presentado (si difiere del borrador)', imp), h('div', { class: 'fila fin' },
        o.estado !== 'revisado' && h('button', { onclick: (ev) => accion(ev.target, async () => { await api('POST', `/api/obligaciones/${o.id}/estado`, { estado: 'revisado' }); dlg.close(); pintar(); }) }, 'Marcar revisado'),
        h('button', { class: 'principal', onclick: (ev) => accion(ev.target, async () => { await api('POST', `/api/obligaciones/${o.id}/estado`, { estado: 'presentado', importe: imp.value }); dlg.close(); pintar(); }) }, 'Marcar presentado')))
        : h('div', { class: 'fila fin' }, h('button', { onclick: (ev) => accion(ev.target, async () => { await api('POST', `/api/obligaciones/${o.id}/estado`, { estado: 'borrador' }); dlg.close(); pintar(); }) }, 'Reabrir'))));
  };
  const t = tabla([clienteId ? null : 'Cliente', 'Modelo', 'Periodo', 'Vence', 'Estado', '#Importe', ''].filter(Boolean), obs.map((o) => h('tr', {},
    !clienteId && h('td', {}, h('a', { href: `#/cliente/${o.cliente_id}/impuestos` }, o.cliente)), h('td', {}, h('b', {}, o.codigo), ' ', h('span', { class: 'sub' }, o.nombre_modelo)), h('td', {}, `${o.periodo} ${o.ejercicio}`),
    h('td', {}, fecha(o.vence), ' ', o.estado !== 'presentado' && chipDias(o.dias)), h('td', {}, chipObl(o.estado)), h('td', { class: 'num' }, eur(o.importe)),
    h('td', {}, h('button', { class: 'mini', onclick: () => ver(o) }, 'Abrir')))), 'Sin obligaciones pendientes.');
  if (clienteId) return t;
  cont.replaceChildren(h('h1', {}, 'Impuestos'), h('p', { class: 'sub' }, 'Calendario de todos los clientes. Los borradores se recalculan cada vez que entra una factura.'), h('div', { class: 'caja' }, t));
}

function formCliente(c, alGuardar) {
  const err = h('div');
  return h('form', { onsubmit: async (ev) => { ev.preventDefault(); try { await alGuardar(datosForm(ev.target)); } catch (e) { error(err, e); } } },
    h('div', { class: 'form' }, campo('Nombre o razón social', 'nombre', c.nombre, { required: true }), campo('NIF', 'nif', c.nif, { required: true }),
      selector('Tipo', 'tipo', [['autonomo', 'Autónomo'], ['sociedad', 'Sociedad']], c.tipo), campo('Correo', 'email', c.email, { type: 'email' }), campo('Teléfono', 'telefono', c.telefono),
      selector('Gestor', 'gestor_id', [['', '— sin asignar —'], ...S.gestores.map((g) => [g.id, g.nombre])], c.gestor_id), campo('Cuota mensual (€)', 'cuota_mensual', c.cuota_mensual ?? 0, { type: 'number', step: '0.01', min: 0 })),
    h('div', { class: 'fila' }, marca('Sujeto a IVA (303 y 390)', 'iva', c.iva ?? 1), marca('Practica retenciones (111 y 190)', 'retiene', c.retiene), marca('Paga alquiler con retención (115 y 180)', 'alquiler', c.alquiler), c.id && marca('Cliente activo', 'activo', c.activo)),
    h('label', {}, 'Notas internas', h('textarea', { name: 'notas' }, c.notas || '')), err, h('div', { class: 'fila fin' }, h('button', { class: 'principal' }, 'Guardar')));
}

async function vClientes(cont) {
  const cs = await api('GET', '/api/clientes');
  cont.replaceChildren(
    h('div', { class: 'fila entre' }, h('h1', {}, 'Clientes'), h('button', { class: 'principal', onclick: () => { const d = dialogo('Nuevo cliente', formCliente({}, async (v) => { const r = await api('POST', '/api/clientes', v); d.close(); location.hash = '#/cliente/' + r.id; })); } }, 'Nuevo cliente')),
    h('div', { class: 'caja' }, tabla(['Cliente', 'NIF', 'Tipo', 'Gestor', 'Por revisar', 'Próximo plazo'], cs.map((c) => h('tr', {},
      h('td', {}, h('a', { href: '#/cliente/' + c.id }, c.nombre), !c.activo && chip('Baja')), h('td', {}, c.nif), h('td', {}, c.tipo === 'sociedad' ? 'Sociedad' : 'Autónomo'), h('td', {}, c.gestor || '—'),
      h('td', {}, c.por_revisar ? chip(c.por_revisar, 'aviso') : '—'), h('td', {}, fecha(c.proximo)))), 'Todavía no hay clientes. Crea el primero.')));
}

async function subirArchivos(archivos, clienteId, estado) {
  let ok = 0; const fallos = [];
  for (const a of archivos) {
    estado.textContent = `Subiendo ${a.name}…`;
    try { await api('PUT', `/api/documentos/subir?cliente=${clienteId || ''}&nombre=${encodeURIComponent(a.name)}`, a, true); ok++; } catch (e) { fallos.push(`${a.name}: ${e.message}`); }
  }
  estado.textContent = `${ok} documento(s) subido(s).` + (fallos.length ? ' No se pudo: ' + fallos.join(' · ') : '');
}
function zonaSubida(clienteId, alTerminar) {
  const estado = h('p', { class: 'sub', role: 'status' });
  const entrada = h('input', { type: 'file', multiple: true, accept: 'application/pdf,image/jpeg,image/png,image/webp', class: 'oculto' });
  const subir = async (lista) => { if (lista.length) { await subirArchivos([...lista], clienteId, estado); alTerminar && setTimeout(alTerminar, 1500); } };
  entrada.addEventListener('change', () => subir(entrada.files));
  const zona = h('div', { class: 'soltar', role: 'button', tabindex: 0, onclick: () => entrada.click(), onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') entrada.click(); } },
    h('b', {}, 'Pulsa para elegir archivos o hacer una foto'), h('br'), 'o arrástralos aquí · PDF, JPG o PNG · hasta 15 MB cada uno');
  zona.addEventListener('dragover', (ev) => { ev.preventDefault(); zona.classList.add('encima'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
  zona.addEventListener('drop', (ev) => { ev.preventDefault(); zona.classList.remove('encima'); subir(ev.dataTransfer.files); });
  return h('div', {}, zona, entrada, estado);
}

function chat(mensajes, alEnviar, soyCliente) {
  const lista = h('div', { class: 'chat' }, mensajes.length ? mensajes.map((m) => {
    const mio = soyCliente ? m.autor === 'cliente' : m.autor === 'gestor';
    const quien = { cliente: soyCliente ? 'Tú' : 'Cliente', ia: 'Asistente', gestor: m.usuario || 'Gestor', sistema: 'Aviso' }[m.autor];
    return h('div', { class: 'burbuja ' + (m.autor === 'sistema' ? 'sistema' : mio ? 'yo' : '') }, h('small', {}, `${quien} · ${hora(m.creado)}`, m.derivado ? ' · pasado al gestor' : ''), m.texto);
  }) : h('div', { class: 'vacio' }, 'Sin mensajes todavía.'));
  const txt = h('textarea', { placeholder: soyCliente ? 'Escribe tu duda…' : 'Responder al cliente…', 'aria-label': 'Mensaje' });
  const b = h('button', { class: 'principal', onclick: () => accion(b, async () => { if (!txt.value.trim()) return; b.textContent = 'Enviando…'; await alEnviar(txt.value); }) }, 'Enviar');
  setTimeout(() => { lista.scrollTop = lista.scrollHeight; });
  return h('div', {}, lista, h('div', { class: 'fila' }, txt), h('div', { class: 'fila fin' }, b));
}

async function vCliente(cont, id, pest = 'resumen') {
  const { cliente: c, acceso } = await api('GET', '/api/clientes/' + id);
  const pests = [['resumen', 'Ficha'], ['documentos', 'Documentos'], ['facturas', 'Libros'], ['impuestos', 'Impuestos'], ['mensajes', 'Mensajes'], ['correos', 'Correos']];
  const cuerpo = h('div');
  cont.replaceChildren(h('h1', {}, c.nombre), h('p', { class: 'sub' }, `${c.nif} · ${c.tipo === 'sociedad' ? 'Sociedad' : 'Autónomo'}`),
    h('div', { class: 'pest' }, pests.map(([k, t]) => h('a', { href: `#/cliente/${id}/${k}`, class: k === pest ? 'activo' : '' }, t))), cuerpo);
  if (pest === 'resumen') {
    const enlace = h('div');
    cuerpo.append(h('div', { class: 'caja' }, formCliente(c, async (v) => { await api('PUT', '/api/clientes/' + id, v); pintar(); })),
      h('div', { class: 'caja' }, h('h2', {}, 'Acceso al portal'),
        h('p', {}, acceso ? (acceso.activado ? `Activo con ${acceso.email}.` : `Invitado (${acceso.email}), aún no ha creado su contraseña.`) : 'Este cliente todavía no tiene acceso.'),
        h('button', { onclick: (ev) => accion(ev.target, async () => { const r = await api('POST', `/api/clientes/${id}/invitar`, {}); enlace.replaceChildren(h('p', {}, 'Enlace de alta (caduca en 7 días). También queda en Correos:'), h('input', { value: r.enlace, readonly: true, onfocus: (e) => e.target.select() })); }) }, acceso ? 'Generar nuevo enlace' : 'Invitar al portal'), enlace));
  } else if (pest === 'documentos') {
    const docs = await api('GET', '/api/documentos?cliente=' + id);
    cuerpo.append(h('div', { class: 'caja' }, zonaSubida(id, pintar)),
      h('div', { class: 'caja' }, tabla(['Documento', 'Subido', 'Origen', 'Estado', ''], docs.map((d) => h('tr', {},
        h('td', {}, h('a', { href: `/api/documentos/${d.id}/archivo`, target: '_blank', rel: 'noopener' }, d.nombre)), h('td', {}, hora(d.subido_en)), h('td', {}, d.origen === 'portal' ? 'Portal del cliente' : 'Asesoría'),
        h('td', {}, chipDoc(d.estado), d.estado === 'contabilizado' && (d.auto ? chip('Automático', 'ok') : chip('Manual'))), h('td', {}, ['revisar', 'error'].includes(d.estado) && h('a', { href: '#/revision/' + d.id }, 'Revisar')))), 'Este cliente no ha subido documentos.')));
  } else if (pest === 'facturas') {
    const ej = new Date().getFullYear();
    const sel = { ejercicio: sessionStorage.ej || ej, t: sessionStorage.t || '' };
    const qs = `cliente=${id}&ejercicio=${sel.ejercicio}&t=${sel.t}`;
    const fs = await api('GET', '/api/facturas?' + qs);
    const suma = (tipo, k) => fs.filter((f) => f.tipo === tipo).reduce((s, f) => s + f[k], 0);
    const cambia = (k) => (ev) => { sessionStorage[k] = ev.target.value; pintar(); };
    cuerpo.append(h('div', { class: 'caja' },
      h('div', { class: 'fila entre' }, h('div', { class: 'fila' },
        h('select', { 'aria-label': 'Ejercicio', onchange: cambia('ej') }, [ej, ej - 1, ej - 2].map((a) => h('option', { value: a, selected: String(a) === String(sel.ejercicio) }, a))),
        h('select', { 'aria-label': 'Trimestre', onchange: cambia('t') }, [['', 'Todo el año'], [1, '1T'], [2, '2T'], [3, '3T'], [4, '4T']].map(([v, t]) => h('option', { value: v, selected: String(v) === String(sel.t) }, t)))),
      h('div', { class: 'fila' }, h('a', { class: 'boton', href: '/api/facturas.csv?' + qs }, 'Exportar CSV'),
        h('button', { onclick: () => { const d = dialogo('Factura a mano', formFactura({}, async (v) => { const r = await api('POST', '/api/facturas', { ...v, cliente_id: id }); if (!r.avisos) { d.close(); pintar(); } return r; })); } }, 'Añadir a mano'))),
      h('p', { class: 'sub' }, `Emitidas: base ${eur(suma('emitida', 'base'))}, IVA ${eur(suma('emitida', 'cuota_iva'))} · Recibidas: base ${eur(suma('recibida', 'base'))}, IVA ${eur(suma('recibida', 'cuota_iva'))}`),
      tabla(['Fecha', 'Tipo', 'Nº', 'Proveedor / cliente', 'Cuenta', '#Base', '#IVA', '#Ret.', '#Total', ''], fs.map((f) => h('tr', {},
        h('td', {}, fecha(f.fecha)), h('td', {}, chip(f.tipo === 'emitida' ? 'Emitida' : 'Recibida', f.tipo === 'emitida' ? 'ok' : '')), h('td', {}, f.numero || '—'),
        h('td', {}, f.contraparte_nombre || '—', h('br'), h('span', { class: 'sub' }, f.contraparte_nif || '')), h('td', {}, f.cuenta), h('td', { class: 'num' }, eur(f.base)), h('td', { class: 'num' }, eur(f.cuota_iva)),
        h('td', { class: 'num' }, f.retencion ? eur(f.retencion) : '—'), h('td', { class: 'num' }, eur(f.total)),
        h('td', {}, f.documento_id && h('a', { href: `/api/documentos/${f.documento_id}/archivo`, target: '_blank', rel: 'noopener' }, 'Ver'), ' ',
          h('button', { class: 'mini peligro', onclick: (ev) => accion(ev.target, async () => { if (confirm('¿Borrar esta factura del libro?')) { await api('DELETE', '/api/facturas/' + f.id); pintar(); } }) }, 'Borrar')))), 'Sin facturas en este periodo.')));
  } else if (pest === 'impuestos') {
    cuerpo.append(h('div', { class: 'caja' }, await vImpuestos(null, id)));
  } else if (pest === 'mensajes') {
    const ms = await api('GET', '/api/mensajes?cliente=' + id);
    cuerpo.append(h('div', { class: 'caja' }, chat(ms, async (t) => { await api('POST', '/api/mensajes', { cliente: id, texto: t }); pintar(); }, false)));
  } else if (pest === 'correos') {
    const lista = await api('GET', '/api/correos?cliente=' + id);
    const asunto = h('input', { placeholder: 'Asunto', 'aria-label': 'Asunto' }); const texto = h('textarea', { placeholder: 'Texto del correo', 'aria-label': 'Texto' });
    const idea = h('input', { placeholder: 'Ej.: pedirle el contrato de alquiler del local y recordarle que el 303 vence el día 20', 'aria-label': 'Qué quieres decirle' });
    cuerpo.append(h('div', { class: 'caja' }, h('h2', {}, 'Escribir al cliente'),
      S.ia && h('div', { class: 'fila' }, idea, h('button', { onclick: (ev) => accion(ev.target, async () => { ev.target.textContent = 'Redactando…'; const r = await api('POST', '/api/correos/redactar', { cliente: id, instruccion: idea.value }); asunto.value = r.asunto; texto.value = r.cuerpo; }) }, 'Redactar borrador')),
      h('p', {}), asunto, h('p', {}), texto, h('div', { class: 'fila fin' }, h('button', { class: 'principal', onclick: (ev) => accion(ev.target, async () => { await api('POST', '/api/correos', { cliente: id, asunto: asunto.value, cuerpo: texto.value }); pintar(); }) }, 'Enviar'))),
    h('div', { class: 'caja' }, listaCorreos(lista)));
  }
}

const ESTADOS_CORREO = { pendiente: ['En cola', 'azul'], enviado: ['Enviado', 'ok'], solo_portal: ['Sin envío', 'aviso'], error: ['Error', 'mal'] };
const listaCorreos = (lista, conCliente) => tabla([conCliente && 'Cliente', 'Fecha', 'Asunto', 'Tipo', 'Estado'].filter(Boolean), lista.map((m) => h('tr', {},
  conCliente && h('td', {}, m.cliente || '—'), h('td', {}, hora(m.creado)), h('td', {}, h('a', { onclick: () => dialogo(m.asunto, h('div', {}, h('p', { class: 'sub' }, 'Para: ' + (m.para || 'sin correo')), h('p', { class: 'pre' }, m.cuerpo), m.error && h('div', { class: 'aviso-caja' }, m.error))) }, m.asunto)),
  h('td', {}, { recordatorio: 'Reclamación automática', invitacion: 'Invitación', manual: 'Escrito por gestor' }[m.tipo] || m.tipo), h('td', {}, chip(...(ESTADOS_CORREO[m.estado] || [m.estado, '']))))), 'No se ha enviado ningún correo.');

async function vConsultas(cont) {
  const cs = await api('GET', '/api/consultas');
  cont.replaceChildren(h('h1', {}, 'Consultas'), h('p', { class: 'sub' }, 'Clientes a los que el asistente ha pasado al gestor porque la respuesta requiere criterio profesional.'),
    h('div', { class: 'caja' }, tabla(['Cliente', 'Última pregunta', 'Desde', ''], cs.map((c) => h('tr', {}, h('td', {}, c.cliente), h('td', {}, c.ultimo_texto), h('td', {}, hora(c.ultimo)), h('td', {}, h('a', { href: `#/cliente/${c.cliente_id}/mensajes` }, 'Responder')))), 'Nadie espera respuesta.')));
}

async function vTareas(cont) {
  const [ts, cs] = await Promise.all([api('GET', '/api/tareas'), api('GET', '/api/clientes')]);
  const nueva = () => { const err = h('div'); const d = dialogo('Nueva tarea', h('form', { onsubmit: async (ev) => { ev.preventDefault(); try { await api('POST', '/api/tareas', datosForm(ev.target)); d.close(); pintar(); } catch (e) { error(err, e); } } },
    campo('Título', 'titulo', '', { required: true }), selector('Cliente', 'cliente_id', [['', '— ninguno —'], ...cs.map((c) => [c.id, c.nombre])]), selector('Asignada a', 'asignado_a', S.gestores.map((g) => [g.id, g.nombre]), S.usuario.id),
    campo('Vence', 'vence', '', { type: 'date' }), h('label', {}, 'Detalle', h('textarea', { name: 'detalle' })), err, h('div', { class: 'fila fin' }, h('button', { class: 'principal' }, 'Crear')))); };
  cont.replaceChildren(h('div', { class: 'fila entre' }, h('h1', {}, 'Tareas'), h('button', { class: 'principal', onclick: nueva }, 'Nueva tarea')),
    h('div', { class: 'caja' }, tabla(['Tarea', 'Cliente', 'Asignada a', 'Vence', ''], ts.map((t) => h('tr', {},
      h('td', {}, h('b', {}, t.titulo), ' ', t.auto ? chip('Creada sola', 'azul') : null, t.detalle && h('div', { class: 'sub' }, t.detalle)),
      h('td', {}, t.cliente ? h('a', { href: '#/cliente/' + t.cliente_id }, t.cliente) : '—'), h('td', {}, t.asignado || 'Sin asignar'), h('td', {}, fecha(t.vence)),
      h('td', {}, h('button', { class: 'mini', onclick: (ev) => accion(ev.target, async () => { const m = prompt('Minutos dedicados (opcional):', ''); if (m === null) return; await api('POST', `/api/tareas/${t.id}/cerrar`, { minutos: m }); pintar(); }) }, 'Hecha')))), 'No hay tareas abiertas.')));
}

async function vCorreos(cont) {
  cont.replaceChildren(h('h1', {}, 'Correos'), h('p', { class: 'sub' }, 'Todo lo que la asesoría ha enviado, lo haya escrito un gestor o la aplicación.'), h('div', { class: 'caja' }, listaCorreos(await api('GET', '/api/correos'), true)));
}

async function vHonorarios(cont) {
  const rs = await api('GET', '/api/recibos');
  const pend = rs.filter((r) => r.estado !== 'cobrado').reduce((s, r) => s + r.importe, 0);
  cont.replaceChildren(h('h1', {}, 'Honorarios'), h('p', { class: 'sub' }, `Recibos mensuales generados a partir de la cuota de cada cliente. Pendiente de cobro: ${eur(pend)}.`),
    h('div', { class: 'caja' }, tabla(['Periodo', 'Cliente', '#Importe', 'Estado', ''], rs.map((r) => h('tr', {}, h('td', {}, r.periodo), h('td', {}, r.cliente), h('td', { class: 'num' }, eur(r.importe)),
      h('td', {}, chip(r.estado === 'cobrado' ? 'Cobrado' : 'Pendiente', r.estado === 'cobrado' ? 'ok' : 'aviso')),
      h('td', {}, h('button', { class: 'mini', onclick: (ev) => accion(ev.target, async () => { await api('POST', `/api/recibos/${r.id}/cobrar`, {}); pintar(); }) }, r.estado === 'cobrado' ? 'Deshacer' : 'Marcar cobrado')))), 'Aún no hay recibos: pon una cuota mensual en la ficha de cada cliente.')));
}

async function vAjustes(cont) {
  const [a, us] = await Promise.all([api('GET', '/api/ajustes'), api('GET', '/api/usuarios')]);
  const admin = S.usuario.rol === 'admin'; const err = h('div'); const enlace = h('div');
  cont.replaceChildren(h('h1', {}, 'Ajustes'),
    h('div', { class: 'caja' }, h('h2', {}, 'Asesoría y plazos'),
      h('form', { onsubmit: async (ev) => { ev.preventDefault(); try { await api('PUT', '/api/ajustes', datosForm(ev.target)); alert('Guardado. Se han recalculado los vencimientos pendientes.'); pintar(); } catch (e) { error(err, e); } } },
        h('div', { class: 'form' }, campo('Nombre de la asesoría', 'asesoria', a.asesoria), selector('Territorio', 'territorio', [['comun', 'Territorio común (AEAT)'], ['bizkaia', 'Bizkaia (modelo 110)']], a.territorio),
          campo('Día límite trimestres 1º a 3º', 'dia_trimestre', a.dia_trimestre, { type: 'number', min: 1, max: 31, placeholder: '20' }), campo('Día límite 4º trimestre (enero)', 'dia_cuarto_trimestre', a.dia_cuarto_trimestre, { type: 'number', min: 1, max: 31, placeholder: '30' }),
          campo('Día límite resúmenes anuales (enero)', 'dia_anuales', a.dia_anuales, { type: 'number', min: 1, max: 31, placeholder: '31' })),
        h('p', { class: 'sub' }, 'Los plazos por defecto son los de territorio común. Si el último día cae en fin de semana pasa al lunes; los festivos locales no se tienen en cuenta.'), err,
        admin && h('div', { class: 'fila fin' }, h('button', { class: 'principal' }, 'Guardar')))),
    h('div', { class: 'caja' }, h('h2', {}, 'Conexiones'),
      h('p', {}, 'Lectura de facturas y asistente: ', a.ia ? chip('Activo · ' + a.modelo_ia, 'ok') : chip('Falta ANTHROPIC_API_KEY', 'aviso')),
      h('p', {}, 'Envío de correos: ', a.correo ? chip('Activo', 'ok') : chip('Sin configurar: los avisos solo se ven en el portal', 'aviso'))),
    h('div', { class: 'caja' }, h('h2', {}, 'Equipo'),
      tabla(['Nombre', 'Correo', 'Papel', 'Estado', ''], us.map((u) => h('tr', {}, h('td', {}, u.nombre), h('td', {}, u.email), h('td', {}, u.rol === 'admin' ? 'Administrador' : 'Gestor'),
        h('td', {}, !u.activo ? chip('Desactivado') : u.activado ? chip('Activo', 'ok') : chip('Invitado', 'aviso')),
        h('td', {}, admin && u.id !== S.usuario.id && h('button', { class: 'mini', onclick: (ev) => accion(ev.target, async () => { await api('POST', `/api/usuarios/${u.id}/activo`, { activo: !u.activo }); S.categorias = {}; pintar(); }) }, u.activo ? 'Desactivar' : 'Activar'))))),
      admin && h('form', { class: 'fila', onsubmit: async (ev) => { ev.preventDefault(); try { const r = await api('POST', '/api/usuarios', datosForm(ev.target)); S.categorias = {}; enlace.replaceChildren(h('p', {}, 'Pásale este enlace para que cree su contraseña (caduca en 7 días):'), h('input', { value: r.enlace, readonly: true, onfocus: (e) => e.target.select() })); } catch (e) { error(enlace, e); } } },
        h('input', { name: 'nombre', placeholder: 'Nombre', required: true, 'aria-label': 'Nombre' }), h('input', { name: 'email', type: 'email', placeholder: 'Correo', required: true, 'aria-label': 'Correo' }),
        h('select', { name: 'rol', 'aria-label': 'Papel' }, h('option', { value: 'gestor' }, 'Gestor'), h('option', { value: 'admin' }, 'Administrador')), h('button', {}, 'Invitar')), enlace));
}

// =====================================================================
// PORTAL DEL CLIENTE
// =====================================================================
async function marcoPortal(ruta) {
  const vista = ruta[0] || 'inicio';
  const cont = h('div');
  marco([['inicio', 'Inicio'], ['subir', 'Subir documentos'], ['documentos', 'Mis documentos'], ['impuestos', 'Mis impuestos'], ['asistente', 'Preguntar']], vista, cont);
  try {
    if (vista === 'subir') {
      cont.replaceChildren(h('h1', {}, 'Subir documentos'), h('p', { class: 'sub' }, 'Facturas que has emitido y facturas o tickets de tus gastos. Una foto nítida vale.'), h('div', { class: 'caja' }, zonaSubida(null, null)),
        h('p', { class: 'sub' }, 'Los leemos automáticamente. Si algo no está claro, lo revisa tu gestor.'));
    } else if (vista === 'documentos') {
      const docs = await api('GET', '/api/documentos');
      const TXT = { pendiente: ['Recibido', 'azul'], procesando: ['Recibido', 'azul'], error: ['Recibido', 'azul'], revisar: ['Lo revisa tu gestor', 'aviso'], contabilizado: ['Contabilizado', 'ok'], descartado: ['No válido', ''] };
      cont.replaceChildren(h('h1', {}, 'Mis documentos'), h('div', { class: 'caja' }, tabla(['Documento', 'Subido', 'Estado'], docs.map((d) => h('tr', {}, h('td', {}, h('a', { href: `/api/documentos/${d.id}/archivo`, target: '_blank', rel: 'noopener' }, d.nombre)), h('td', {}, hora(d.subido_en)), h('td', {}, chip(...TXT[d.estado])))), 'Aún no has subido nada.')));
    } else if (vista === 'impuestos') {
      const obs = await api('GET', '/api/obligaciones?todas=1');
      cont.replaceChildren(h('h1', {}, 'Mis impuestos'), h('p', { class: 'sub' }, 'Los importes son provisionales hasta que tu gestor los revise y presente.'),
        h('div', { class: 'caja' }, tabla(['Impuesto', 'Periodo', 'Plazo', 'Estado', '#Importe'], obs.map((o) => h('tr', {}, h('td', {}, h('b', {}, 'Modelo ' + o.codigo), h('div', { class: 'sub' }, o.nombre_modelo)), h('td', {}, `${o.periodo} ${o.ejercicio}`), h('td', {}, fecha(o.vence)),
          h('td', {}, chip(o.estado === 'presentado' ? 'Presentado' : 'En preparación', o.estado === 'presentado' ? 'ok' : '')), h('td', { class: 'num' }, o.importe == null ? '—' : [eur(o.importe), o.estado !== 'presentado' && h('div', { class: 'sub' }, 'provisional')]))), 'Sin impuestos en el calendario.')));
    } else if (vista === 'asistente') {
      const ms = await api('GET', '/api/mensajes');
      cont.replaceChildren(h('h1', {}, 'Preguntar'), h('p', { class: 'sub' }, 'Responde un asistente automático con los datos de tu expediente. Lo que requiere criterio profesional se lo pasa a tu gestor.'),
        h('div', { class: 'caja' }, chat(ms, async (t) => { await api('POST', '/api/mensajes', { texto: t }); pintar(); }, true)));
    } else {
      const p = await api('GET', '/api/portal');
      cont.replaceChildren(h('h1', {}, 'Hola, ' + p.cliente.nombre.split(' ')[0]), h('p', { class: 'sub' }, `Trimestre en curso: ${p.trimestre_en_curso}`),
        h('div', { class: 'rejilla' },
          h('div', { class: 'dato' }, h('b', {}, p.documentos_subidos_este_trimestre), h('span', {}, 'Documentos subidos este trimestre')),
          h('div', { class: 'dato' }, h('b', {}, p.facturas_contabilizadas_este_trimestre.emitidas + p.facturas_contabilizadas_este_trimestre.recibidas), h('span', {}, 'Facturas ya contabilizadas')),
          h('div', { class: 'dato' }, h('b', {}, p.documentos_pendientes_de_revisar_por_el_gestor), h('span', {}, 'En revisión por tu gestor'))),
        h('div', { class: 'fila' }, h('a', { class: 'boton', href: '#/subir' }, 'Subir documentos'), h('a', { class: 'boton', href: '#/asistente' }, 'Tengo una duda')), h('p', {}),
        h('div', { class: 'caja' }, h('h2', {}, 'Tus próximos plazos'), tabla(['Impuesto', 'Periodo', 'Plazo'], p.proximas_obligaciones.map((o) => h('tr', {}, h('td', {}, h('b', {}, 'Modelo ' + o.modelo), h('div', { class: 'sub' }, o.que_es)), h('td', {}, o.periodo), h('td', {}, fecha(o.vence)))), 'No tienes plazos cercanos.')));
    }
  } catch (e) { error(cont, e); }
}

pintar().catch((e) => { $app.textContent = 'No se pudo cargar la aplicación: ' + e.message; });
