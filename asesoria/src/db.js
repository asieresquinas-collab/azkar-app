'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DIR_DATOS = process.env.DIR_DATOS || path.join(__dirname, '..', 'datos');
const DIR_ARCHIVOS = path.join(DIR_DATOS, 'archivos');

function abrir(ruta) {
  if (ruta !== ':memory:') fs.mkdirSync(DIR_ARCHIVOS, { recursive: true });
  const db = new DatabaseSync(ruta || path.join(DIR_DATOS, 'gestoria.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(`
  CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, nif TEXT NOT NULL UNIQUE, tipo TEXT NOT NULL DEFAULT 'autonomo',
    email TEXT, telefono TEXT, gestor_id INTEGER, iva INTEGER NOT NULL DEFAULT 1, retiene INTEGER NOT NULL DEFAULT 0,
    alquiler INTEGER NOT NULL DEFAULT 0, cuota_mensual REAL NOT NULL DEFAULT 0, notas TEXT, activo INTEGER NOT NULL DEFAULT 1,
    creado TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, pass_hash TEXT, nombre TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('admin','gestor','cliente')), cliente_id INTEGER REFERENCES clientes(id),
    activo INTEGER NOT NULL DEFAULT 1, invitacion_hash TEXT, invitacion_expira TEXT);
  CREATE TABLE IF NOT EXISTS sesiones (token_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id), expira TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS documentos (
    id INTEGER PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES clientes(id), nombre TEXT NOT NULL, ruta TEXT NOT NULL,
    mime TEXT NOT NULL, tamano INTEGER NOT NULL, hash TEXT NOT NULL, subido_por INTEGER, origen TEXT NOT NULL,
    subido_en TEXT NOT NULL DEFAULT (datetime('now')), estado TEXT NOT NULL DEFAULT 'pendiente',
    motivos TEXT, propuesta TEXT, auto INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS i_doc_cli ON documentos(cliente_id, estado);
  CREATE TABLE IF NOT EXISTS facturas (
    id INTEGER PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES clientes(id), documento_id INTEGER REFERENCES documentos(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('emitida','recibida')), numero TEXT, fecha TEXT NOT NULL,
    contraparte_nombre TEXT, contraparte_nif TEXT, base REAL NOT NULL DEFAULT 0, tipo_iva REAL, cuota_iva REAL NOT NULL DEFAULT 0,
    tipo_irpf REAL, retencion REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, categoria TEXT, cuenta TEXT,
    deducible INTEGER NOT NULL DEFAULT 1, descripcion TEXT, validada_por INTEGER, creado TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE INDEX IF NOT EXISTS i_fac_cli ON facturas(cliente_id, fecha);
  CREATE TABLE IF NOT EXISTS obligaciones (
    id INTEGER PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES clientes(id), modelo TEXT NOT NULL, ejercicio INTEGER NOT NULL,
    periodo TEXT NOT NULL, vence TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'pendiente', importe REAL, datos TEXT,
    calculado_en TEXT, presentado_en TEXT, presentado_por INTEGER, UNIQUE (cliente_id, modelo, ejercicio, periodo));
  CREATE TABLE IF NOT EXISTS tareas (
    id INTEGER PRIMARY KEY, cliente_id INTEGER REFERENCES clientes(id), titulo TEXT NOT NULL, detalle TEXT, clave TEXT UNIQUE,
    asignado_a INTEGER, vence TEXT, estado TEXT NOT NULL DEFAULT 'abierta', auto INTEGER NOT NULL DEFAULT 0, minutos INTEGER,
    creado TEXT NOT NULL DEFAULT (datetime('now')), cerrado TEXT);
  CREATE TABLE IF NOT EXISTS mensajes (
    id INTEGER PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES clientes(id), autor TEXT NOT NULL, usuario_id INTEGER,
    texto TEXT NOT NULL, derivado INTEGER NOT NULL DEFAULT 0, atendido INTEGER NOT NULL DEFAULT 0,
    creado TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE INDEX IF NOT EXISTS i_men_cli ON mensajes(cliente_id, id);
  CREATE TABLE IF NOT EXISTS correos (
    id INTEGER PRIMARY KEY, cliente_id INTEGER REFERENCES clientes(id), para TEXT, asunto TEXT NOT NULL, cuerpo TEXT NOT NULL,
    tipo TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'pendiente', error TEXT, creado TEXT NOT NULL DEFAULT (datetime('now')), enviado_en TEXT);
  CREATE TABLE IF NOT EXISTS recibos (
    id INTEGER PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES clientes(id), periodo TEXT NOT NULL, importe REAL NOT NULL,
    estado TEXT NOT NULL DEFAULT 'emitido', cobrado_en TEXT, UNIQUE (cliente_id, periodo));
  CREATE TABLE IF NOT EXISTS actividad (
    id INTEGER PRIMARY KEY, cuando TEXT NOT NULL DEFAULT (datetime('now')), tipo TEXT NOT NULL, auto INTEGER NOT NULL,
    cliente_id INTEGER, detalle TEXT);
  CREATE INDEX IF NOT EXISTS i_act ON actividad(cuando);
  `);
  return db;
}

// Envoltorio mínimo: q.all / q.get / q.run con parámetros posicionales.
function ayudas(db) {
  const cache = new Map();
  const prep = (sql) => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
  const q = {
    all: (sql, ...p) => prep(sql).all(...p),
    get: (sql, ...p) => prep(sql).get(...p),
    run: (sql, ...p) => prep(sql).run(...p),
    tx(fn) { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    ajustes() { return Object.fromEntries(q.all('SELECT clave, valor FROM ajustes').map((a) => [a.clave, a.valor])); },
    ajuste(clave, valor) { q.run('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor', clave, String(valor)); },
    registrar(tipo, auto, clienteId, detalle) { q.run('INSERT INTO actividad (tipo, auto, cliente_id, detalle) VALUES (?, ?, ?, ?)', tipo, auto ? 1 : 0, clienteId ?? null, detalle ?? null); },
  };
  return q;
}

module.exports = { abrir, ayudas, DIR_DATOS, DIR_ARCHIVOS };
