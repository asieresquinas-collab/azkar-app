#!/usr/bin/env node
/**
 * EL NAVEGADOR DE MENTIRA — se ejecuta el codigo DE VERDAD de index.html (no se lee: se
 * ejecuta) dentro de un navegador simulado, para probar lo que Asier toca con el dedo:
 *
 *   - el enlace ?ficha=  (el boton 📄 de los widgets): que aterrice en LA FICHA
 *   - el boton de LLAMAR de la pestana Repaso: que pase por Zoiper y, si Zoiper no coge,
 *     que abra el marcador Y LO DIGA (nunca un toque mudo)
 *   - el boton de FICHA dentro de la app
 *   - los botones de cada raya: que solo se pinten si de verdad llevan a algun sitio
 *   - el telefono escrito como lo escriba el cliente (+34, 0034, guiones, parentesis)
 *
 * Esto caza cosas que mirar el codigo NO caza: el 27-jul saco dos fallos de verdad —
 * el aviso de "no he podido abrir la ficha" no se ejecutaba NUNCA (estaba detras de un
 * return) y el enlace de WhatsApp salia wa.me/3434626768600, un enlace muerto.
 *
 * Uso: node tests/repaso-botones.test.js
 */
// Prueba de VERDAD del enlace ?ficha= y de los botones del repaso en la app,
// ejecutando el código real de index.html en un navegador de mentira.
const fs = require('fs');
const path = require('path');
// La ruta sale de donde esta este fichero: vale en cualquier ordenador.
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
// Sacar una funcion ENTERA por la SANGRIA de su llave de cierre. Contar llaves a mano
// no vale: index.html tiene expresiones como .replace(/"/g, '&quot;') y esa comilla
// dentro de una barra hace creer al contador que empieza un texto — se traga media app.
function sacaFn(nom){
  const i = html.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error('no existe la funcion ' + nom);
  const ini = html.lastIndexOf('\n', i) + 1;
  const sangria = html.slice(ini, i);
  if (/\S/.test(sangria)) throw new Error(nom + ' no empieza en su propia linea');
  const fin = html.indexOf('\n' + sangria + '}', i);
  if (fin < 0) throw new Error('no se cierra la funcion ' + nom);
  return html.slice(i, fin + 1 + sangria.length + 1);
}
function saca(re, nom){ const m = html.match(re); if(!m) throw new Error('no encuentro '+nom); return m[0]; }
const bloqueDeep = saca(/\/\/ \u2500\u2500 v383: DEEP LINK de la FICHA[\s\S]*?\n  \}\)\(\);/, 'el bloque ?ficha=');
const fLlamar = sacaFn('_rpLlamar');
const fFicha  = sacaFn('_rpFicha');
const fJs     = sacaFn('_rpJs');
const fItem   = sacaFn('_rpItem');
const fEsc    = sacaFn('_rpEsc');
const fEstado = sacaFn('_rpEstado');   // el DE VERDAD: asi comprobamos el aviso tal cual lo ve Asier

let ok=0, mal=0;
function t(nom, fn){ try{ fn(); ok++; console.log('  ✅ '+nom); } catch(e){ mal++; console.log('  ❌ '+nom+' → '+e.message); } }
const A = require('assert');

