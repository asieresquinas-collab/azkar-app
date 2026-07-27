#!/usr/bin/env node
/**
 * GUARDAS ESTÁTICAS de la APK v1.15 (los tres widgets) y del enlace de la app (v383).
 *
 * Esto NO prueba lógica de servidor (eso es /tmp/t_widget_repaso.js) ni la colocación de
 * las rayas en el móvil (eso es /tmp/javatest, que ejecuta el Java de verdad): prueba que
 * lo que se PUBLICA cuadra consigo mismo. Son los fallos que no se ven hasta que el widget
 * ya está en la pantalla de Asier: una raya de más en el layout que el Java no pinta, la
 * versión puesta en un sitio y no en el otro, la APK firmada con otra llave (que le
 * obligaría a DESINSTALAR), dos botones con el mismo código de toque (que harían que todos
 * los botones llamaran al mismo cliente), un botón que al tocarlo no hace nada...
 *
 * Uso: node tests/widgets-repaso.test.js   (desde la carpeta de la app)
 *
 * Vive DENTRO del repo a propósito: cuando estaba en /tmp se perdía al cerrar la sesión
 * y había que reescribirlo de memoria — y lo que se reescribe de memoria se reescribe peor.
 */
const fs = require('fs');
const cp = require('child_process');
const path = require('path');

// La versión que se está publicando AHORA y la anterior (para comparar la firma).
// Subir estos cuatro valores es lo único que hay que tocar aquí al sacar una APK nueva.
const VC = 16;                              // versionCode
const VN = '1.15';                          // versionName
const APK = 'azkar-widgets-v115.apk';       // la que se publica
const APK_ANT = 'azkar-widgets-v114.apk';   // la anterior: la firma tiene que ser LA MISMA

// Las rutas salen de DÓNDE ESTÁ este fichero, no de una ruta clavada: así vale en
// cualquier ordenador y no se rompe al mover la carpeta.
const APP = path.resolve(__dirname, '..');
// El backend es otro repo; normalmente está al lado. Si no está, esas guardas se saltan
// diciéndolo — nunca se dan por buenas en silencio.
const BACK = process.env.AZKAR_BACKEND || path.resolve(APP, '..', 'azkar-presupuestos');
const hayBack = fs.existsSync(path.join(BACK, 'api/repaso-lunes.js'));
const AW = path.join(APP, 'android-widgets');
const SRC = path.join(AW, 'app/src/main');
const JAVA = path.join(SRC, 'java/es/azkarmudanzas/widgets');

if (!hayBack) {
  console.log('\n  \u26a0\ufe0f  No encuentro el repo del servidor en ' + BACK + '.');
  console.log('     Las guardas que comparan widget \u2194 servidor van a salir en ROJO.');
  console.log('     (Ponlo al lado de esta carpeta, o AZKAR_BACKEND=/ruta node tests/widgets-repaso.test.js)\n');
}

