'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  QUE LA APP ABRA RÁPIDO  ·  app v614  (5-sep-2026)
//
//  Asier: «revísame la apk porque no sé qué le pasa que le cuesta cargar».
//  Causa encontrada (comprobada con un navegador de verdad, no a ojo): el
//  servicio que guarda la copia de la app se instalaba con addAll, o sea TODO
//  de golpe; y en la lista hay un archivo de Google (la letra). Si ese fallaba
//  —cobertura floja, Google lento— la instalación entera se caía y la app se
//  quedaba SIN COPIA: cada vez que se abría, se bajaba la página entera de
//  internet (1,7 MB). Medido: 0 servicios registrados, y sin cobertura no abría.
//  Con el arreglo: servicio activo, la 2ª carga sale de la copia y abre sin red.
// ══════════════════════════════════════════════════════════════════════════════
const path = require('path'), fs = require('fs');
const RAIZ = path.join(__dirname, '..');
let bien = 0, mal = 0;
const c = (n, x, d) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n + (d ? '  →  ' + d : '')); } };
const SW = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
const H = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

console.log('\n══ A · LA COPIA SE GUARDA AUNQUE FALLE UN ARCHIVO ══');
c('A1 · ya no se guarda todo de golpe (nada de addAll)', !/cache\.addAll\(/.test(SW));
c('A2 · se guarda uno a uno y lo que falle no arrastra a los demás', /ASSETS\.map\(/.test(SW) && /\.catch\(\(\) => null\)/.test(SW));
c('A3 · el archivo de Google (la letra) sigue en la lista, pero ya no puede tumbar nada', /fonts\.googleapis\.com/.test(SW));

console.log('\n══ B · LA PÁGINA SE ENSEÑA YA Y SE REFRESCA POR DETRÁS ══');
c('B1 · primero se mira la copia guardada', /caches\.open\(CACHE_NAME\)\.then\(caja => caja\.match\('\.\/index\.html'\)\)/.test(SW));
c('B2 · se busca SOLO en la caja de esta versión (si no, devolvería la página vieja)', !/caches\.match\('\.\/index\.html'\)\.then\(guardada/.test(SW));
// la página se guarda con un nombre fijo: si se guardara con la dirección de entrada
// (?app=1, ?azkarin=voz…), abrir por otra puerta sería otra descarga entera
{
  const i = SW.indexOf("destination === 'document'"), j = SW.indexOf('// Everything else', i);
  const bloqueHtml = (i > 0 && j > i) ? SW.slice(i, j) : '';
  c('B3 · se guarda siempre con el mismo nombre, no con la dirección de entrada', /cache\.put\('\.\/index\.html', clone\)/.test(bloqueHtml) && !/cache\.put\(e\.request/.test(bloqueHtml), bloqueHtml ? 'ok' : 'no encuentro el bloque');
}
c('B4 · si hay copia, se abre con ella sin esperar a la red', /return guardada \|\| red;/.test(SW));
c('B5 · la versión se sigue mirando siempre por la red (version.json nunca se guarda)', /version\.json/.test(SW) && /SIEMPRE red, nunca cache/.test(SW));

console.log('\n══ C · AL ACTUALIZAR NO SE QUEDA SIN COPIA ══');
c('C1 · ya no se borran todas las cajas al detectar versión nueva', !/caches\.keys\(\)\.then\(function\(names\) \{\s*return Promise\.all\(names\.map\(function\(n\) \{ return caches\.delete\(n\); \}\)\);\s*\}\)\.then\(function\(\) \{\s*\/\/ Forzar update/.test(H));
c('C2 · ya no se desenchufa el servicio al actualizar', !/return Promise\.all\(regs\.map\(function\(r\) \{ return r\.unregister\(\); \}\)\);\s*\}\)\s*\}\)\.then\(function\(\) \{\s*ejecutarUpdateSiNoChat/.test(H));
c('C3 · la versión nueva se BAJA antes de reiniciar', /fetch\('\.\/index\.html\?v=' \+ encodeURIComponent\(data\.version\), \{ cache: 'reload' \}\)/.test(H));
c('C4 · y se deja guardada en la caja de esa versión', /caches\.open\('azkar-pwa-' \+ data\.version\)/.test(H) && /c\.put\('\.\/index\.html', r\.clone\(\)\)/.test(H));
c('C5 · si la descarga falla, no se toca nada y se reintenta luego', /No pude bajar la versión nueva/.test(H));
c('C6 · el ?clear=1 de emergencia sigue existiendo', /clear=1/.test(H));

console.log('\n══ D · LO QUE PESA LA APP (para no engordarla sin darse cuenta) ══');
const kb = Math.round(H.length / 1024);
c('D1 · la página no pasa de 4 MB', kb < 4096, kb + ' KB');
const b64 = (H.match(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]{500,}/g) || []);
const kbImg = Math.round(b64.join('').length / 1024);
console.log('     (dato: ' + b64.length + ' imágenes metidas dentro, ' + kbImg + ' KB — pendiente sacarlas a archivos aparte)');

console.log('\n──────────────────────────────');
console.log(bien + ' bien · ' + mal + ' mal');
process.exit(mal ? 1 : 0);
