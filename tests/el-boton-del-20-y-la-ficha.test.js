'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  LO QUE FALLABA EN LA APP EL 11-SEP  ·  app v653
//
//  1. «Ábreme su ficha con su presupuesto» → «no me la has abierto, no lo veo».
//     La abría en el DOSSIER (la portada con la foto), no en el presupuesto.
//  2. «Toqué lo del 20% de descuento y no ha hecho absolutamente nada.» Verdad:
//     la ficha 6637 de Sonia son «Servicio base: equipo y vehículo» + «Cajas/Maletas»,
//     las dos fuera de la promo. El botón se ponía naranja y el total no se movía.
//  3. Dos mensajes suyos se perdieron: el micro los mandó duplicados y lo único que
//     llegó fue «me ha llegado el mismo mensaje dos veces».
// ══════════════════════════════════════════════════════════════════════════════
const path = require('path'), fs = require('fs');
const RAIZ = path.join(__dirname, '..');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };
const H = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

console.log('\n══ A · LA FICHA SE ABRE DONDE ESTÁ EL PRESUPUESTO ══');
const iAbrir = H.indexOf("data.datos.accion === 'abrir_presupuesto'");
const bloque = H.slice(iAbrir, iAbrir + 1400);
c('A1 · 🛑 ya NO se abre el dossier', !/ST\('dossier'\)/.test(bloque), bloque.slice(0, 300));
c('A2 · se abre la pestaña de presupuesto', /ST\('presupuesto'\)/.test(bloque));
c('A3 · y se sube arriba del todo para que se vea', /scrollIntoView/.test(bloque));
c('A4 · se le dice dónde ha quedado', /abierto en la pesta[ñn]a Presupuesto/.test(bloque));

console.log('\n══ B · EL BOTÓN DEL 20% DICE LA VERDAD ══');
c('B1 · al pulsarlo se comprueba si descuenta algo', /function togglePromoManual\(\) \{[\s\S]{0,200}avisoPromoSinEfecto\(\);/.test(H));
c('B2 · se calcula la base a la que SÍ se le puede quitar', /function promoBaseDescontable\(\)/.test(H));
c('B3 · 🛑 si no le quita nada, se dice', /El 20% no le quita nada a este presupuesto/.test(H));
c('B4 · y se explica por qué (salida y cajas fuera)', /la salida y el servicio base no llevan descuento/.test(H));
c('B5 · hay hueco en pantalla para ese aviso', /id='promo-aviso-nada'/.test(H));
c('B6 · se le da la salida: meter el 20% en las líneas', /function promo20EnLineas\(\)/.test(H) && /Meter el 20% en las l\\u00edneas/.test(H));
c('B7 · 🛑 la salida y el servicio base NO se descuentan (norma suya del 9-ago)', /nombre === 'Salida' \|\| nombre === 'Servicio base: equipo y veh\\u00edculo'\) continue/.test(H));
c('B8 · una línea que ya lleva descuento no se toca', /if \(!\(u > 0 && p > 0\) \|\| d > 0\) continue/.test(H));
c('B9 · cuenta cuántas ha tocado', /20% metido en ' \+ n \+ ' l\\u00ednea/.test(H));
c('B10 · lo tocado a mano cuenta como tocado (no se pisa desde la nube)', /function promo20EnLineas\(\)[\s\S]{0,900}window\._rowsTocadasTs = Date\.now\(\)/.test(H));
c('B11 · al cargar una ficha, el banner se pinta como está de verdad', /window\._promoManual = !!data\._promoManual;\s*\n\s*try \{ actualizarBannerPromo\(\); avisoPromoSinEfecto\(\); \}/.test(H));

console.log('\n══ C · EL MISMO MENSAJE NO SALE DOS VECES ══');
c('C1 · la copia no se manda', /mismo mensaje dos veces en ' \+ \(Date\.now\(\) - window\._azkUltEnvio\.ts\)/.test(H));
c('C2 · se compara el texto normalizado, no el crudo', /window\._azkUltEnvio = \{ t: _dn, ts: Date\.now\(\) \}/.test(H));
c('C3 · solo mensajes largos: «sí» o «6435» se mandan siempre', /_dn\.length >= 25/.test(H));
c('C4 · y solo si va sin foto, vídeo ni PDF', /if \(msg && !fotoEnviar && !\(framesEnviar && framesEnviar\.length\) && !\(pdfsEnviar && pdfsEnviar\.length\)\) \{\s*\n\s*var _dn/.test(H));
c('C5 · 🛑 si el servidor corta una copia, no se pinta ese cartel', /if \(data && data\.duplicado\) \{ sendBtn\.disabled = false; stopProgPoll\(\); return; \}/.test(H));

console.log('\n══ D · VERSIÓN ══');
c('D1 · v653 o posterior', (function () { const m = H.match(/var APP_VERSION = 'v(\d+)'/); return !!m && Number(m[1]) >= 653; })());
c('D2 · la ayuda está al día', /LO NUEVO/.test(H));

console.log('\n' + bien + ' bien · ' + mal + ' mal');
process.exit(mal ? 1 : 0);