// ── Navegador de mentira ────────────────────────────────────────────────
function navegador(op){
  op = op || {};
  const reg = { alertas:[], href:[], cargadas:[], pestanas:[], estados:[], oyentes:{} };
  const els = {};
  const ent = {
    reg: reg, els: els,
    location: { search: op.search || '', pathname:'/azkar-app/', hash:'',
      get href(){ return ''; }, set href(v){ reg.href.push(v); if (op.alHref) op.alHref(v, ent); } },
    history: { replaceState: (a,b,u)=>{ ent.location.search = (u.split('?')[1] ? '?'+u.split('?')[1] : ''); reg.limpiado = true; } },
    localStorage: { getItem: k => (op.token && k==='azkar_token') ? 'TOK' : null },
    document: {
      getElementById: id => els[id] || null,
      addEventListener: (e,f)=>{ (reg.oyentes[e]=reg.oyentes[e]||[]).push(f); },
      removeEventListener: (e,f)=>{ reg.oyentes[e] = (reg.oyentes[e]||[]).filter(x=>x!==f); },
      visibilityState: op.visibilidad || 'visible'
    },
    getComputedStyle: el => ({ display: (el && el.style && el.style.display) || 'block' }),
    navigator: { userAgent: op.ua || 'Mozilla/5.0 (Linux; Android 13) AppleWebKit' },
    alert: m => reg.alertas.push(String(m)),
    setInterval: (f,ms)=>{ const id={f:f,ms:ms}; reg.tick=f; return id; },
    clearInterval: id => { reg.parado = true; reg.tick = null; },
    setTimeout: (f,ms)=>{ reg.pendiente = f; reg.pendienteMs = ms; return 1; },
    scrollTo: ()=>{},
    loadPresupuesto: r => { reg.cargadas.push(r); if (op.fallaCarga) return Promise.reject(new Error('no existe')); if (!op.noRellena) els.f_ref = { value: r }; return Promise.resolve(); },
    ST: p => { reg.pestanas.push(p); },
    _rpEstado: (txt)=>{ reg.estados.push(String(txt)); },   // por si algun dia no se incluye el de verdad
    console: console
  };
  ent.window = ent;
  // El sitio donde el aviso aparece DE VERDAD en la pantalla de Asier.
  els['rp-estado'] = { _h:'', get innerHTML(){ return this._h; }, set innerHTML(v){ this._h = String(v); if (v) reg.estados.push(String(v)); } };
  if (op.enLogin !== false) els['login-screen'] = { style:{ display: op.token ? 'none' : 'block' } };
  return ent;
}
function corre(codigo, ent){
  const nombres = Object.keys(ent);
  new Function(nombres.join(','), '"use strict";' + codigo).apply(null, nombres.map(k=>ent[k]));
}
const CUERPO = fEsc+'\n'+fEstado+'\n'+fJs+'\n'+fLlamar+'\n'+fFicha+'\n'+fItem+'\n';

console.log('\n══ El enlace ?ficha= (el botón 📄 del widget) ══');

t('con sesión abierta: carga ESA ficha y enseña la pestaña de la ficha', ()=>{
  const e = navegador({ search:'?ficha=abc123', token:true });
  corre(bloqueDeep, e); e.reg.tick();
  return new Promise(r=>r()).then;
});
// (las promesas necesitan un tick: lo hacemos síncrono con una tanda de microtareas)
async function conTicks(e, veces){ for(let i=0;i<(veces||6);i++) await Promise.resolve(); }