let ok = 0, ko = 0;
const fallos = [];
function t(nombre, fn) {
  try { fn(); ok++; console.log('  ✅ ' + nombre); }
  catch (e) { ko++; fallos.push(nombre + ' → ' + e.message); console.log('  ❌ ' + nombre + ' → ' + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'no se cumple'); }
function leer(p) { return fs.readFileSync(p, 'utf8'); }
const layout = leer(path.join(SRC, 'res/layout/w_repaso.xml'));
const layoutRes = leer(path.join(SRC, 'res/layout/w_resumen.xml'));
const provider = leer(path.join(SRC, 'res/xml/widget_repaso.xml'));
const providerRes = leer(path.join(SRC, 'res/xml/widget_resumen.xml'));
const manifest = leer(path.join(SRC, 'AndroidManifest.xml'));
const gradle = leer(path.join(AW, 'app/build.gradle'));
const jRepaso = leer(path.join(JAVA, 'WidgetRepaso.java'));
const jResumen = leer(path.join(JAVA, 'WidgetResumen.java'));
const jAzkarin = leer(path.join(JAVA, 'WidgetAzkarin.java'));
const jRayas = leer(path.join(JAVA, 'Rayas.java'));
const jAccion = leer(path.join(JAVA, 'Accion.java'));
const jAccAct = leer(path.join(JAVA, 'AccionActivity.java'));
const jDatos = leer(path.join(JAVA, 'Datos.java'));
const jAbrir = leer(path.join(JAVA, 'AbrirAzkar.java'));
const jMain = leer(path.join(JAVA, 'MainActivity.java'));
const indexHtml = leer(path.join(APP, 'index.html'));

// ── Herramientas de lectura del Java (para no repetirlas en cada guarda) ──────────
/** El Java SIN comentarios: para preguntar por lo que el programa HACE, no por lo que explica.
 *  (Si no, un comentario que dice "ACTION_CALL queda fuera a propósito" haría saltar la
 *  guarda que precisamente comprueba que ACTION_CALL no se usa.) */
function sinComentarios(j) {
  return j.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const jAccActCodigo = sinComentarios(jAccAct);
/** Los R.id.* que hay dentro de un array del Java: IDS_LINEAS, IDS_FILAS, IDS_BOTONES. */
function idsDe(j, nombre) {
  const bloque = (j.match(new RegExp(nombre + '\\s*=\\s*new int\\[\\]\\{([\\s\\S]*?)\\}')) || [])[1];
  if (bloque === undefined) return null;
  return (bloque.match(/R\.id\.\w+/g) || []).map(s => s.replace('R.id.', ''));
}
/** Los ids de un patrón dentro de un layout, en el orden en que están escritos. */
function idsLayout(xml, re) {
  return (xml.match(re) || []).map(s => s.replace(/.*\/([\w]+)".*/, '$1'));
}
/** Los códigos de toque (requestCode) de un widget, resolviendo los de bucle. */
function codigosDe(nombre, j) {
  const base = Number((j.match(/COD_BOTON\s*=\s*(\d+)/) || [])[1]);
  const bot = idsDe(j, 'IDS_BOTONES');
  const nBot = bot ? bot.length : 0;
  const re = /PendingIntent\.get(?:Activity|Broadcast|Service)\(\s*\w+\s*,\s*([^,]+?)\s*,/g;
  const out = [];
  let m;
  while ((m = re.exec(j))) {
    const e = m[1].trim();
    if (/^\d+$/.test(e)) { out.push({ quien: nombre, expr: e, cods: [Number(e)] }); continue; }
    if (/^COD_BOTON\s*\+\s*i$/.test(e)) {
      assert(base >= 0, nombre + ' usa COD_BOTON+i pero no define COD_BOTON');
      assert(nBot > 0, nombre + ' usa COD_BOTON+i pero no tiene IDS_BOTONES');
      const r = [];
      for (let k = 0; k < nBot; k++) r.push(base + k);
      out.push({ quien: nombre, expr: e, cods: r });
      continue;
    }
    // Si aparece una forma nueva de calcular el código, MEJOR PARAR que dar por bueno
    // algo que no se ha comprobado: dos códigos iguales = todos los botones hacen lo mismo.
    throw new Error('código de toque que esta guarda no sabe resolver en ' + nombre + ': "' + e + '"');
  }
  return out;
}

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  GUARDAS DE LA APK v' + VN + ' (tres widgets) Y DE LA APP v383       ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

console.log('\n══ A) Los widgets por dentro: layout ↔ Java ══');

// A1 — las rayas del layout son EXACTAMENTE las que pinta el Java, y en el mismo orden.
t('A1 · las 12 rayas del layout del repaso son las 12 de IDS_LINEAS, en el mismo orden', () => {
  const enLayout = idsLayout(layout, /android:id="@\+id\/(rep\d+)"/g);
  const enJava = idsDe(jRepaso, 'IDS_LINEAS');
  assert(enLayout.length === 12, 'el layout tiene ' + enLayout.length + ' rayas, no 12');
  assert(enJava && enJava.length === 12, 'IDS_LINEAS tiene ' + (enJava || []).length + ' entradas, no 12');
  assert(JSON.stringify(enLayout) === JSON.stringify(enJava),
    'no coinciden:\n     layout=' + enLayout.join(',') + '\n     java  =' + enJava.join(','));
  assert(new Set(enJava).size === 12, 'hay ids repetidos en IDS_LINEAS');
});

// A1b (v1.15) — TEXTO, FILA y BOTÓN van de tres en tres: si se descolocan, el botón de
// una raya acabaría llamando a otra persona. Esto se comprueba en LOS DOS paneles.
t('A1b · en los dos paneles: texto, fila y botón van de tres en tres (layout ↔ Java)', () => {
  const paneles = [
    { n: 'repaso', j: jRepaso, x: layout, reT: /android:id="@\+id\/(rep\d+)"/g, reF: /android:id="@\+id\/(fila\d+)"/g, reB: /android:id="@\+id\/(bot\d+)"/g },
    { n: 'resumen', j: jResumen, x: layoutRes, reT: /android:id="@\+id\/(linea\d+)"/g, reF: /android:id="@\+id\/(fila_r\d+)"/g, reB: /android:id="@\+id\/(bot_r\d+)"/g }
  ];
  paneles.forEach(p => {
    const jT = idsDe(p.j, 'IDS_LINEAS'), jF = idsDe(p.j, 'IDS_FILAS'), jB = idsDe(p.j, 'IDS_BOTONES');
    assert(jT && jF && jB, p.n + ': falta alguno de los tres arrays (IDS_LINEAS/IDS_FILAS/IDS_BOTONES)');
    assert(jT.length === jF.length && jT.length === jB.length,
      p.n + ': ' + jT.length + ' textos, ' + jF.length + ' filas y ' + jB.length + ' botones — se descolocarían');
    const xT = idsLayout(p.x, p.reT), xF = idsLayout(p.x, p.reF), xB = idsLayout(p.x, p.reB);
    assert(JSON.stringify(xT) === JSON.stringify(jT), p.n + ': los textos del dibujo no son los del Java');
    assert(JSON.stringify(xF) === JSON.stringify(jF), p.n + ': las filas del dibujo no son las del Java');
    assert(JSON.stringify(xB) === JSON.stringify(jB), p.n + ': los botones del dibujo no son los del Java');
    assert(new Set(jB).size === jB.length, p.n + ': hay botones repetidos');
    // y el botón i tiene que estar DENTRO de la fila i, junto a su texto (si no, el
    // botón de Ricardo podría pintarse en la raya de Marta)
    for (let i = 0; i < jT.length; i++) {
      const bloque = (p.x.match(new RegExp('<LinearLayout[\\s\\S]{0,200}@\\+id/' + jF[i] + '"[\\s\\S]*?</LinearLayout>')) || [])[0];
      assert(bloque, p.n + ': no se encuentra la fila ' + jF[i] + ' en el dibujo');
      assert(bloque.includes('@+id/' + jT[i] + '"'), p.n + ': ' + jT[i] + ' no está dentro de ' + jF[i]);
      assert(bloque.includes('@+id/' + jB[i] + '"'), p.n + ': ' + jB[i] + ' no está dentro de ' + jF[i]);
    }
  });
});

// A1c (v1.15) — el botón nace ESCONDIDO y es lo bastante gordo para acertarle con el dedo.
t('A1c · los botones nacen escondidos y son lo bastante grandes para tocarlos', () => {
  [{ n: 'repaso', x: layout, re: /<TextView[\s\S]{0,600}?@\+id\/bot\d+"[\s\S]*?\/>/g },
   { n: 'resumen', x: layoutRes, re: /<TextView[\s\S]{0,600}?@\+id\/bot_r\d+"[\s\S]*?\/>/g }].forEach(p => {
    const bloques = p.x.match(p.re) || [];
    assert(bloques.length >= 12, p.n + ': solo se encuentran ' + bloques.length + ' botones en el dibujo');
    bloques.forEach((b, i) => {
      assert(/android:visibility="gone"/.test(b), p.n + ': el botón ' + (i + 1) + ' no nace escondido (saldría un botón fantasma)');
      const min = Number((b.match(/android:minWidth="(\d+)dp"/) || [])[1] || 0);
      assert(min >= 40, p.n + ': el botón ' + (i + 1) + ' mide ' + min + 'dp de ancho: no se acierta con el dedo');
    });
  });
});

// A2 — las piezas que se tocan existen en el layout y se usan en el Java.
t('A2 · cuerpo_rep / titulo_rep / refrescar_rep existen en el layout y se usan en el Java', () => {
  ['cuerpo_rep', 'titulo_rep', 'refrescar_rep'].forEach(id => {
    assert(layout.includes('@+id/' + id), 'falta @+id/' + id + ' en w_repaso.xml');
    assert(jRepaso.includes('R.id.' + id), 'el Java no usa R.id.' + id);
  });
  assert(/setOnClickPendingIntent\(R\.id\.cuerpo_rep/.test(jRepaso), 'el cuerpo no abre nada al tocarlo');
  assert(/setOnClickPendingIntent\(R\.id\.refrescar_rep/.test(jRepaso), 'la ↻ no refresca nada');
});

// A3 — el proveedor: layout bueno, estirable a lo alto y con refresco solo.
t('A3 · widget_repaso.xml: layout bueno, se puede estirar a lo alto y se refresca solo', () => {
  assert(/initialLayout="@layout\/w_repaso"/.test(provider), 'initialLayout no apunta a @layout/w_repaso');
  assert(/resizeMode="[^"]*vertical/.test(provider), 'no se puede estirar a lo alto (resizeMode sin vertical)');
  const per = (provider.match(/updatePeriodMillis="(\d+)"/) || [])[1];
  assert(per, 'no tiene updatePeriodMillis');
  assert(Number(per) >= 1800000, 'updatePeriodMillis=' + per + ' — Android no baja de 30 min de todos modos');
  assert(/widgetCategory="home_screen"/.test(provider), 'no se puede poner en la pantalla de inicio');
});

// A4 (v1.15) — las rayas que sobran se esconden ENTERAS: texto, fila y botón. Si se
// escondiera solo el texto, quedaría un botón suelto colgando... que además llamaría
// a quien fuera. Se comprueba en LOS DOS paneles.
t('A4 · las rayas que sobran se esconden ENTERAS (texto + fila + botón), en los dos paneles', () => {
  [{ n: 'repaso', j: jRepaso }, { n: 'resumen', j: jResumen }].forEach(p => {
    assert(/setViewVisibility\(IDS_LINEAS\[i\], android\.view\.View\.GONE\)/.test(p.j),
      p.n + ': no hay ningún GONE para los textos sobrantes: quedaría texto de la vez anterior');
    assert(/setViewVisibility\(IDS_FILAS\[i\], android\.view\.View\.GONE\)/.test(p.j),
      p.n + ': no se esconde la FILA sobrante: quedaría el hueco (y el botón) de la vez anterior');
    assert(/setViewVisibility\(IDS_BOTONES\[i\], android\.view\.View\.GONE\)/.test(p.j),
      p.n + ': no se esconde el BOTÓN sobrante: un botón colgando llamaría a quien no toca');
    assert(/setViewVisibility\(IDS_LINEAS\[i\], android\.view\.View\.VISIBLE\)/.test(p.j),
      p.n + ': no se vuelven a mostrar los textos al llenarlos');
    assert(/setViewVisibility\(IDS_FILAS\[i\], android\.view\.View\.VISIBLE\)/.test(p.j),
      p.n + ': no se vuelven a mostrar las filas al llenarlas');
  });
});

// A5 (v1.15) — EL TAMAÑO DE SALIDA. Este es el fallo que casi se cuela en la v1.14: el
// widget nacía con 180dp de alto (unas 5 rayas visibles) mientras el programa pintaba 12.
// Las 7 de abajo — incluida la del "… y N más" — se las comía la pantalla, así que Asier
// habría visto 5 cosas de 38 creyendo que no había más.
// v1.15: la cuenta ya no está en cada widget, está UNA VEZ en Rayas.java.
t('A5 · los dos paneles nacen bastante altos y el Java supone ese mismo alto', () => {
  const cab = Number((jRayas.match(/ALTO_CABECERA_DP\s*=\s*(\d+)/) || [])[1]);
  const raya = Number((jRayas.match(/ALTO_RAYA_DP\s*=\s*(\d+)/) || [])[1]);
  const sup = Number((jRayas.match(/FILAS_SI_NO_SE_SABE\s*=\s*(\d+)/) || [])[1]);
  assert(cab && raya && sup, 'faltan las medidas en Rayas.java');
  [{ n: 'repaso', x: provider, j: jRepaso, min: 6 }, { n: 'resumen', x: providerRes, j: jResumen, min: 6 }].forEach(p => {
    const dp = Number((p.x.match(/android:minHeight="(\d+)dp"/) || [])[1]);
    assert(dp, p.n + ': el proveedor no dice minHeight');
    const caben = Math.floor((dp - cab) / raya);
    assert(caben >= p.min, p.n + ': nace con ' + dp + 'dp: solo caben ' + caben + ' rayas (se perdería el "… y N más")');
    assert(sup === caben, p.n + ': el Java supone ' + sup + ' rayas y de salida caben ' + caben + ': pediría de más');
    const min = Number((p.x.match(/android:minResizeHeight="(\d+)dp"/) || [])[1]);
    assert(min && min < dp, p.n + ': no se puede encoger (minResizeHeight=' + min + ' con minHeight=' + dp + ')');
    const rayas = (idsDe(p.j, 'IDS_LINEAS') || []).length;
    assert(rayas >= caben, p.n + ': el dibujo tiene ' + rayas + ' rayas y de salida caben ' + caben);
  });
});

// A5b (v1.15) — el panel del RESUMEN es el de la foto de Asier: lo tenía casi a pantalla
// completa, salían 6 cosas y debajo medio panel en blanco. Ahora tiene que poder llenarlo.
t('A5b · el panel del resumen puede llenar la pantalla entera de Asier (16 rayas)', () => {
  const rayas = (idsDe(jResumen, 'IDS_LINEAS') || []).length;
  assert(rayas >= 16, 'el resumen solo pinta ' + rayas + ' rayas: volvería a quedar medio panel en blanco');
  assert(rayas <= 20, 'el resumen pide ' + rayas + ' rayas y el servidor solo sirve hasta 20');
  const cab = Number((jRayas.match(/ALTO_CABECERA_DP\s*=\s*(\d+)/) || [])[1]);
  const raya = Number((jRayas.match(/ALTO_RAYA_DP\s*=\s*(\d+)/) || [])[1]);
  // con un móvil normal en vertical (unos 500dp de alto útiles) tienen que caber muchas
  assert(cab + rayas * raya >= 400, 'con ' + rayas + ' rayas de ' + raya + 'dp no se llena una pantalla');
  assert(/Datos\.resumen\(ctx, filas\)/.test(jResumen), 'el resumen no le pide al servidor las rayas que caben');
});

console.log('\n══ B) La versión: todo dice lo mismo ══');

// B1 — versionCode/versionName idénticos en manifest y gradle.
t('B1 · versionCode ' + VC + ' y versionName ' + VN + ' dicen lo mismo en el manifest y en build.gradle', () => {
  const mC = (manifest.match(/android:versionCode="(\d+)"/) || [])[1];
  const mN = (manifest.match(/android:versionName="([^"]+)"/) || [])[1];
  const gC = (gradle.match(/versionCode\s+(\d+)/) || [])[1];
  const gN = (gradle.match(/versionName\s+'([^']+)'/) || [])[1];
  assert(mC === String(VC), 'manifest versionCode=' + mC + ', esperado ' + VC);
  assert(mN === VN, 'manifest versionName=' + mN + ', esperado ' + VN);
  assert(gC === mC, 'gradle versionCode=' + gC + ' ≠ manifest ' + mC);
  assert(gN === mN, 'gradle versionName=' + gN + ' ≠ manifest ' + mN);
});

// B2 — widgets-version.json cuadra y el fichero al que apunta existe.
t('B2 · widgets-version.json cuadra con la APK y el enlace existe de verdad', () => {
  const wv = JSON.parse(leer(path.join(APP, 'apk/widgets-version.json')));
  assert(wv.versionCode === VC, 'widgets-version.json versionCode=' + wv.versionCode);
  assert(wv.versionName === VN, 'widgets-version.json versionName=' + wv.versionName);
  assert(wv.url.endsWith('/apk/' + APK), 'la url no apunta a ' + APK + ': ' + wv.url);
  assert(!/\?v=/.test(wv.url), 'la url lleva ?v= (rompía la descarga en algunos Samsung)');
  const fichero = path.join(APP, 'apk', wv.url.split('/apk/')[1]);
  assert(fs.existsSync(fichero), 'no existe el fichero al que apunta: ' + fichero);
});

// B3 — la APK publicada dice de verdad la versión nueva (no es la de antes renombrada).
t('B3 · la APK publicada dice de verdad versionCode ' + VC + ' / versionName ' + VN + ' (aapt)', () => {
  const out = cp.execSync('aapt dump badging ' + path.join(APP, 'apk', APK),
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  assert(out.includes("versionCode='" + VC + "'"), 'la APK no dice versionCode ' + VC + ':\n     ' + out.split('\n')[0]);
  assert(out.includes("versionName='" + VN + "'"), 'la APK no dice versionName ' + VN);
  assert(/package: name='es\.azkarmudanzas\.widgets'/.test(out), 'el paquete no es es.azkarmudanzas.widgets');
});

// B4 — MISMA FIRMA que la anterior: si cambia, Asier tendría que DESINSTALAR.
t('B4 · la APK va firmada con la MISMA llave que la anterior (si no, habría que desinstalar)', () => {
  const huella = f => {
    const out = cp.execSync('apksigner verify --print-certs ' + path.join(APP, 'apk', f),
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const d = (out.match(/certificate SHA-256 digest:\s*([0-9a-f]{64})/i) || [])[1];
    const dn = (out.match(/certificate DN:\s*(.+)/) || [])[1];
    return { d: d, dn: (dn || '').trim() };
  };
  const vieja = huella(APK_ANT);
  const nueva = huella(APK);
  assert(nueva.d, 'la v' + VN + ' no está firmada');
  assert(nueva.d === vieja.d, 'FIRMA DISTINTA:\n     ' + APK_ANT + '=' + vieja.d + '\n     ' + APK + '=' + nueva.d);
  assert(nueva.d === 'd90d2e4ac06bfd7062d8d697f39ecdc0792c3d9486a4af86394579254044b23b',
    'la huella no es la de siempre: ' + nueva.d);
  assert(/CN=Azkar Widgets/.test(nueva.dn), 'el titular de la firma cambió: ' + nueva.dn);
});

// B5 — el enlace "sin versión" y el "con versión" son el MISMO fichero.
t('B5 · azkar-widgets.apk y ' + APK + ' son el mismo fichero (byte a byte)', () => {
  const a = fs.readFileSync(path.join(APP, 'apk/azkar-widgets.apk'));
  const b = fs.readFileSync(path.join(APP, 'apk', APK));
  assert(a.length === b.length, 'tamaños distintos: ' + a.length + ' vs ' + b.length);
  assert(Buffer.compare(a, b) === 0, 'el contenido no es idéntico');
});

// B6 — lo nuevo va DENTRO de la APK, no solo en el fuente.
t('B6 · los tres widgets y la pantalla de los botones están DENTRO de la APK publicada', () => {
  const out = cp.execSync('aapt dump xmltree ' + path.join(APP, 'apk', APK) + ' AndroidManifest.xml',
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  assert(/WidgetRepaso/.test(out), 'la APK no lleva el receiver WidgetRepaso');
  assert(/REFRESCAR_REPASO/.test(out), 'la APK no lleva la orden REFRESCAR_REPASO');
  assert(/WidgetResumen/.test(out) && /WidgetAzkarin/.test(out), 'se perdió alguno de los widgets de antes');
  assert(/AccionActivity/.test(out), 'la APK no lleva AccionActivity: los botones no harían nada');
});

// B7 — la APK que se publica lleva DENTRO el tamaño de salida nuevo (250dp), no el viejo.
t('B7 · las dos APK-provider nacen con el alto nuevo (lo de dentro, no solo el fuente)', () => {
  const dpDe = (out, attr) => {
    const m = out.match(new RegExp('android:' + attr + '\\([^)]*\\)=\\(type 0x5\\)0x([0-9a-f]+)', 'i'));
    assert(m, 'no se encuentra ' + attr + ' dentro de la APK');
    const v = parseInt(m[1], 16);
    // aapt escribe las medidas empaquetadas: 0xfa01 = 250 dp (los dp van en los bits altos,
    // el 0x01 del final es la unidad "dip"). Se desempaqueta para comparar con el fuente.
    assert((v & 0x0f) === 1, attr + ' no está en dp dentro de la APK (unidad ' + (v & 0x0f) + ')');
    assert(((v >> 4) & 0x03) === 0, attr + ' viene con decimales: no se puede comparar a ojo');
    return v >> 8;
  };
  [{ n: 'repaso', f: 'res/xml/widget_repaso.xml', src: provider },
   { n: 'resumen', f: 'res/xml/widget_resumen.xml', src: providerRes }].forEach(p => {
    const out = cp.execSync('aapt dump xmltree ' + path.join(APP, 'apk', APK) + ' ' + p.f,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const fuente = a => Number((p.src.match(new RegExp('android:' + a + '="(\\d+)dp"')) || [])[1]);
    ['minHeight', 'minResizeHeight'].forEach(a => assert(dpDe(out, a) === fuente(a),
      p.n + ': la APK lleva ' + a + '=' + dpDe(out, a) + 'dp y el fuente dice ' + fuente(a) + 'dp: es una APK vieja'));
    assert(dpDe(out, 'minHeight') >= 250,
      p.n + ': la APK nace con ' + dpDe(out, 'minHeight') + 'dp: volvería a quedar medio panel en blanco');
  });
});

console.log('\n══ C) El manifest: existe para Android y no se pisan los toques ══');

// C1 — receiver declarado con su meta-data.
t('C1 · el receiver .WidgetRepaso está declarado con su meta-data de proveedor', () => {
  const bloque = (manifest.match(/<receiver[^>]*\.WidgetRepaso[\s\S]*?<\/receiver>/) || [])[0];
  assert(bloque, 'no hay receiver .WidgetRepaso en el manifest');
  assert(/android:exported="true"/.test(bloque), 'el receiver no es exported (Android no lo ofrecería)');
  assert(/android\.appwidget\.action\.APPWIDGET_UPDATE/.test(bloque), 'falta la acción APPWIDGET_UPDATE');
  assert(/android:name="android\.appwidget\.provider"/.test(bloque), 'falta la meta-data del proveedor');
  assert(/android:resource="@xml\/widget_repaso"/.test(bloque), 'la meta-data no apunta a @xml/widget_repaso');
  assert(/android:label="[^"]*repaso[^"]*"/i.test(bloque), 'sin nombre reconocible en la lista de widgets');
});

// C2 — la orden de refrescar: la misma en manifest y Java, y DISTINTA de la del resumen.
t('C2 · la orden de refrescar es la misma en el manifest y en el Java, y distinta de la del resumen', () => {
  const jRep = (jRepaso.match(/ACCION_REFRESCAR\s*=\s*"([^"]+)"/) || [])[1];
  const jRes = (jResumen.match(/ACCION_REFRESCAR\s*=\s*"([^"]+)"/) || [])[1];
  assert(jRep, 'WidgetRepaso no define ACCION_REFRESCAR');
  assert(jRes, 'WidgetResumen no define ACCION_REFRESCAR');
  assert(jRep !== jRes, 'las dos órdenes son iguales (' + jRep + '): al refrescar uno se refrescaría el otro');
  const bloqueRep = (manifest.match(/<receiver[^>]*\.WidgetRepaso[\s\S]*?<\/receiver>/) || [])[0] || '';
  assert(bloqueRep.includes('android:name="' + jRep + '"'),
    'el manifest del repaso no escucha ' + jRep + ' (la ↻ no haría nada)');
  const bloqueRes = (manifest.match(/<receiver[^>]*\.WidgetResumen[\s\S]*?<\/receiver>/) || [])[0] || '';
  assert(bloqueRes.includes('android:name="' + jRes + '"'), 'el manifest del resumen perdió su acción');
});

// C3 (v1.15) — NINGÚN código de toque repetido en toda la APK. Este es EL fallo gordo de
// esta versión: Android NO mira los "extras" para distinguir un toque de otro, solo el
// código y la dirección. Dos botones con el mismo código = los dos hacen lo mismo, o sea,
// tocar "llamar a Marta" llamaría a Ricardo.
t('C3 · ningún código de toque repetido entre los tres widgets (ni dentro de uno)', () => {
  const todos = [].concat(codigosDe('azkarin', jAzkarin), codigosDe('resumen', jResumen), codigosDe('repaso', jRepaso));
  assert(todos.length >= 5, 'se esperaban al menos 5 sitios con PendingIntent, hay ' + todos.length);
  const deQuien = new Map();
  todos.forEach(g => g.cods.forEach(c => {
    const antes = deQuien.get(c);
    assert(!antes, 'el código ' + c + ' lo usan DOS toques distintos (' + antes + ' y ' + g.quien + ' · ' + g.expr + '): uno pisaría al otro');
    deQuien.set(c, g.quien + ' · ' + g.expr);
  }));
  // y que los rangos de botones son los que se esperan (100.. repaso, 200.. resumen)
  const rep = codigosDe('repaso', jRepaso).find(g => /COD_BOTON/.test(g.expr));
  const res = codigosDe('resumen', jResumen).find(g => /COD_BOTON/.test(g.expr));
  assert(rep && res, 'alguno de los dos paneles no pinta botones por raya');
  assert(rep.cods.length === (idsDe(jRepaso, 'IDS_BOTONES') || []).length, 'el repaso no reserva un código por botón');
  assert(res.cods.length === (idsDe(jResumen, 'IDS_BOTONES') || []).length, 'el resumen no reserva un código por botón');
  const solapan = rep.cods.filter(c => res.cods.includes(c));
  assert(solapan.length === 0, 'los códigos de los dos paneles se solapan: ' + solapan.join(','));
  assert(Math.abs(rep.cods[0] - res.cods[0]) >= 50,
    'los dos rangos empiezan demasiado cerca (' + rep.cods[0] + ' y ' + res.cods[0] + '): al añadir rayas chocarían');
});

// C3b (v1.15) — además del código, cada raya lleva su PROPIA dirección interna. Es el
// segundo cinturón: si un día dos códigos coincidieran, la dirección los sigue separando.
t('C3b · cada raya lleva además su propia dirección interna (azkarwidget://…/<widget>/<raya>)', () => {
  [{ n: 'repaso', j: jRepaso, pre: 'azkarwidget://repaso/' }, { n: 'resumen', j: jResumen, pre: 'azkarwidget://resumen/' }].forEach(p => {
    const pon = (p.j.match(/private void ponBoton\([\s\S]*?\n    \}/) || [])[0];
    assert(pon, p.n + ': no existe ponBoton');
    assert(pon.includes('"' + p.pre + '" + idWidget + "/" + i'),
      p.n + ': la dirección de la raya no lleva el widget y la raya: los toques se pisarían');
    assert(/setData\(Uri\.parse/.test(pon), p.n + ': la dirección no se pone como setData (Android no la miraría)');
  });
  const a = (jRepaso.match(/"azkarwidget:\/\/(\w+)\//) || [])[1];
  const b = (jResumen.match(/"azkarwidget:\/\/(\w+)\//) || [])[1];
  assert(a && b && a !== b, 'los dos paneles usan la misma dirección base (' + a + '): se pisarían entre ellos');
});

// C4 (v1.15) — la pantalla invisible de los botones, bien declarada y sin permisos de más.
t('C4 · AccionActivity está declarada, es invisible, no sale en recientes y NO pide llamar', () => {
  const bloque = (manifest.match(/<activity[^>]*\.AccionActivity[\s\S]*?\/>/) || [])[0];
  assert(bloque, 'no está declarada .AccionActivity: los botones no harían nada');
  assert(/android:exported="false"/.test(bloque), 'AccionActivity es exported: cualquier app podría llamar desde tu móvil');
  assert(/Theme\.Translucent/.test(bloque), 'AccionActivity no es transparente: se vería una pantalla en blanco al tocar');
  assert(/android:noHistory="true"/.test(bloque), 'AccionActivity se queda en el historial');
  assert(/android:excludeFromRecents="true"/.test(bloque), 'AccionActivity saldría en las apps recientes');
  assert(!/android\.permission\.CALL_PHONE/.test(manifest),
    'pide CALL_PHONE: le saltaría un permiso a Asier desde una pantalla invisible (a propósito NO se pide)');
});

// C5 (v1.15) — poder VER las apps a las que se va a llamar/escribir.
t('C5 · el manifest deja ver Zoiper, el marcador y el correo (si no, el botón no encontraría a nadie)', () => {
  const q = (manifest.match(/<queries>[\s\S]*?<\/queries>/) || [])[0];
  assert(q, 'no hay bloque <queries>: en Android 11+ no se vería ninguna app');
  ['tel', 'sip', 'mailto', 'https'].forEach(e =>
    assert(q.includes('android:scheme="' + e + '"'), 'falta el esquema ' + e + ' en <queries>'));
  assert(/android\.intent\.action\.DIAL/.test(q), 'falta ACTION_DIAL (el marcador de reserva)');
  assert(/android\.intent\.action\.SENDTO/.test(q), 'falta ACTION_SENDTO (el correo de reserva)');
  const paq = (jAccAct.match(/PAQUETE_ZOIPER\s*=\s*"([^"]+)"/) || [])[1];
  assert(paq === 'com.zoiper.android.app', 'el paquete de Zoiper no es el de Google Play: ' + paq);
  assert(q.includes('<package android:name="' + paq + '"'), '<queries> no nombra a Zoiper (' + paq + ')');
  const sdk = Number((manifest.match(/android:targetSdkVersion="(\d+)"/) || [])[1]);
  assert(sdk >= 24, 'targetSdkVersion muy antiguo: ' + sdk);
});

console.log('\n══ D) Lo que pide al servidor ══');

// D1 (v1.15) — ya no pide 12 a pelo: pide LAS QUE CABEN, y siempre dentro del tope del servidor.
t('D1 · pide al servidor las rayas que CABEN, recortadas al tope 3..20', () => {
  assert(/lineas=" \+ f|lineas=" \+ filas/.test(jDatos),
    'Datos.java no pide ?lineas= al servidor: el "… y N más" se caería de la pantalla');
  const bloque = (jDatos.match(/private static JSONObject pedirRepaso[\s\S]*?\n    \}/) || [])[0] || '';
  assert(/int f = filas < 3 \? 3 : \(filas > 20 \? 20 : filas\)/.test(bloque),
    'pedirRepaso no recorta a 3..20: el servidor rechazaría o devolvería otra cosa');
  const max = (jDatos.match(/\/api\/widget\/repaso\?max=(\d+)/) || [])[1];
  const rayas = (idsDe(jRepaso, 'IDS_LINEAS') || []).length;
  assert(max && Number(max) >= rayas, 'max=' + max + ' menor que las ' + rayas + ' rayas que se pintan');
  // el atajo repaso(ctx) sin medida no puede pedir más de lo que el widget pinta
  const porDefecto = Number((jDatos.match(/return repaso\(ctx,\s*(\d+)\)/) || [])[1]);
  assert(porDefecto >= 3 && porDefecto <= rayas,
    'repaso(ctx) por defecto pide ' + porDefecto + ' y solo se pintan ' + rayas);
});

// D1b (v1.15) — quien manda es el tamaño DE VERDAD del widget. La cuenta vive UNA VEZ en
// Rayas.java: si cada panel se la hiciera por su cuenta, el día que se tocara uno el otro
// se quedaría atrás y el botón de una raya podría acabar llamando a otra persona.
t('D1b · la cuenta de "cuántas rayas caben" está UNA VEZ (Rayas) y mira el alto real', () => {
  const f = (jRayas.match(/static int caben\([\s\S]*?\n    \}/) || [])[0];
  assert(f, 'no existe Rayas.caben');
  assert(/OPTION_APPWIDGET_MIN_HEIGHT/.test(f),
    'no usa la altura MÍNIMA garantizada: en apaisado pediría más rayas de las que se ven');
  assert(/getAppWidgetOptions/.test(f), 'no pregunta el tamaño a Android');
  assert(/min == 0 \|\| filas < min/.test(f), 'con varios widgets puestos no manda el más pequeño');
  assert(/catch \(Exception/.test(f), 'si Android no contesta, reventaría');
  assert(/filas > maxRayas/.test(f), 'podría pedir más rayas de las que hay en el dibujo');
  [{ n: 'repaso', j: jRepaso }, { n: 'resumen', j: jResumen }].forEach(p => {
    assert(/Rayas\.caben\(mgr, ids, IDS_LINEAS\.length\)/.test(p.j), p.n + ': no calcula las filas con Rayas.caben');
    assert(!/static int filasQueCaben|ALTO_CABECERA_DP\s*=|ALTO_RAYA_DP\s*=|FILAS_SI_NO_SE_SABE\s*=/.test(p.j),
      p.n + ': tiene su PROPIA copia de la cuenta — el día que se toque una, la otra se queda atrás');
  });

  // la misma cuenta, simulada, para todos los altos que Asier puede dejar, en los dos paneles
  const cab = Number((jRayas.match(/ALTO_CABECERA_DP\s*=\s*(\d+)/) || [])[1]);
  const raya = Number((jRayas.match(/ALTO_RAYA_DP\s*=\s*(\d+)/) || [])[1]);
  const sup = Number((jRayas.match(/FILAS_SI_NO_SE_SABE\s*=\s*(\d+)/) || [])[1]);
  [12, 16].forEach(RAYAS => {
    const sim = dp => {
      let filas = dp > 0 ? Math.floor((dp - cab) / raya) : sup;
      if (filas < 3) filas = 3;
      if (filas > RAYAS) filas = RAYAS;
      return filas;
    };
    for (let dp = 60; dp <= 900; dp += 5) {
      const pedidas = sim(dp);
      const deVerdad = Math.max(0, Math.floor((dp - cab) / raya));
      assert(pedidas >= 3 && pedidas <= RAYAS, 'con ' + dp + 'dp pide ' + pedidas);
      // solo puede pedir más de las que caben en widgets minúsculos, donde el suelo son 3
      assert(pedidas <= Math.max(3, deVerdad),
        'con ' + dp + 'dp caben ' + deVerdad + ' rayas y pide ' + pedidas + ': el "… y N más" se saldría');
    }
    assert(sim(0) === sup, 'sin saber el tamaño no supone ' + sup + ' rayas');
  });
});

// D1c (v1.15) — al estirarlo o encogerlo hay que volver a pedir. En LOS DOS paneles.
t('D1c · si Asier lo estira o lo encoge, se vuelve a pedir con la medida nueva (los dos)', () => {
  [{ n: 'repaso', j: jRepaso }, { n: 'resumen', j: jResumen }].forEach(p => {
    const m = (p.j.match(/public void onAppWidgetOptionsChanged[\s\S]*?\n    \}/) || [])[0];
    assert(m, p.n + ': no existe onAppWidgetOptionsChanged: al estirarlo seguiría enseñando las rayas de antes');
    assert(/onUpdate\(ctx, mgr, new int\[\]\{id\}\)/.test(m), p.n + ': no repinta el widget que ha cambiado');
    assert(/super\.onAppWidgetOptionsChanged/.test(m), p.n + ': no llama al de Android');
  });
});

// D2 — el widget NO escribe: solo GET.
t('D2 · el widget del repaso SOLO LEE (nada de POST/PUT/DELETE)', () => {
  const bloque = (jDatos.match(/private static JSONObject pedirRepaso[\s\S]*?\n    \}/) || [])[0];
  assert(bloque, 'no se encuentra pedirRepaso en Datos.java');
  assert(/"GET"/.test(bloque), 'pedirRepaso no usa GET');
  assert(!/"POST"|"PUT"|"DELETE"|"PATCH"/.test(bloque), 'pedirRepaso escribe en el servidor');
  assert(!/getOutputStream/.test(bloque), 'pedirRepaso manda cuerpo (estaría escribiendo)');
});

// D3 — si el pase caducó, se renueva y se reintenta una vez.
t('D3 · si el pase caduca, entra otra vez con la clave guardada y reintenta', () => {
  const bloque = (jDatos.match(/static JSONObject repaso\(Context ctx, int filas\)[\s\S]*?\n    \}/) || [])[0];
  assert(bloque, 'no se encuentra Datos.repaso(ctx, filas)');
  assert((bloque.match(/pedirRepaso\(/g) || []).length >= 2, 'no hay reintento tras renovar el pase');
  assert(/login\(|renueva|getString\("usuario"|getString\("pass"/.test(bloque),
    'no se ve que renueve la sesión con la clave guardada');
});

// D4 — la cache del repaso no pisa la del resumen.
t('D4 · la cache del repaso tiene sus propias claves (no pisa la del resumen)', () => {
  const claveRep = (jDatos.match(/cache_rep_\w+/g) || []);
  const claveRes = (jDatos.match(/"(cache_(?!rep_)\w+)"/g) || []);
  assert(claveRep.length >= 3, 'faltan claves cache_rep_* (hay ' + claveRep.length + ')');
  assert(claveRes.length >= 2, 'se perdieron las claves del resumen');
  const setRep = new Set(claveRep);
  claveRes.forEach(c => assert(!setRep.has(c.replace(/"/g, '')),
    'la clave ' + c + ' la usan los dos widgets: se pisarían la cache'));
  ['cache_rep_lineas', 'cache_rep_titulo', 'cache_rep_hora'].forEach(k =>
    assert(jDatos.includes(k), 'falta la clave ' + k));
});

// D5 (v1.15) — los botones se guardan con las rayas y se leen igual que vienen del servidor.
t('D5 · los botones se guardan junto a sus rayas y se leen con los nombres que manda el servidor', () => {
  ['cache_acciones', 'cache_rep_acciones'].forEach(k =>
    assert(jDatos.includes(k), 'no se guardan los botones: falta la clave ' + k));
  assert(/cacheAcciones\(/.test(jDatos) && /cacheAccionesRepaso\(/.test(jDatos), 'no se pueden leer los botones guardados');
  // los nombres de los campos tienen que ser EXACTAMENTE los que manda el servidor
  const srv = leer(path.join(BACK, 'api/repaso-lunes.js'));
  ['tipo', 'uri', 'etiqueta'].forEach(c => {
    assert(new RegExp('optString\\("' + c + '"').test(jAccion), 'Accion no lee el campo "' + c + '"');
    assert(new RegExp('\\b' + c + ':').test(srv), 'el servidor ya no manda el campo "' + c + '"');
  });
  // y los tipos que el servidor puede mandar tienen que estar contemplados en el móvil
  const tipos = [...srv.matchAll(/tipo:\s*'(\w+)'/g)].map(m => m[1]);
  assert(tipos.length >= 4, 'no se encuentran los tipos de botón en el servidor');
  tipos.forEach(ti => assert(jAccion.includes('"' + ti + '"') || /return false;/.test(jAccion),
    'el móvil no sabe qué hacer con un botón de tipo "' + ti + '"'));
});

console.log('\n══ E) Honestidad: nunca hacer pasar por de ahora lo de antes ══');

// E1 — si no se puede actualizar, lo DICE. En LOS DOS paneles (v1.15: el del resumen era
// justo el de la foto de Asier — ponía "AZKAR · 07:49" a las 13:01 y se quedaba tan ancho).
t('E1 · si no puede actualizar, lo DICE y enseña la hora de lo que hay puesto (los dos)', () => {
  [{ n: 'repaso', j: jRepaso, sinNada: 'No he podido traer el repaso', err: 'ultimoErrorRepaso' },
   { n: 'resumen', j: jResumen, sinNada: 'No he podido traer lo de hoy', err: 'ultimoErrorResumen' }].forEach(p => {
    assert(/No he podido actualizar/.test(p.j), p.n + ': no avisa cuando no puede actualizar');
    assert(/esto es de las/.test(p.j), p.n + ': no dice de cuándo es lo que está enseñando');
    assert(p.j.includes(p.sinNada), p.n + ': no avisa cuando no hay nada que enseñar');
    assert(p.j.includes(p.err), p.n + ': no cuenta el motivo del fallo');
    assert(/hayLogin/.test(p.j), p.n + ': no distingue el caso de no haber entrado nunca');
  });
});

// E2 (v1.15) — meter el aviso delante NO puede descolocar los botones. Antes esto era una
// función que solo movía TEXTOS; ahora el aviso se mete con un MAPA (Rayas.mapaConAviso)
// que se aplica igual al texto y al botón, para que sigan siendo pareja. Es la diferencia
// entre "llamar a Ricardo" y llamar a otro.
t('E2 · el aviso se mete con un mapa que mueve texto Y botón a la vez (nunca se descolocan)', () => {
  assert(!/conAvisoDelante/.test(jRepaso + jResumen + jRayas),
    'sigue existiendo conAvisoDelante: esa función solo movía textos y dejaba los botones donde estaban');
  const mapa = (jRayas.match(/static int\[\] mapaConAviso[\s\S]*?\n    \}/) || [])[0];
  assert(mapa, 'no existe Rayas.mapaConAviso');
  assert(/m\[cabe - 1\] = cuantas - 1;/.test(mapa), 'no se conserva a propósito la ÚLTIMA raya ("… y N más")');
  assert(/mapaConAviso\(int cuantas, int filas, int maxRayas\)/.test(mapa),
    'mapaConAviso tiene que recibir las filas que caben, no dar por hecho un tamaño');
  // el mismo mapa se aplica a los textos Y a las acciones, en los dos paneles y en los dos
  // sitios donde se mete un aviso (versión nueva / no se ha podido actualizar)
  [{ n: 'repaso', j: jRepaso }, { n: 'resumen', j: jResumen }].forEach(p => {
    const usos = (p.j.match(/int\[\] mapa = Rayas\.mapaConAviso\([^)]*\);/g) || []).length;
    assert(usos >= 2, p.n + ': solo ' + usos + ' sitio(s) usan el mapa; hay dos avisos posibles');
    const t1 = (p.j.match(/Rayas\.reordena\(\w+, mapa, /g) || []).length;   // textos (llevan aviso)
    const t2 = (p.j.match(/Rayas\.reordena\(\w+, mapa\)/g) || []).length;    // acciones
    assert(t1 >= 2 && t2 >= 2, p.n + ': el mapa no se aplica por igual a textos (' + t1 + ') y botones (' + t2 + ')');
  });
  // y la misma cuenta, simulada, para TODOS los tamaños que Asier puede dejar
  [12, 16].forEach(RAYAS => {
    const sim = (n, filas) => {
      let cabe = filas > 0 ? Math.min(filas, RAYAS) : RAYAS;
      if (cabe < 2) cabe = 2;
      if (n + 1 <= cabe) { const m = [-1]; for (let i = 1; i <= n; i++) m.push(i - 1); return m; }
      const m = new Array(cabe);
      m[0] = -1;
      for (let i = 1; i < cabe - 1; i++) m[i] = i - 1;
      m[cabe - 1] = n - 1;
      return m;
    };
    for (let filas = 2; filas <= RAYAS; filas++) {
      for (let n = 0; n <= 25; n++) {
        const m = sim(n, filas);
        const donde = 'con ' + RAYAS + ' rayas máx., filas=' + filas + ' y ' + n + ' cosas';
        assert(m.length <= Math.max(2, Math.min(filas, RAYAS)), donde + ': salen ' + m.length);
        assert(m[0] === -1, donde + ': el aviso no queda el primero');
        if (n > 0) assert(m[m.length - 1] === n - 1, donde + ': se perdió la última ("… y N más")');
        assert(m.every(x => x === -1 || (x >= 0 && x < n)), donde + ': apunta a una cosa que no existe');
        const reales = m.filter(x => x >= 0);
        assert(new Set(reales).size === reales.length, donde + ': una misma cosa sale dos veces');
      }
    }
  });
});

// E2b (v1.15) — MEJOR SIN BOTÓN QUE UN BOTÓN QUE LLAME A QUIEN NO ES.
t('E2b · si textos y botones no cuadran uno a uno, NO se pinta ningún botón', () => {
  [{ n: 'repaso', j: jRepaso }, { n: 'resumen', j: jResumen }].forEach(p => {
    const pinta = (p.j.match(/private void pinta\([\s\S]*?\n    \}\n/) || [])[0];
    assert(pinta, p.n + ': no se encuentra pinta()');
    assert(/boolean fiables = lineas != null && acciones != null && acciones\.length == lineas\.length;/.test(pinta),
      p.n + ': no se comprueba que haya EXACTAMENTE un botón por raya');
    assert(/ponBoton\(ctx, rv, id, i, fiables \? acciones\[i\] : null\)/.test(pinta),
      p.n + ': se pintan botones aunque no cuadren con los textos');
  });
});

// E3 — pinta la cache PRIMERO (nunca se queda en blanco) y avisa de versión nueva.
t('E3 · pinta primero lo último que tuvo (no se queda en blanco) y avisa de versión nueva', () => {
  const upd = (jRepaso.match(/public void onUpdate\([\s\S]*?\n    \}/) || [])[0];
  assert(upd, 'no se encuentra onUpdate');
  const posCache = upd.indexOf('cacheLineasRepaso');
  const posRed = upd.indexOf('Datos.repaso(ctx');
  assert(posCache > -1 && posRed > -1, 'falta la cache o la llamada al servidor');
  assert(posCache < posRed, 'pide al servidor ANTES de pintar la cache: el widget parpadearía en blanco');
  assert(/hayActualizacion/.test(jRepaso), 'no avisa de que hay APK nueva');
  assert(/Versión nueva/.test(jRepaso), 'no está el texto del aviso de versión nueva');
  // lo mismo en el del resumen (v1.15)
  const updR = (jResumen.match(/public void onUpdate\([\s\S]*?\n    \}/) || [])[0];
  assert(updR.indexOf('cacheLineas(ctx)') > -1 && updR.indexOf('cacheLineas(ctx)') < updR.indexOf('Datos.resumen(ctx'),
    'el resumen pide al servidor antes de pintar la cache');
  assert(/Datos\.cacheAcciones\(ctx\)/.test(updR), 'el resumen no recupera los botones de la cache');
});

// E4 (v1.15) — EL TÍTULO SIEMPRE SE VE: es donde va el "38 por hacer".
t('E4 · el título pinta lo que dice el servidor (ahí va el "38 por hacer")', () => {
  const p = (jRepaso.match(/private void pinta\([\s\S]*?\n    \}/) || [])[0];
  assert(p, 'no se encuentra pinta()');
  assert(/setTextViewText\(R\.id\.titulo_rep, "📋 " \+ t/.test(p),
    'el título no sale del servidor: se perdería la cuenta de lo que queda');
  assert(/titulo == null \|\| titulo\.isEmpty\(\)/.test(p), 'sin título del servidor se quedaría en blanco');
  assert(/r\.optString\("titulo"/.test(jRepaso), 'no coge el titulo de la respuesta del servidor');
  assert(/Datos\.cacheTituloRepaso/.test(jRepaso), 'no guarda ni reutiliza el título de la última vez');
  // el título nunca se esconde (a diferencia de las rayas, que sí pueden ir a GONE)
  assert(!/setViewVisibility\(R\.id\.titulo_rep/.test(jRepaso), 'el título se puede esconder: es lo único que se ve siempre');
});

// E5 (v1.15) — el layout tiene que poder enseñar el título entero de una sola línea.
t('E5 · el título cabe entero en una raya (no se corta el número)', () => {
  const bloque = (layout.match(/@\+id\/titulo_rep[\s\S]*?\/>/) || [])[0];
  assert(bloque, 'no está titulo_rep en el layout');
  assert(/singleLine="true"|maxLines="1"/.test(bloque), 'el título puede romperse en dos líneas y comerse una cosa');
  assert(/ellipsize/.test(bloque), 'sin ellipsize el texto largo se corta a lo bruto');
});

console.log('\n══ F) El enlace con la app (v383) ══');

// F1 — ?ir=repaso lleva a la pestaña repaso y limpia el parámetro.
t('F1 · ?ir=repaso abre la pestaña Repaso y luego se limpia el parámetro', () => {
  const bloque = (indexHtml.match(/DEEP LINK del WIDGET del REPASO[\s\S]*?\n\}\)\(\);/) || [])[0];
  assert(bloque, 'no está el bloque del deep link en index.html');
  assert(/ST\('repaso'\)/.test(bloque), "no llama a ST('repaso')");
  assert(/history\.replaceState/.test(bloque), 'no limpia el parámetro de la barra de direcciones');
  assert(/page-repaso/.test(bloque), 'no comprueba que la pestaña exista antes de saltar');
  assert(/azkar_token/.test(bloque), 'no espera a que haya sesión: saltaría sobre la pantalla de login');
  assert(/clearInterval/.test(bloque), 'el reintento no para nunca');
  assert(/if \(!\/\[\?&\]ir=repaso/.test(bloque), 'no sale pronto cuando NO viene el parámetro (sería intrusivo)');
});

// F2 — la url del widget casa con lo que busca la app.
t('F2 · la url del widget casa exactamente con lo que busca la app', () => {
  const url = (jDatos.match(/URL_APP_REPASO\s*=\s*"([^"]+)"/) || [])[1];
  assert(url, 'no existe URL_APP_REPASO en Datos.java');
  const busca = /[?&]ir=repaso\b/;
  const query = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?')) : '';
  assert(busca.test(query), 'la app NO reconocería ' + url);
  assert(/^https:\/\/asieresquinas-collab\.github\.io\/azkar-app\//.test(url), 'la url no es la de la app: ' + url);
  assert(jAbrir.includes('URL_APP_REPASO'), 'AbrirAzkar no usa URL_APP_REPASO');
  assert(/static Intent elRepaso\(/.test(jAbrir), 'no existe AbrirAzkar.elRepaso()');
  assert(/AbrirAzkar\.elRepaso\(ctx\)/.test(jRepaso), 'el widget no abre la app por elRepaso()');
});

// F3 — las tres versiones de la app dicen lo mismo.
// Nada de clavar aquí el número: eso se ponía en rojo solo con la siguiente entrega y había
// que venir a editar la prueba. Lo que se comprueba es que la versión sea al menos la de este
// trabajo Y que los TRES sitios digan exactamente lo mismo.
t('F3 · APP_VERSION, version.json y sw.js dicen la MISMA versión (y no una anterior)', () => {
  const app = (indexHtml.match(/var APP_VERSION\s*=\s*'(v\d+)'/) || [])[1];
  const vj = JSON.parse(leer(path.join(APP, 'version.json'))).version;
  const sw = (leer(path.join(APP, 'sw.js')).match(/CACHE_NAME\s*=\s*'azkar-pwa-(v\d+)'/) || [])[1];
  assert(app, 'no encuentro APP_VERSION en index.html');
  assert(parseInt(app.slice(1), 10) >= 383, 'versión sin subir: ' + app + ' (mínimo v383)');
  assert(vj === app, 'version.json dice ' + vj + ' y index.html ' + app);
  assert(sw === app, 'sw.js dice ' + sw + ' y index.html ' + app);
});

// F3b — el sello de hora de version.json y, sobre todo, CÓMO se decide actualizar.
// Los `ts` han ido desordenados alguna vez (la v381 lleva un ts MAYOR que la v382 y la v383).
// Hoy da igual porque la app compara la VERSIÓN, no la hora; pero si alguien escribiera algún
// día `if (data.ts > ...)`, un ts viejo dejaría a Asier clavado en la versión anterior y en
// silencio. Esta guarda es para que eso no pueda pasar sin enterarse.
t('F3b · la app decide actualizar por la VERSIÓN, nunca por la hora de version.json', () => {
  const vj = JSON.parse(leer(path.join(APP, 'version.json')));
  assert(typeof vj.ts === 'number' && String(vj.ts).length === 10,
    'el ts de version.json no es un sello en segundos: ' + vj.ts);
  const ahora = Math.floor(Date.now() / 1000);
  assert(vj.ts <= ahora + 86400, 'el ts de version.json está en el futuro: ' + vj.ts);
  // El trozo que decide si hay versión nueva
  const dec = (indexHtml.match(/fetch\('\.\/version\.json[\s\S]{0,1200}/) || [])[0];
  assert(dec, 'no encuentro dónde se mira version.json');
  const decCod = sinComentarios(dec);
  assert(/data\.version\s*!==\s*APP_VERSION/.test(decCod),
    'ya no se compara la versión: si se compara la hora, un ts desordenado deja la app vieja y callada');
  assert(!/data\.ts\s*[<>]/.test(decCod),
    'se está comparando la HORA para decidir la actualización: con los ts desordenados eso clava la app en la versión vieja');
});

// F4 — MainActivity: refresca también el nuevo y lo nombra en las instrucciones.
t('F4 · la app de widgets refresca también el del repaso y lo nombra en las instrucciones', () => {
  assert(/WidgetRepaso\.ACCION_REFRESCAR/.test(jMain), 'refrescaWidgets() no refresca el widget del repaso');
  assert(/WidgetResumen\.ACCION_REFRESCAR/.test(jMain), 'se perdió el refresco del widget del resumen');
  assert(/repaso/i.test(jMain), 'las instrucciones no nombran el widget del repaso: Asier no sabría que existe');
  assert(/tres/i.test(jMain), 'las instrucciones siguen hablando de dos widgets');
});

// F5 — el aviso de versión nueva compara contra la APK publicada.
t('F5 · el aviso de "hay versión nueva" mira el mismo fichero que se publica', () => {
  const wv = JSON.parse(leer(path.join(APP, 'apk/widgets-version.json')));
  const urlJson = (jDatos.match(/"(https:[^"]*widgets-version\.json[^"]*)"/) || [])[1];
  assert(urlJson, 'Datos.java no consulta widgets-version.json');
  assert(/asieresquinas-collab\.github\.io\/azkar-app\/apk\/widgets-version\.json/.test(urlJson),
    'consulta otro sitio: ' + urlJson);
  const mC = Number((manifest.match(/android:versionCode="(\d+)"/) || [])[1]);
  assert(wv.versionCode === mC,
    'widgets-version.json dice ' + wv.versionCode + ' y la APK ' + mC + ': avisaría de versión nueva en bucle');
});

console.log('\n══ G) El botón de cada cosa (v1.15) ══');

// G1 — un botón solo se pinta si LLEVA A ALGÚN SITIO de verdad.
t('G1 · un botón solo se pinta si de verdad lleva a algún sitio (teléfono, correo o ficha)', () => {
  const tb = (jAccion.match(/boolean tieneBoton\(\)[\s\S]*?\n    \}/) || [])[0];
  assert(tb, 'no existe Accion.tieneBoton()');
  assert(/uri == null \|\| uri\.isEmpty\(\)/.test(tb), 'una acción sin dirección pintaría botón');
  assert(/uri\.startsWith\("tel:"\) && AccionActivity\.soloNumero\(uri\)\.length\(\) >= 3/.test(tb),
    'un "llamar" sin número de verdad pintaría botón: Asier tocaría y no llamaría a nadie');
  assert(/uri\.startsWith\("mailto:"\) && uri\.indexOf\('@'\) > "mailto:"\.length\(\)/.test(tb),
    'un "correo" sin dirección pintaría botón');
  assert(/uri\.startsWith\("https:\/\/"\)/.test(tb), 'una "ficha" que no sea https pintaría botón');
  assert(/return false;/.test(tb), 'los tipos que no llevan a ningún sitio propio (app, repaso) pintarían botón');
  // y el que pinta hace caso a esa regla, en los dos paneles
  [{ n: 'repaso', j: jRepaso }, { n: 'resumen', j: jResumen }].forEach(p => {
    const pon = (p.j.match(/private void ponBoton\([\s\S]*?\n    \}/) || [])[0];
    assert(/if \(a == null \|\| !a\.tieneBoton\(\)\)/.test(pon), p.n + ': ponBoton no comprueba tieneBoton()');
    assert(/setViewVisibility\(IDS_BOTONES\[i\], android\.view\.View\.GONE\);\s*\n\s*return;/.test(pon),
      p.n + ': cuando no hay a dónde ir, el botón se queda pintado sin hacer nada');
  });
});

// G2 — NUNCA UN TOQUE MUERTO: si Zoiper no está o no coge el número, se dice y se copia.
t('G2 · nunca un toque muerto: si Zoiper falla, se abre el marcador y SE DICE', () => {
  const ll = (jAccAct.match(/private void llamar\([\s\S]*?\n    \}/) || [])[0];
  assert(ll, 'no existe llamar() en AccionActivity');
  assert(/num == null \|\| num\.length\(\) < 3/.test(ll), 'llamaría con un número que no es un número');
  assert(/paqueteZoiper\(this\)/.test(ll), 'no busca Zoiper: llamaría por el marcador normal');
  const intentos = (ll.match(/new Intent\(Intent\.ACTION_(VIEW|DIAL)/g) || []).length;
  assert(intentos >= 5, 'solo hay ' + intentos + ' formas de intentarlo: con una sola, si Zoiper cambia, no llama');
  assert(/getLaunchIntentForPackage/.test(ll), 'si Zoiper no coge el número, no se abre Zoiper a secas');
  assert((ll.match(/copia\(num\)/g) || []).length >= 2, 'no se copia el número cuando no hay manera');
  assert((ll.match(/aviso\(/g) || []).length >= 5, 'hay caminos que se quedan callados: Asier no sabría qué ha pasado');
  assert(!/ACTION_CALL\b/.test(jAccActCodigo), 'usa ACTION_CALL: le pediría el permiso CALL_PHONE desde una pantalla invisible');
  assert(/ACTION_CALL/.test(jAccAct), 'ni siquiera hay un comentario explicando por qué NO se usa ACTION_CALL: alguien lo volverá a meter');
  // y lo mismo para el correo y la ficha
  const sm = (jAccAct.match(/private void abrirSinMas\([\s\S]*?\n    \}/) || [])[0];
  assert(/ACTION_SENDTO/.test(sm), 'sin app de correo por VIEW no se prueba SENDTO');
  assert(/copia\(correo\)/.test(sm), 'sin app de correo no se copia la dirección');
  assert(/AbrirAzkar\.elRepaso\(this\)/.test(sm), 'el último recurso no es abrir el repaso de la app');
  const ar = (jAccAct.match(/private boolean arranca\([\s\S]*?\n    \}/) || [])[0];
  assert(/resolveActivity\(i, 0\) == null\) return false/.test(ar), 'lanza sin comprobar que haya quien lo atienda: reventaría');
  assert(/catch \(Exception e\) \{ return false; \}/.test(ar), 'si Android se queja, la pantalla invisible reventaría');
});

// G3 — Zoiper: el paquete bueno, y si algún día cambia, se busca por el nombre.
t('G3 · Zoiper se encuentra por paquete y, si cambia, por el nombre de la app', () => {
  const pz = (jAccAct.match(/static String paqueteZoiper\([\s\S]*?\n    \}/) || [])[0];
  assert(pz, 'no existe paqueteZoiper');
  assert(/estaInstalado\(ctx, guardado\)/.test(pz), 'se fía del paquete recordado sin comprobar que siga instalado');
  assert(/queryIntentActivities/.test(pz), 'si Zoiper cambiara de paquete, no se encontraría nunca');
  assert(/contains\("zoiper"\)/.test(pz), 'no busca por el nombre "zoiper"');
  assert(/catch \(Exception e\)/.test(pz), 'si Android no deja listar apps, reventaría');
  assert(/remove\(CLAVE_ZOIPER\)/.test(pz), 'si Zoiper se desinstala, se quedaría recordado para siempre');
  assert(/return null;/.test(pz), 'sin Zoiper no devuelve null: no se pasaría al marcador');
});

// G4 — "tel:6412" (extensiones de la centralita de Asier) tiene que valer.
t('G4 · las extensiones de la centralita (6412, 6461…) también se pueden llamar', () => {
  const sn = (jAccAct.match(/static String soloNumero\([\s\S]*?\n    \}/) || [])[0];
  assert(sn, 'no existe soloNumero');
  assert(/replaceAll\("\[\^0-9\+\*#\]", ""\)/.test(sn), 'se cargaría el + de los internacionales o el # de las extensiones');
  assert(/indexOf\(':'\)/.test(sn), 'no quita el "tel:" de delante');
  // simulación de la misma cuenta con los números de su Zoiper
  const soloNumero = s => { const i = String(s).indexOf(':'); return String(s).slice(i + 1).replace(/[^0-9+*#]/g, ''); };
  [['tel:626768600', '626768600'], ['tel:943700216', '943700216'], ['tel:6412', '6412'],
   ['tel:+34 688 12 34 01', '+34688123401'], ['tel:', ''], ['', '']].forEach(([e, s]) =>
    assert(soloNumero(e) === s, e + ' → "' + soloNumero(e) + '" y debería ser "' + s + '"'));
});

// G5 — tocar el TEXTO de una raya (o el cuerpo) nunca llama a nadie: abre la app.
t('G5 · un roce en el texto abre la app; llamar exige tocar el botón a propósito', () => {
  assert(/setOnClickPendingIntent\(R\.id\.cuerpo_rep, abrir\)/.test(jRepaso), 'el cuerpo del repaso no abre la app');
  assert(/setOnClickPendingIntent\(R\.id\.cuerpo, abrir\)/.test(jResumen), 'el cuerpo del resumen no abre la app');
  [{ n: 'repaso', j: jRepaso }, { n: 'resumen', j: jResumen }].forEach(p => {
    const t = idsDe(p.j, 'IDS_LINEAS') || [];
    t.forEach(id => assert(!new RegExp('setOnClickPendingIntent\\(R\\.id\\.' + id + '\\b').test(p.j),
      p.n + ': el texto ' + id + ' tiene su propio toque: un roce podría llamar a alguien'));
  });
});

// G6 — el destino lo decide el SERVIDOR en código, nunca el modelo.
t('G6 · a dónde lleva cada botón lo decide el código del servidor, nunca el modelo', () => {
  const srv = leer(path.join(BACK, 'api/repaso-lunes.js'));
  assert(/function _accionDe\(/.test(srv), 'no existe _accionDe: el destino no se decidiría en código');
  const f = (srv.match(/function _accionDe\([\s\S]*?\n\}/) || [])[0];
  assert(/const tel = _n9\(/.test(f), '_accionDe no normaliza el teléfono a 9 cifras');
  assert(/\^\[\^@\\s\]\+@\[\^@\\s\]\+\\\.\[\^@\\s\]\+\$/.test(f) || /@[^@\s]+\\\./.test(f),
    '_accionDe no comprueba que el correo sea un correo');
  assert(/switch \(clave\)/.test(f), '_accionDe no elige según el apartado (perdidas → llamar, correos → escribir…)');
  assert(!/gemini|modelo|llm/i.test(f), 'el destino del botón pasa por el modelo: tiene que ser código puro');
  const w = leer(path.join(BACK, 'api/widget.js'));
  assert(/acciones: acciones\.slice\(0, tope\)/.test(w), 'el servidor no recorta los botones igual que las rayas');
  assert((w.match(/acciones: acciones\.slice\(0, tope\)/g) || []).length === 2,
    'solo uno de los dos endpoints manda los botones recortados igual que las rayas');
});

// G7 — el botón 📄 tiene que ATERRIZAR en la ficha, no solo abrir la app.
// (Fallo real encontrado el 27-jul: el widget mandaba a ?ficha=REF y la app NO
//  entendía ese parámetro: abría la app y ahí te dejaba, en la pantalla de siempre.)
t('G7 · el botón de la ficha aterriza en LA FICHA, no en la pantalla de siempre', () => {
  const srv = leer(path.join(BACK, 'api/repaso-lunes.js'));
  const f = (srv.match(/function _accionDe\([\s\S]*?\n\}/) || [])[0];
  const uri = (f.match(/tipo: 'ficha'[\s\S]*?uri: ([^,}]+)/) || [])[1] || '';
  assert(/\?ficha=/.test(uri), 'la acción de ficha no manda a ?ficha=: ' + uri);
  assert(/encodeURIComponent/.test(uri), 'la referencia va sin escapar en la url');
  // el servidor tiene que mandar el NOMBRE DEL DOCUMENTO (lo único que la app sabe abrir)
  assert(/const fichaId = /.test(f), '_accionDe no calcula el documento de la ficha (ficha_id)');
  assert(/ficha_id/.test(f), '_accionDe no mira ficha_id: mandaría un texto en vez del documento');
  assert(/id: doc\.id/.test(srv), '_indiceFichas no guarda el nombre del documento');
  assert((srv.match(/ficha_id:/g) || []).length >= 4,
    'hay apartados del repaso cuyas cosas no llevan ficha_id: su botón 📄 no abriría nada');
  // …y la app tiene que ENTENDERLO
  const dl = (indexHtml.match(/DEEP LINK de la FICHA[\s\S]*?\n  \}\)\(\);/) || [])[0];
  assert(dl, 'la app NO tiene bloque que entienda ?ficha=: el botón abriría la app y ahí te dejaría');
  assert(/ficha=\(\[\^&\]\+\)/.test(dl), 'no saca la referencia del parámetro');
  assert(/loadPresupuesto\(_ref\)/.test(dl), 'no carga la ficha');
  assert(/ST\('dossier'\)/.test(dl), 'carga la ficha pero no enseña la pestaña de la ficha');
  assert(/azkar_token/.test(dl), 'no espera a que haya sesión: saltaría sobre el login');
  assert(/history\.replaceState/.test(dl), 'no limpia el parámetro: al recargar volvería a saltar');
  assert(/clearInterval/.test(dl), 'el reintento no para nunca');
  assert(/alert\(/.test(dl), 'si la ficha no se abre se queda CALLADO: hay que decirlo');
  assert(/f_ref/.test(dl), 'no comprueba de verdad que la ficha se haya cargado (se lo creería sin mirar)');
});

// G8 — en la app, llamar también es por Zoiper, y con vuelta atrás que SE DICE.
t('G8 · en la app, el botón de llamar abre Zoiper (y si no, lo dice y abre el marcador)', () => {
  const ll = (indexHtml.match(/function _rpLlamar\([\s\S]*?\n\}/) || [])[0];
  assert(ll, 'no existe _rpLlamar en la app');
  assert(ll.includes('com.zoiper.android.app'), 'la app no abre Zoiper: llamaría por el marcador normal');
  assert(/intent:\/\//.test(ll), 'no usa el intent de Android para abrir Zoiper');
  assert(/scheme=tel/.test(ll), 'el intent no lleva el esquema tel: Zoiper no lo cogería');
  assert(/location\.href = marcador/.test(ll), 'si Zoiper falla no hay vuelta atrás al marcador');
  assert(/_rpEstado\(/.test(ll), 'la vuelta atrás es muda: Asier no sabría por qué no se abrió Zoiper');
  assert(/visibilityState/.test(ll), 'no mira si de verdad se fue de la app: avisaría aunque Zoiper SÍ se abriera');
  assert(/Android/.test(ll), 'no distingue Android: en el ordenador el intent no existe');
  assert(/n\.length < 3/.test(ll), 'llamaría con algo que no es un número');
  // el botón de la lista tiene que usarlo (y no un tel: pelado como antes)
  const item = (indexHtml.match(/function _rpItem\([\s\S]*?\n\}/) || [])[0];
  assert(item, 'no existe _rpItem');
  assert(/_rpLlamar\('/.test(item), 'el botón Llamar de la lista no pasa por Zoiper');
  assert(!/href='tel:/.test(item), 'sigue habiendo un enlace tel: directo: se saltaría Zoiper');
  assert(/_rpFicha\('/.test(item), 'las cosas del repaso no tienen botón de ficha en la app');
  assert(/i\.ficha_id \|\| i\.ref/.test(item), 'el botón de ficha de la app no usa el documento que manda el servidor');
  assert(/_rpJs\(/.test(item), 'los datos se meten en el onclick sin escapar: una comilla lo rompería');
  const fi = (indexHtml.match(/function _rpFicha\([\s\S]*?\n\}\n/) || [])[0];
  assert(fi, 'no existe _rpFicha');
  assert(/loadPresupuesto\(ref\)/.test(fi), '_rpFicha no carga la ficha');
  assert(/alert\(/.test(fi), '_rpFicha se queda callado si no puede abrirla');
});

// G9 — la rendición del enlace ?ficha= tiene que ser ALCANZABLE.
// (Fallo real cazado el 27-jul con el navegador de mentira: el "si no arranca, dilo" estaba
//  DESPUÉS de los `return` de "sin sesión" — o sea, justo en el caso para el que se escribió
//  nunca llegaba a ejecutarse: el reintento latía para siempre y CALLADO.)
t('G9 · si la ficha no se puede abrir, el aviso de rendición SE ALCANZA de verdad', () => {
  const dl = (indexHtml.match(/DEEP LINK de la FICHA[\s\S]*?\n  \}\)\(\);/) || [])[0];
  assert(dl, 'no hay bloque del enlace ?ficha=');
  const cb = (dl.match(/setInterval\(function\(\)\{[\s\S]*?\n      \}, 500\);/) || [])[0];
  assert(cb, 'no encuentro el reintento del enlace ?ficha=');
  // Sin comentarios: preguntamos por lo que el programa HACE. Un comentario que EXPLICA
  // el fallo ("estaba después de los return") no puede hacer saltar la guarda.
  const cbCod = sinComentarios(cb);
  const iTope = cbCod.indexOf('_nf >');
  const iRet = cbCod.indexOf('return');
  assert(iTope > -1, 'el reintento no tiene tope: latiría para siempre');
  assert(iRet === -1 || iTope < iRet,
    'el tope está DESPUÉS de un return: en el caso malo no se ejecuta nunca y se queda callado');
  assert(/clearInterval/.test(cbCod.slice(iTope, iTope + 400)), 'al rendirse no para el reintento');
  assert(/alert\(/.test(cbCod.slice(iTope, iTope + 900)), 'se rinde en silencio: hay que decirlo');
  assert(/azkar_token/.test(cbCod.slice(iTope, iTope + 900)),
    'el aviso no distingue "no has entrado" de "la app no arranca": diría algo que no es');
  const tope = parseInt((cbCod.match(/_nf > (\d+)/) || [])[1] || '0', 10);
  assert(tope >= 120, 'se rinde en ' + Math.round(tope / 2) + 's: no da tiempo ni a escribir la contraseña');
});

// G10 — el teléfono que escribe el cliente ("+34 626 76 86 00") no puede acabar en wa.me/3434…
t('G10 · el botón de WhatsApp lleva al número BUENO, y solo si de verdad hay WhatsApp', () => {
  const item = (indexHtml.match(/function _rpItem\([\s\S]*?\n\}\n/) || [])[0];
  assert(item, 'no existe _rpItem');
  assert(/tel\.indexOf\('34'\) === 0/.test(item),
    'no quita el 34 de delante: "+34 626768600" acabaría en wa.me/3434626768600, un enlace muerto');
  assert(/tel\.indexOf\('00'\) === 0/.test(item), 'no quita el 0034 de delante');
  assert(/\[6-9\]\\d\{8\}/.test(item),
    'pinta WhatsApp para cualquier cosa: a una extensión de la centralita (6412) WhatsApp no llega');
  const itemCod = sinComentarios(item);
  const iNorm = itemCod.indexOf("indexOf('34')");
  const iWa = itemCod.indexOf('wa.me');
  assert(iNorm > -1 && iWa > iNorm, 'el enlace de WhatsApp se arma ANTES de limpiar el número');
});

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  RESULTADO: ' + ok + '/' + (ok + ko) + ' guardas en verde');
if (ko) {
  console.log('\n  ROJAS:');
  fallos.forEach(f => console.log('   · ' + f));
}
console.log('══════════════════════════════════════════════════════════════════\n');
process.exit(ko ? 1 : 0);
