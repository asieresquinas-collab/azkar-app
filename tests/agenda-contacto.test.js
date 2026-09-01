'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  EL CLIENTE, EN LA AGENDA DEL MÓVIL  ·  app v562 (1-sep-2026)
//
//  Asier: «cada vez que un cliente me llama yo le hago la ficha, y luego tengo que
//  guardar su teléfono en el móvil con su número de cliente: 6655 Ariane».
//
//  🛑 LO QUE PROTEGE ESTE BANCO (con el código REAL sacado del index.html):
//   · que el nombre que se ve en el móvil sea «<nº> <nombre>», como él lo escribe,
//   · que el teléfono se le ponga bien el +34 SIN estropear los de fuera,
//   · que la tarjeta .vcf salga bien formada (y que una coma no la rompa),
//   · que NO se guarde un contacto a medias (sin nombre o sin teléfono),
//   · y que los botones estén en la ficha y en la lista.
// ══════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };

function trozo(desde, hasta) {
  const i = H.indexOf(desde), j = H.indexOf(hasta, i);
  return (i < 0 || j < 0) ? null : H.slice(i, j);
}
const SRC = trozo('function _telParaAgenda(tel) {', 'function guardarEnAgenda() {');

console.log('\n══ A · EL CÓDIGO ESTÁ ══');
c('A1 · las tres piezas (teléfono, nombre y tarjeta) existen', !!SRC);
if (!SRC) { console.log('\n  ' + bien + ' bien · ' + (mal + 1) + ' mal'); process.exit(1); }
const F = new Function(SRC + '; return { tel:_telParaAgenda, nom:_nombreParaAgenda, vcf:_vcardDe };')();

console.log('\n══ B · EL TELÉFONO, COMO LO MARCA EL MÓVIL ══');
c('B1 · un móvil español de nueve cifras lleva +34', F.tel('666555444') === '+34666555444', F.tel('666555444'));
c('B2 · escrito con espacios, igual', F.tel('626 768 600') === '+34626768600', F.tel('626 768 600'));
c('B3 · con guiones y paréntesis, también', F.tel('(94) 424-15-00') === '+34944241500', F.tel('(94) 424-15-00'));
c('B4 · si ya trae el 34 delante, no se dobla', F.tel('34666555444') === '+34666555444');
c('B5 · si ya trae el +, se deja tal cual', F.tel('+33612345678') === '+33612345678');
c('B6 · 🛑 un 00 de salida se convierte en +, no se le encasqueta el 34', F.tel('0033612345678') === '+33612345678', F.tel('0033612345678'));
c('B7 · 🛑 un número de fuera de nueve cifras... no existe: lo raro se deja como está',
  F.tel('12345') === '12345' && F.tel('') === '');

console.log('\n══ C · EL NOMBRE QUE VE EN LA PANTALLA CUANDO LE LLAMAN ══');
c('C1 · 🛑 el caso de Asier: «6655 Ariane»', F.nom('6655', 'Ariane') === '6655 Ariane', F.nom('6655', 'Ariane'));
c('C2 · sin número de ficha, va el nombre solo', F.nom('', 'Ariane') === 'Ariane');
c('C3 · sin nombre no hay contacto que valga', F.nom('6655', '') === '' && F.nom('', '') === '');
c('C4 · los espacios de más se quitan', F.nom('6655', '  Ariane   Pérez  ') === '6655 Ariane Pérez');
c('C5 · los acentos y las ñ se respetan', F.nom('6700', 'Begoña Muñoz') === '6700 Begoña Muñoz');