(async function(){
  await (async()=>{
    console.log('\n══ El enlace ?ficha= — comprobado del todo ══');
    { const e = navegador({ search:'?ficha=abc123', token:true });
      corre(bloqueDeep, e); e.reg.tick(); await conTicks(e);
      t('carga la ficha que dice el enlace', ()=>A.deepEqual(e.reg.cargadas, ['abc123']));
      t('enseña la pestaña de la ficha', ()=>A.ok(e.reg.pestanas.includes('dossier'), 'pestañas: '+e.reg.pestanas));
      t('no molesta con avisos si ha salido bien', ()=>A.deepEqual(e.reg.alertas, []));
      t('limpia el parámetro (al recargar no vuelve a saltar)', ()=>A.ok(e.reg.limpiado && !/ficha=/.test(e.location.search), 'queda: '+e.location.search));
      t('para el reintento en cuanto lo consigue', ()=>A.ok(e.reg.parado));
    }
    { const e = navegador({ search:'?ficha=P%2F2026%20-1', token:true });
      corre(bloqueDeep, e); e.reg.tick(); await conTicks(e);
      t('una referencia con barra y espacio llega ENTERA', ()=>A.deepEqual(e.reg.cargadas, ['P/2026 -1']));
    }
    { const e = navegador({ search:'?ficha=abc123', token:true, fallaCarga:true });
      corre(bloqueDeep, e); e.reg.tick(); await conTicks(e);
      t('si la ficha no existe LO DICE (no se queda callado)', ()=>A.ok(e.reg.alertas.length===1 && /abc123/.test(e.reg.alertas[0]), 'avisos: '+JSON.stringify(e.reg.alertas)));
      t('y también limpia el parámetro al fallar', ()=>A.ok(e.reg.limpiado));
    }
    { const e = navegador({ search:'?ficha=abc123', token:true, noRellena:true });
      corre(bloqueDeep, e); e.reg.tick(); await conTicks(e);
      t('si dice que cargó pero la ficha está vacía, tampoco se lo cree', ()=>A.ok(e.reg.alertas.length===1, 'avisos: '+JSON.stringify(e.reg.alertas)));
    }
    { const e = navegador({ search:'?ficha=abc123', token:false });
      corre(bloqueDeep, e); e.reg.tick(); e.reg.tick(); await conTicks(e);
      t('sin sesión NO salta sobre el login (espera)', ()=>A.deepEqual(e.reg.cargadas, []));
      t('y sin sesión no avisa todavía (le da tiempo a entrar)', ()=>A.deepEqual(e.reg.alertas, []));
    }
    { const e = navegador({ search:'?ficha=abc123', token:false });
      corre(bloqueDeep, e); for(let i=0;i<601;i++) e.reg.tick && e.reg.tick(); await conTicks(e);
      t('si nunca arranca, al final LO DICE y no se queda esperando para siempre', ()=>A.ok(e.reg.alertas.length===1 && e.reg.parado, 'avisos: '+JSON.stringify(e.reg.alertas)+' parado='+e.reg.parado));
    }
    { const e = navegador({ search:'?ir=repaso', token:true });
      corre(bloqueDeep, e);
      t('si el enlace no trae ficha, este bloque no hace NADA', ()=>A.ok(!e.reg.tick && e.reg.cargadas.length===0));
    }

    console.log('\n══ El botón de LLAMAR de la app (Zoiper) ══');
    { const e = navegador({}); corre(CUERPO + '\n_rpLlamar("626 76 86 00");', e);
      t('abre Zoiper con el número de 9 cifras', ()=>A.ok(/^intent:\/\/626768600#Intent;scheme=tel;package=com\.zoiper\.android\.app;end$/.test(e.reg.href[0]), 'fue a: '+e.reg.href[0]));
      t('todavía no ha tocado el marcador', ()=>A.equal(e.reg.href.length, 1));
      e.document.visibilityState='visible'; e.reg.pendiente();
      t('si Zoiper no coge, abre el marcador con +34', ()=>A.equal(e.reg.href[1], 'tel:+34626768600'));
      t('y lo DICE (nunca un toque mudo)', ()=>A.ok(e.reg.estados.length===1 && /Zoiper/.test(e.reg.estados[0]), 'estados: '+JSON.stringify(e.reg.estados)));
    }
    { const e = navegador({}); corre(CUERPO + '\n_rpLlamar("+34626768600");', e);
      e.document.visibilityState='hidden'; e.reg.pendiente();
      t('si Zoiper SÍ se abrió, no molesta ni abre el marcador', ()=>A.ok(e.reg.href.length===1 && e.reg.estados.length===0, 'href:'+JSON.stringify(e.reg.href)+' estados:'+JSON.stringify(e.reg.estados)));
    }
    { const e = navegador({ ua:'Mozilla/5.0 (Windows NT 10.0) Chrome' }); corre(CUERPO + '\n_rpLlamar("626768600");', e);
      t('en el ordenador no intenta el intent de Android', ()=>A.deepEqual(e.reg.href, ['tel:+34626768600']));
    }
    { const e = navegador({}); corre(CUERPO + '\n_rpLlamar("12");', e);
      t('con algo que no es un teléfono, no llama y lo dice', ()=>A.ok(e.reg.href.length===0 && e.reg.estados.length===1, 'href:'+JSON.stringify(e.reg.href)));
    }
    { const e = navegador({}); corre(CUERPO + '\n_rpLlamar("6412");', e);
      t('una extensión de la centralita (6412) también va a Zoiper', ()=>A.ok(/intent:\/\/6412#/.test(e.reg.href[0]), 'fue a: '+e.reg.href[0]));
    }

    console.log('\n══ El botón de FICHA dentro de la app ══');
    { const e = navegador({}); corre(CUERPO + '\n_rpFicha("doc1");', e); await conTicks(e);
      t('carga la ficha y enseña su pestaña, sin salir de la app', ()=>A.ok(e.reg.cargadas[0]==='doc1' && e.reg.pestanas.includes('dossier')));
      t('y sin molestar con avisos', ()=>A.deepEqual(e.reg.alertas, []));
    }
    { const e = navegador({ fallaCarga:true }); corre(CUERPO + '\n_rpFicha("doc1");', e); await conTicks(e);
      t('si no puede, LO DICE', ()=>A.equal(e.reg.alertas.length, 1));
    }

    console.log('\n══ Los botones de cada raya ══');
    { const e = navegador({});
      corre(CUERPO + '\nglobalThis.__h = _rpItem({ nombre:"Ana", telefono:"+34 626768600", email:"ana@x.es", ficha_id:"doc1", ref:"P-2026-1", texto:"x", tipo:"borrador" });', e);
      const h = globalThis.__h;
      t('sale el botón de Llamar y pasa por Zoiper', ()=>A.ok(/_rpLlamar\('(\+?34)?626768600'\)/.test(h), h.slice(-700)));
      t('NO queda ningún enlace tel: que se salte Zoiper', ()=>A.ok(!/href='tel:/.test(h)));
      t('sale WhatsApp al número BUENO (nada de 34 pegado dos veces)', ()=>A.ok(/wa\.me\/34626768600['"]/.test(h), (h.match(/wa\.me\/[0-9]+/)||['(no hay whatsapp)'])[0]));
      t('sale Correo', ()=>A.ok(/mailto:ana@x\.es/.test(h)));
      t('sale Ficha, y usa el DOCUMENTO', ()=>A.ok(/_rpFicha\('doc1'\)/.test(h), h.slice(0,600)));
      t('pero lo que LEE Asier es la referencia', ()=>A.ok(/Ficha P-2026-1/.test(h)));
    }
    console.log('\n══ El teléfono, escrito como lo escriba el cliente ══');
    [['626768600','tal cual'],['+34 626 76 86 00','con +34 y espacios'],['0034626768600','con 0034'],
     ['34626768600','con 34 pegado'],['626-76-86-00','con guiones'],['(+34) 626768600','con paréntesis'],
     [' 626 768 600 ','con espacios sueltos']].forEach(function(par){
      const e = navegador({});
      corre(CUERPO + '\nglobalThis.__h = _rpItem({ nombre:"Ana", telefono:' + JSON.stringify(par[0]) + ', email:"", ficha_id:"", ref:"", texto:"x", tipo:"otro" });', e);
      const h = globalThis.__h;
      t('WhatsApp bueno con un teléfono ' + par[1] + ' → ' + par[0], ()=>{
        const w = (h.match(/wa\.me\/[0-9]+/)||['(ninguno)'])[0];
        A.equal(w, 'wa.me/34626768600', 'sale ' + w);
      });
      t('y Zoiper recibe el número bueno con ' + par[1], ()=>{
        const e2 = navegador({});
        const num = (h.match(/_rpLlamar\('([^']*)'\)/)||[])[1];
        A.ok(num !== undefined, 'no hay botón de llamar');
        corre(CUERPO + '\n_rpLlamar(' + JSON.stringify(num) + ');', e2);
        A.ok(/^intent:\/\/626768600#/.test(e2.reg.href[0]||''), 'Zoiper recibiría: ' + e2.reg.href[0]);
      });
    });
    { const e = navegador({});
      corre(CUERPO + '\nglobalThis.__h = _rpItem({ nombre:"Ana", telefono:"6412", email:"", ficha_id:"", ref:"", texto:"x", tipo:"otro" });', e);
      t('una extensión corta NO lleva botón de WhatsApp (ahí no llega nunca)', ()=>{
        A.ok(!/wa\.me/.test(globalThis.__h), 'pinta WhatsApp: ' + (globalThis.__h.match(/wa\.me\/[0-9]+/)||[])[0]);
      });
      t('pero SÍ lleva botón de llamar (por Zoiper, que es donde vive esa extensión)', ()=>{
        A.ok(/_rpLlamar\('6412'\)/.test(globalThis.__h), 'no hay botón de llamar a la extensión');
      });
    }

    { const e = navegador({});
      corre(CUERPO + '\nglobalThis.__h = _rpItem({ nombre:"Ana", telefono:"", email:"", ficha_id:"", ref:"", texto:"x", tipo:"otro" });', e);
      const h = globalThis.__h;
      t('sin datos NO se pinta ningún botón (nunca un toque muerto)', ()=>A.ok(!/_rpLlamar|_rpFicha|mailto:|wa\.me/.test(h), h.slice(0,300)));
    }
    { const e = navegador({});
      corre(CUERPO + '\nglobalThis.__h = _rpItem({ nombre:"O\'Neill", telefono:"626768600", email:"", ficha_id:"a\'b", ref:"a\'b", texto:"x", tipo:"borrador" });', e);
      const h = globalThis.__h;
      t('una comilla en la referencia no rompe el botón', ()=>A.ok(/_rpFicha\('a\\'b'\)/.test(h), h.slice(0,600)));
    }
    { const e = navegador({});
      corre(CUERPO + '\nglobalThis.__h = _rpItem({ nombre:"X", telefono:"", email:"", ficha_id:"", ref:"P-9", texto:"x", tipo:"borrador" });', e);
      t('un repaso de antes (solo ref, sin ficha_id) SÍ tiene botón de ficha', ()=>A.ok(/_rpFicha\('P-9'\)/.test(globalThis.__h)));
    }

    // ══ LA COSTURA: del SERVIDOR al DEDO DE ASIER, sin cortar por la mitad ══════════════
    // Aqui estaba el fallo de esta manana y nadie lo veia: las pruebas del servidor decian
    // "la URL esta bien" y las de la app decian "el enlace ?ficha= funciona"... pero cada una
    // con SU ejemplo escrito a mano. Nadie cogia la URL QUE FABRICA EL SERVIDOR y la metia
    // por donde la mete el widget. Eso es lo que se hace aqui: se ejecuta el _accionDe DE
    // VERDAD del backend, se coge su enlace tal cual, y se le da al bloque ?ficha= de la app.
    console.log('\n══ Del servidor al dedo: la MISMA url, sin escribir nada a mano ══');
    const BACK = process.env.AZKAR_BACKEND || path.resolve(__dirname, '..', '..', 'azkar-presupuestos');
    const P_RL = path.join(BACK, 'api', 'repaso-lunes.js');
    if (!fs.existsSync(P_RL)) {
      mal++;
      console.log('  ❌ SALTADA: no encuentro el backend en ' + BACK + ' (pon AZKAR_BACKEND=<ruta>) — NO se da por buena');
    } else {
      const src = fs.readFileSync(P_RL, 'utf8');
      const trz = ['_n9','_recorta','_accionDe'].map(n=>{
        const m = src.match(new RegExp('function '+n+'\\([\\s\\S]*?\\n\\}'));
        if (!m) throw new Error('no encuentro '+n+' en el backend');
        return m[0];
      }).join('\n');
      const APPW = (src.match(/_APP_WEB\s*=\s*['"]([^'"]+)['"]/)||[])[1];
      const accionDe = new Function('_APP_WEB', trz + '; return _accionDe;')(APPW);
      const todas = a => [a].concat((a && a.otras) || []);

      // Un caso normal y uno con el id lleno de caracteres raros: si el servidor escapa
      // distinto de como la app desescapa, la ficha que se abre NO es la que Asier tocó.
      for (const caso of [
        { id: 'abc123XYZ',   nota: 'un id normal' },
        { id: 'P/2026 -1&x', nota: 'un id con barra, espacio y &' },
        { id: 'a+b c',       nota: 'un id con + y espacio (el + es la trampa clásica)' }
      ]) {
        const fi = todas(accionDe('borradores', { ref:'P-1', ficha_id: caso.id, email:'ana@x.es', nombre:'Ana' }))
                     .find(x=>x.tipo==='ficha');
        t('el servidor da enlace de ficha con ' + caso.nota, ()=>A.ok(fi && fi.uri, 'no hay enlace'));
        if (!fi || !fi.uri) continue;
        // Lo que hace el widget: abrir esa URL tal cual. La app ve su parte de "?..."
        const busca = fi.uri.indexOf('?') >= 0 ? fi.uri.slice(fi.uri.indexOf('?')) : '';
        const e = navegador({ search: busca, token:true });
        corre(bloqueDeep, e); e.reg.tick && e.reg.tick(); await conTicks(e);
        t('…y la app abre EXACTAMENTE esa ficha (' + caso.nota + ')', ()=>{
          A.deepEqual(e.reg.cargadas, [caso.id],
            'el servidor mandó ' + fi.uri + ' y la app ha abierto ' + JSON.stringify(e.reg.cargadas));
        });
        t('…sin quejarse por el camino (' + caso.nota + ')', ()=>A.deepEqual(e.reg.alertas, []));
      }

      // Y al revés: si una cosa NO tiene ficha, el servidor no debe dar enlace y por tanto
      // el widget no pinta boton. Un boton que abre la app y ahi te deja es justo lo de hoy.
      const sinFicha = todas(accionDe('perdidas', { telefono:'626768600', ref:'', ficha_id:'', nombre:'Ana' }));
      t('sin ficha, el servidor NO da enlace (y el widget no pinta botón)',
        ()=>A.ok(!sinFicha.some(x=>x.tipo==='ficha'), 'da un botón de ficha que no lleva a ningún sitio'));
    }

    console.log('\n' + (mal===0 ? '✅ TODO EN VERDE' : '❌ HAY FALLOS') + ' — ' + ok + ' bien, ' + mal + ' mal');
    process.exit(mal?1:0);
  })();
})();
