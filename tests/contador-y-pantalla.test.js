'use strict';
// ════════════════════════════════════════════════════════════════════════════════════════════════════
//  EL CHAT DE AZKARIN: PANTALLA COMPLETA Y TOKENS POR SEGUNDO  ·  v742 (29-oct-2026, backend 2.7.1144)
//
//  Asier: «¿puedes poner un contador de tokens en Azkarin para que lo vea en el chat… digo tokens por segundo? ¿Y un
//  botón para que se expanda el chat a toda la pantalla, sin romper nada?».
//
//  🛑 LO QUE PROTEGE:
//   · el botón está arriba, al lado de cerrar; agranda y devuelve el chat y se acuerda; en el móvil estrecho no sale
//     (el chat ya ocupa la pantalla);
//   · debajo de cada respuesta salen los tokens por segundo (en gris, sin leerse en voz alta), con lo que manda el
//     servidor, por los tres caminos por los que llega una respuesta (la normal, la de confirmar y la del buzón).
//  Datos inventados.
// ════════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fallos = 0;
const ok = (n, x, d) => { console.log((x ? '  ✅ ' : '  ❌ ') + n + (x || !d ? '' : '  →  ' + d)); if (!x) fallos++; };

console.log('\n══ A · EL BOTÓN DE PANTALLA COMPLETA ══');
ok('A1 · está en la cabecera, justo antes de cerrar', /<button id="chatbot-grande-btn" onclick="chatbotPantallaCompleta\(\)"[^>]*>[\s\S]{0,400}<\/button>\s*<button onclick="chatbotToggle\(\)" title="Cerrar">&times;<\/button>/.test(HTML));
ok('A2 · en grande ocupa toda la pantalla (sin bordes redondos) y los mensajes no se estiran sin fin', /#chatbot-panel\.grande\{top:0;left:0;right:0;bottom:0;width:100%;max-width:none;height:100%;max-height:none;border-radius:0\}/.test(HTML) && /#chatbot-panel\.grande \.chat-msg\{max-width:min\(85%,900px\)\}/.test(HTML));
ok('A3 · en el móvil estrecho (donde el chat ya ocupa la pantalla) el botón no sale', /@media\(max-width:480px\)\{\s*#chatbot-grande-btn\{display:none\}/.test(HTML));
ok('A4 · se acuerda en este aparato (con try, por si el navegador no deja guardar) y cambia el dibujo y el texto', /window\.chatbotPantallaCompleta = function \(\) \{[\s\S]{0,260}localStorage\.setItem\('azkarin_grande', on \? '1' : '0'\)/.test(HTML) && /try \{ _pintarGrande\(localStorage\.getItem\('azkarin_grande'\) === '1'\); \} catch \(e\) \{\}/.test(HTML) && /'Volver al tamaño de antes' : 'Ver el chat en pantalla completa'/.test(HTML));

console.log('\n══ B · LOS TOKENS POR SEGUNDO ══');
const fNum = (HTML.match(/function _azkNum\(n, dec\) \{[\s\S]*?\n  \}\n/) || [''])[0];
const fTxt = (HTML.match(/function _azkTokensTexto\(tk\) \{[\s\S]*?\n  \}\n/) || [''])[0];
ok('B0 · están las piezas', !!(fNum && fTxt));
const T = new Function(fNum + fTxt + '\nreturn _azkTokensTexto;')();
const casa = T({ entrada: 25000, salida: 540, cache: 23350, llamadas: 2, segundos: 11.8, por_segundo: 54, medido: 'escribiendo', leyendo_por_segundo: 1650 });
ok('B1 · con el ordenador de casa: los tokens por segundo, lo escrito y en cuánto, y lo que lee por segundo', casa === '⚡ 54 tokens por segundo · 540 escritos en 11,8 s · leyendo 1650 por segundo', casa);
const nube = T({ entrada: 9000, salida: 300, segundos: 4.2, por_segundo: 71.4, medido: 'de punta a punta' });
ok('B2 · con uno de fuera: igual, sin la parte de leer', nube === '⚡ 71 tokens por segundo · 300 escritos en 4,2 s', nube);
ok('B3 · por debajo de diez, con un decimal; y sin tiempo, solo lo escrito (no se inventa la velocidad)', T({ salida: 40, segundos: 5, por_segundo: 8.04 }) === '⚡ 8 tokens por segundo · 40 escritos en 5 s' && T({ salida: 40, por_segundo: 7.5, segundos: 5.3 }) === '⚡ 7,5 tokens por segundo · 40 escritos en 5,3 s' && T({ salida: 40 }) === '⚡ 40 tokens escritos');
ok('B4 · va debajo del mensaje, después de la hora, y solo en lo que se pinta en el momento (no al volver a abrir)', /div\.appendChild\(_hs\); \} catch\(e\)\{\}\s*\n\s*try \{ if \(type === 'bot' && !\(opts && opts\.silencio\)\) _azkTokensEn\(div\); \} catch \(eTk\) \{\}/.test(HTML));
ok('B5 · no se lee en voz alta (la voz lee el texto del mensaje, no lo que se le añade debajo)', /var cleanForTTS = text\.replace/.test(HTML) && !/cleanForTTS[^\n]*chat-tokens/.test(HTML));
ok('B6 · se coge de la respuesta por los tres caminos (la normal, la de confirmar y la que esperaba en el buzón)', (HTML.match(/try \{ window\._azkTokensDe\(data\); \} catch \(eTk\) \{\}   \/\/ v742/g) || []).length === 2 && /var r = d\.respuesta;\s*\n\s*try \{ if \(window\._azkTokensDe\) window\._azkTokensDe\(r\); \} catch \(eTk\) \{\}/.test(HTML));
ok('B7 · solo se pone si es de esta respuesta (de hace menos de quince segundos) y una vez', /Date\.now\(\) - p\.t > 15000\) return;\s*\n\s*window\._azkTokensPend = null;/.test(HTML));

console.log('\n══ C · VERSIÓN ══');
const ver = (HTML.match(/var APP_VERSION = '(v\d+)';/) || [])[1];
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const VJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
ok('C1 · v742 o más, igual en la app, en el service worker y en version.json', ver && Number(ver.slice(1)) >= 742 && SW.indexOf("azkar-pwa-" + ver + "'") >= 0 && VJ.version === ver, ver + ' / ' + VJ.version);

console.log('\n' + (fallos ? '❌ ' + fallos + ' fallos' : '✅ pantalla completa y tokens por segundo: todo bien'));
process.exit(fallos ? 1 : 0);
