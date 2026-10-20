'use strict';
// v700 · llamada continua sorda: el audio de la app nace en pausa en Android si no se toca la pantalla.
const fs = require('fs'), path = require('path');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let bien = 0, mal = 0;
const c = (n, x) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n); } };
c('A1 · el primer toque en cualquier sitio despierta el audio', /\['touchstart', 'pointerdown', 'click', 'keydown'\]\.forEach\(function\(ev\)\{ try \{ document\.addEventListener\(ev, _mpDespertarAudio, true\)/.test(H));
c('A2 · el botón prepara el audio dentro del toque', /if \(nuevo\) \{ try \{ _mpPrepararAudio\(\); \} catch \(e\) \{\} \}/.test(H));
c('A3 · el micro usa el audio preparado', /var ctx = \(_mp\.ctxPre && _mp\.ctxPre\.state !== 'closed'\) \? _mp\.ctxPre : new AC\(\);/.test(H));
c('A4 · si está dormido, el cartel lo dice', /e === 'dormido' \? '\\ud83d\\udc46 Toca la pantalla una vez para que te oiga'/.test(H) && /_mp\.ctx\.state === 'suspended'\) return _convPintarEstado\('dormido'\)/.test(H));
c('A5 · deja parte de dormido y despierto', /_vozParte\('audio_dormido'/.test(H) && /_vozParte\('audio_despierto'/.test(H));
console.log('\n' + (mal ? '❌ ' + mal + ' mal, ' : '✅ ') + bien + ' bien'); process.exitCode = mal ? 1 : 0;