console.log('\n══ D · LA TARJETA DE CONTACTO (.vcf) ══');
const v = F.vcf('6655 Ariane', '+34666555444', 'ariane@correo.es');
c('D1 · empieza y acaba como manda', /^BEGIN:VCARD\r\n/.test(v) && /END:VCARD\r\n$/.test(v));
c('D2 · lleva el nombre que se ve', /\r\nFN:6655 Ariane\r\n/.test(v), JSON.stringify(v));
c('D3 · y el teléfono', /\r\nTEL;TYPE=CELL:\+34666555444\r\n/.test(v));
c('D4 · y el correo si lo hay', /EMAIL;TYPE=INTERNET:ariane@correo\.es/.test(v));
c('D5 · sin correo, no se inventa la línea', !/EMAIL/.test(F.vcf('6655 Ariane', '+34666555444', '')));
c('D6 · 🛑 una coma en el nombre no parte la tarjeta',
  /\r\nFN:6655 Ariane\\,S\.L\.\r\n/.test(F.vcf('6655 Ariane,S.L.', '+34666555444', '')));
c('D7 · las líneas van separadas con retorno de carro, como pide el formato',
  v.split('\r\n').filter(Boolean).length === 7, JSON.stringify(v.split('\r\n')));

console.log('\n══ E · 🛑 NADA A MEDIAS ══');
const G = trozo('function guardarEnAgenda() {', 'function abrirWhatsApp()');
c('E1 · sin nombre se avisa y no se guarda', /if \(!nom\) \{ alert\(/.test(G));
c('E2 · sin teléfono, igual', /tel\.replace\(\/\\D\/g, ''\)\.length < 6\) \{ alert\(/.test(G));
c('E3 · 🛑 y la que hace el trabajo también se planta', /if \(!n \|\| !t\) \{ alert\('Faltan el nombre o el teléfono/.test(G));
c('E4 · el número de la ficha sale del Nº Presupuesto y, si no, del Nº Cliente',
  /getElementById\('f_ref'\)[\s\S]{0,120}getElementById\('f_nc'\)/.test(G));

console.log('\n══ F · CÓMO SE ABRE EN CADA SITIO ══');
c('F1 · en Android se abre la agenda con el contacto ya escrito',
  /action=android\.intent\.action\.INSERT;type=vnd\.android\.cursor\.dir\/contact/.test(G));
c('F2 · con su nombre y su teléfono dentro', /S\.name=' \+ encodeURIComponent\(n\)/.test(G) && /S\.phone=' \+ encodeURIComponent\(t\)/.test(G));
c('F3 · y en ordenador o iPhone se descarga la tarjeta', /descargarTarjetaContacto\(n, t, email\);/.test(G));
c('F4 · la tarjeta se sirve como contacto de verdad', /type: 'text\/vcard;charset=utf-8'/.test(H));

console.log('\n══ G · LOS BOTONES, EN LA PANTALLA ══');
c('G1 · en la ficha, al lado del de WhatsApp', /onclick='guardarEnAgenda\(\)'/.test(H));
c('G2 · y se explica para qué es', /Guardar este cliente en la agenda del móvil, con su número delante/.test(H));
c('G3 · en cada ficha de MIS PRESUPUESTOS', /guardarContactoEnAgenda\(/.test(H) && /const agendaBtn =/.test(H));
c('G4 · 🛑 pero solo si esa ficha tiene teléfono (un botón que no puede hacer nada no se pinta)',
  /const agendaBtn = \(p\.f_nom && String\(p\.f_tel \|\| ''\)\.replace\(\/\\D\/g, ''\)\.length >= 6\)/.test(H));
c('G5 · y abrir la lista no abre la ficha por error', /event\.stopPropagation\(\);guardarContactoEnAgenda/.test(H));

console.log('\n══ H · VERSIÓN Y REGISTRO ══');
const _v = parseInt((H.match(/var APP_VERSION\s*=\s*['"]v?(\d+)/) || [])[1] || '0', 10);
c('H1 · la versión es la de este cambio o más nueva', _v >= 562, 'va por v' + _v);
c('H2 · y la caché del sw.js va a la par',
  new RegExp('azkar-pwa-v' + _v).test(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8')));
c('H3 · y la Ayuda lo cuenta', /GUARDAR AL CLIENTE EN LA AGENDA DEL MÓVIL \(app v562\)/.test(H));

console.log('\n──────────────────────────────────────────────');
console.log('  ' + bien + ' bien · ' + mal + ' mal');
console.log('──────────────────────────────────────────────');
process.exit(mal ? 1 : 0);
