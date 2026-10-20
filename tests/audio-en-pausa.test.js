'use strict';
// v704 · el audio de la app nace en pausa (WebView nuevo): se crea en el toque, se despierta al tocar y, si no, grabadora de reserva
const fs = require('fs'), path = require('path');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let bien = 0, mal = 0;
const c = (n, x) => { if (x) { bien++; console.log('  ✅ ' + n); } else { mal++; console.log('  ❌ ' + n); } };
c('A1 · el botón rojo prepara el audio dentro del toque', /if \(nuevo\) \{ try \{ _mpPrepararAudio\(\); \} catch \(e\) \{\} \}/.test(H));
c('A2 · el micro usa ese audio preparado', /var ctx = \(_mp\.ctxPre && _mp\.ctxPre\.state !== 'closed'\) \? _mp\.ctxPre : new AC\(\);/.test(H));
c('A3 · cualquier toque despierta el audio dormido', /\['touchstart', 'pointerdown', 'click', 'keydown'\]\.forEach\(function\(ev\)\{ try \{ document\.addEventListener\(ev, _mpDespertarAudio, true\)/.test(H));
c('A4 · si sigue dormido, arranca la grabadora de reserva (sin pitidos)', /_mpGrabadoraArrancar\('audio en pausa al arrancar'\)/.test(H) && /new MediaRecorder\(_mp\.stream/.test(H));
c('A5 · la grabadora mide la voz decodificando aparte y no manda el silencio', /OfflineAudioContext/.test(H) && /if \(rms < 0\.012\) return;/.test(H));
c('A6 · la grabadora se apaga sola cuando el audio bueno anda', /_mpGrabadoraParar\('el audio bueno ya anda'\)/.test(H));
c('A7 · nunca salta al reconocedor de Android (el que pita)', !/_mpAudioNoVale/.test(H));
c('A8 · deja partes: audio_dormido, audio_despierto, grabadora_on/off', /_vozParte\('audio_dormido'/.test(H) && /_vozParte\('audio_despierto'/.test(H) && /_vozParte\('grabadora_on'/.test(H) && /_vozParte\('grabadora_off'/.test(H));
console.log('\n' + (mal ? '❌ ' + mal + ' mal, ' : '✅ ') + bien + ' bien'); process.exitCode = mal ? 1 : 0;
