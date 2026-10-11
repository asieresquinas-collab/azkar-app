// v678 · las respuestas de Azkarin se filtran antes de pintarse
const assert = require('assert'); const fs = require('fs');
const H = fs.readFileSync(__dirname + '/../index.html', 'utf8');
assert(/div\.innerHTML = _chatLimpio\(chatMarkdown\(text\)\)/.test(H), 'el chat pasa por el filtro');
assert(/function _chatLimpio\(html\)/.test(H) && /createElement\('template'\)/.test(H), 'se analiza en una template (no ejecuta nada)');
assert(/script,iframe,frame,frameset,object,embed/.test(H), 'fuera scripts y marcos');
assert(/"_waEnviar":1/.test(H) && /"azkarinHorarioSet":1/.test(H) && /"_abrirFuera":1/.test(H), 'nuestros botones siguen valiendo');
console.log('chat-filtrado: 4/4 ✅');
