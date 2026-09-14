/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
// LA LLAVE QUE NO LLEGABA AL MÓVIL (app v659)
//
// Asier, 11-sep: «pero es Karin se supone que me tenía que recordar cosas y no me
// ha mandado ni un recordatorio... primera regla, que me pueda hablar y yo lo oiga
// cuando está bloqueado».
//
// Lo que pasaba de verdad: la app le decía a la APK con qué llave preguntar al
// servidor, y le pasaba «window._apiKey», una variable que NO SE CREABA EN NINGÚN
// SITIO. Siempre valía cadena vacía. Dentro del móvil, el servicio de escucha y el
// cartero arrancan con «if (key.isEmpty()) return;», así que nunca mandaron un
// latido ni preguntaron si había recados. En tres días: cero partes del servicio.
//
// En las llamadas normales de la web no se notaba, porque el envoltorio de fetch
// rellena la cabecera él solo. Pero configurar() no es un fetch: lo que se le pasa
// es lo que se guarda en el móvil.
//
// Estas pruebas leen el index.html DE VERDAD que se sube.
//
// Ejecutar:  node tests/la-llave-que-no-llegaba.test.js
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log('  ✅ ' + nombre); }
  else { console.log('  ❌ ' + nombre + (detalle ? ' → ' + detalle : '')); fallos++; }
}

console.log('\n🔑 LA LLAVE QUE NO LLEGABA AL MÓVIL (app v659)\n');

// ── A · la variable existe de verdad ────────────────────────────────────────
console.log('A · «window._apiKey» tiene que existir');

ok('A1 · se define window._apiKey en algún sitio',
  /window\._apiKey\s*=/.test(HTML));

ok('A2 · se define con la llave buena, no a mano',
  /window\._apiKey\s*=\s*AZKAR_API_KEY/.test(HTML));

const iDef = HTML.search(/window\._apiKey\s*=\s*AZKAR_API_KEY/);
const iConst = HTML.search(/const\s+AZKAR_API_KEY\s*=/);
ok('A3 · se define DESPUÉS de crear AZKAR_API_KEY (si no, saldría «undefined»)',
  iConst > -1 && iDef > iConst, 'const en ' + iConst + ', asignación en ' + iDef);

// ── B · lo que se le pasa al móvil ──────────────────────────────────────────
console.log('\nB · lo que la app le guarda a la APK');

const llamadas = HTML.match(/\.configurar\(\s*\{[^}]*\}/g) || [];
ok('B1 · hay llamadas a configurar() en la app', llamadas.length > 0,
  'encontradas: ' + llamadas.length);

const conLlaveVacia = llamadas.filter(c => /apiKey:\s*window\._apiKey\s*\|\|\s*''/.test(c));
ok('B2 · NINGUNA le pasa la llave con el truco viejo («window._apiKey || \'\'»)',
  conLlaveVacia.length === 0, conLlaveVacia.join(' | '));

const sinLlave = llamadas.filter(c => !/apiKey:/.test(c));
ok('B3 · NINGUNA llama sin llave (llamar sin ella la BORRA dentro del móvil)',
  sinLlave.length === 0, sinLlave.join(' | '));

const sinBase = llamadas.filter(c => !/base:/.test(c));
ok('B4 · NINGUNA llama sin la dirección del servidor (se borraría igual)',
  sinBase.length === 0, sinBase.join(' | '));

ok('B5 · todas le pasan la llave de verdad',
  llamadas.every(c => /apiKey:\s*AZKAR_API_KEY/.test(c)),
  llamadas.filter(c => !/apiKey:\s*AZKAR_API_KEY/.test(c)).join(' | '));

// ── C · el botón de «cédeme el micro», que era el peor ──────────────────────
console.log('\nC · el interruptor de ceder el micrófono');

const _iCede = HTML.indexOf('window.azkarinCederSet');
const mCede = _iCede > -1 ? [HTML.slice(_iCede, _iCede + 1200)] : null;
ok('C1 · sigue estando el interruptor', !!mCede);
if (mCede) {
  ok('C2 · ya no guarda la llave en blanco',
    /apiKey:\s*AZKAR_API_KEY/.test(mCede[0]));
  ok('C3 · y manda también la dirección del servidor',
    /base:\s*RAILWAY_API/.test(mCede[0]));
}

// ── D · el cartero y el compañero preguntan con llave ───────────────────────
console.log('\nD · las preguntas al compañero llevan llave');

const compa = HTML.match(/companero\?[^'"`]*apiKey=[^'"`]*/g) || [];
ok('D1 · las llamadas al compañero mandan la llave en la dirección',
  compa.length > 0, 'encontradas: ' + compa.length);
ok('D2 · y esa llave sale de window._apiKey, que ahora ya vale algo',
  compa.every(c => /apiKey=/.test(c)));

// ── E · la versión ──────────────────────────────────────────────────────────
console.log('\nE · la versión sube en los tres sitios');

ok('E1 · index.html dice v659', /var APP_VERSION = 'v659'/.test(HTML));
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
ok('E2 · sw.js dice v659', /azkar-pwa-v659/.test(SW));
const VJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
ok('E3 · version.json dice v659', VJ.version === 'v659', VJ.version);

// ── F · queda contado en la ayuda ───────────────────────────────────────────
console.log('\nF · está contado en la ayuda');

ok('F1 · la ayuda habla de la llave vacía',
  /llave vac[íi]a/i.test(HTML));
ok('F2 · y dice que no hay que instalar nada',
  /no hay que instalar nada/i.test(HTML));

console.log('\n' + (fallos === 0 ? '✅ TODO BIEN' : '❌ FALLOS: ' + fallos) + '\n');
process.exit(fallos === 0 ? 0 : 1);
