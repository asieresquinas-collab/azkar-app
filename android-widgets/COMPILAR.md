# Cómo se compila la APK de widgets (sin Android Studio)

Compilada en la sesión de Claude con las herramientas clásicas (el SDK de Google
no es alcanzable desde el sandbox; GitHub Actions no se puede usar porque el token
no tiene permiso `workflow`). Receta que FUNCIONA:

    sudo apt-get install -y aapt zipalign apksigner dalvik-exchange
    # android.jar (API 25, espejo en GitHub):
    git clone --depth 1 --filter=blob:none --sparse https://github.com/Sable/android-platforms /tmp/sable
    cd /tmp/sable && git sparse-checkout set android-25
    AJ=/tmp/sable/android-25/android.jar
    SRC=app/src/main; B=/tmp/apkbuild; mkdir -p $B/gen $B/classes $B/out
    aapt package -f -m -J $B/gen -M $SRC/AndroidManifest.xml -S $SRC/res -I $AJ
    javac -source 1.8 -target 1.8 -bootclasspath $AJ -classpath $B/gen -d $B/classes $B/gen/es/azkarmudanzas/widgets/R.java $SRC/java/es/azkarmudanzas/widgets/*.java
    dalvik-exchange --dex --output=$B/out/classes.dex $B/classes
    aapt package -f -M $SRC/AndroidManifest.xml -S $SRC/res -I $AJ -F $B/out/sin-firmar.apk
    cd $B/out && aapt add sin-firmar.apk classes.dex
    zipalign -f 4 sin-firmar.apk alineada.apk
    apksigner sign --ks <ruta>/firma.jks --ks-pass pass:azkar2026widgets --key-pass pass:azkar2026widgets --out azkar-widgets.apk alineada.apk

- La llave `firma.jks` está en esta carpeta: firmar SIEMPRE con ella para que las
  actualizaciones instalen encima sin desinstalar (si se pierde, toca desinstalar e instalar).
- OJO al editar los res/xml: el android.jar es API 25 → nada de atributos modernos
  (targetCellWidth etc.). El manifest lleva package= y uses-sdk DENTRO (estilo clásico).
- La APK publicada se sirve en: https://asieresquinas-collab.github.io/azkar-app/apk/azkar-widgets.apk

## Publicar una versión nueva (v1.4+, con AUTOACTUALIZACIÓN a un toque)
1. Subir versionCode/versionName en app/build.gradle Y en el AndroidManifest.xml (van a la par).
2. Compilar y firmar (receta de arriba, SIEMPRE con firma.jks).
3. Copiar la APK a apk/azkar-widgets-vNN.apk (nombre propio por versión, SIN ?v= en enlaces:
   algunos móviles guardan el archivo con el query pegado y el instalador no lo reconoce)
   Y TAMBIÉN a apk/azkar-widgets.apk (el enlace "de siempre"): los dos deben ser el MISMO
   fichero byte a byte.
4. Actualizar apk/widgets-version.json → {"versionCode":N,"versionName":"X.Y","url":".../apk/azkar-widgets-vNN.apk"}.
5. Añadir la línea de la versión al Historial de aquí abajo (en el MISMO commit).
6. `node /tmp/t_apk_repaso.js` — 25 guardas estáticas: layout ↔ Java, versión en los dos
   sitios, la APK publicada dice de verdad esa versión, MISMA FIRMA que la anterior (si
   cambia, Asier tendría que desinstalar), y el enlace con la app. Si algo está en rojo,
   NO se sube.
7. git push. La app instalada lo ve sola (al abrirla, botón 🔄 ACTUALIZAR; el widget avisa en el panel)
   → Asier descarga e instala CON UN TOQUE, sin enlaces.

## Historial de versiones
- v1.0–v1.1 — Primeros widgets (burbuja de Azkarin + panel del día). v1.1: login sin
  autocorrector del teclado (arreglaba el usuario a escondidas) + botón PROBAR CONEXIÓN.
- v1.2 — Burbuja = walkie-talkie: tocas y hablas directo, sin abrir navegador ni app.
- v1.3 — Modo coche: la charla se queda abierta (tocas una vez, hablas y escuchas en bucle),
  el silencio NO cierra al momento (solo tras 3 min), pantalla siempre encendida.
- v1.4 — AUTOACTUALIZACIÓN a un toque: la app mira `apk/widgets-version.json` y, si hay
  versión nueva, sale el botón 🔄 ACTUALIZAR (y el widget lo avisa en su primera raya).
- v1.5 — Voz de Azkarin a 1,5×.
- v1.6 — Reproductor de la grabación de la llamada DENTRO de la conversación del widget.
- v1.7 — Botón ACTUALIZAR a prueba de balas: abre la descarga en el navegador (el
  instalador automático fallaba mudo en algunos Samsung).
- v1.8 — La grabación de la llamada se pone SOLA (autoplay, sin darle al play) y se maneja
  POR VOZ mientras suena: "a 1,5", "a dos", "más rápido", "más lento", "pausa", "sigue",
  "repite", "cierra". Mientras suena, el micro solo hace caso a esas órdenes (la propia
  llamada no dispara nada) y el silencio nunca cierra la tarjeta.
- v1.9 — La voz de Azkarin lee la respuesta ENTERA y seguida en el widget: se quitó el
  corte a 700 caracteres y el "Te he resumido, el resto en la app". Para textos que superan
  el tope del motor TTS (~4000 car.) se trocea por frases y se encola (QUEUE_ADD): suena de
  corrido y el micro se re-arma solo al terminar el ÚLTIMO trozo (los intermedios llevan
  utteranceId "azk_mid", que el listener ignora). Petición de Asier.
- v1.10 — El micro DEJA HABLAR con calma: la tolerancia al silencio antes de dar la frase por
  terminada sube de 1,8s a 4s (COMPLETE y POSSIBLY_COMPLETE) + MINIMUM_LENGTH 8s, para que a
  Asier (que habla pausado) no le corte a mitad cuando hace una pausa. OJO: el reconocedor de
  Google puede no respetar estos tiempos en algunos móviles; si sigue cortando, plan B =
  pulsar para terminar en vez de detectar el silencio. Petición de Asier.
- v1.11 — BOTÓN DE NAVEGACIÓN en el widget: al pedir "llévame a la mudanza de hoy" / "ruta al
  cliente X", Azkarin manda un dato estructurado (accion:'navegar' con maps_url/sygic_url) y el
  widget pinta botón(es) 🗺️ Google Maps / 🚚 Sygic que abren la app de mapas con un toque (antes
  eran enlaces que el widget borraba al limpiar URLs para la voz). Requiere backend 2.7.189.
- v1.12 — Enlaces de PDF / Drive TOCABLES dentro del walkie-talkie: al pedir un presupuesto o
  un informe, la tarjeta pinta el enlace como botón en vez de tragárselo al limpiar el texto
  para la voz (sobre la v1.11 de rutas).
- v1.13 — Los archivos se DESCARGAN SOLOS al móvil: PDF de borradores/informes y DOCX bajan
  sin tener que abrir el navegador ni buscar el enlace.
- v1.14 — **TERCER WIDGET: "📋 Azkar — repaso"** (lo que quedó colgado, con nombre y teléfono).
  Doce rayas en orden de urgencia (formularios → llamadas sin devolver → promesas → correos →
  borradores esperando el OK), se puede estirar a lo alto, tiene su ↻ y se refresca solo cada
  media hora. Tocarlo abre la app DIRECTA en la pestaña Repaso (`?ir=repaso`, app v382).
  SOLO LECTURA: lo que Asier tacha en la app deja de salir aquí. Si no puede actualizar LO DICE
  y enseña la hora de lo último que trajo — nunca hace pasar por de ahora lo de antes. Pide
  `?lineas=12` al servidor para que el *"… y N más"* nunca se caiga fuera de la pantalla
  (requiere backend 2.7.235). Cache propia (`cache_rep_*`), acción `REFRESCAR_REPASO` y códigos
  de PendingIntent 4/5 — nada de lo del widget del resumen se toca.
- v1.15 — **UN BOTÓN POR COSA, Y CADA UNO A SU SITIO.** Cada raya de los dos paneles (repaso y
  resumen) lleva a su derecha un botón que hace lo suyo: 📞 llama **con Zoiper** (la centralita
  de Asier, `com.zoiper.android.app`), ✉️ abre el correo ya escrito a esa persona, 📄 abre su
  ficha. El botón solo se pinta si de verdad lleva a algún sitio (`Accion.tieneBoton()`); si no,
  no hay botón — nunca un toque muerto. A dónde va cada uno lo decide el CÓDIGO del servidor
  (`_accionDe` en `api/repaso-lunes.js`, backend 2.7.237), jamás el modelo. Si Zoiper no coge la
  llamada se prueban cuatro formas más, luego Zoiper a secas con el número copiado, y por último
  el marcador normal — y en cada caso lo DICE con un aviso. No se pide el permiso CALL_PHONE.
  Un roce en el texto sigue abriendo la app: llamar exige tocar el botón a propósito. Además el
  panel del resumen **nace alto (250dp ≈ 8 rayas) y admite hasta 16**: antes nacía con 140dp y
  Asier lo tenía estirado a pantalla completa con medio panel en blanco por debajo. La cuenta de
  cuántas rayas caben vive **una sola vez** en `Rayas.java` (la usan los dos paneles) y el aviso
  ⚠️ se mete con un mapa que mueve texto Y botón a la vez, para que un botón no pueda quedarse
  nunca con la persona equivocada. Códigos de PendingIntent 100..111 (repaso) y 200..215
  (resumen), cada raya con su propia dirección `azkarwidget://<panel>/<widget>/<raya>`.
- v1.16 — **CUARTO WIDGET: "👷 Azkar — trabajo de hoy (equipo)"**, el panel GRANDE de la tablet
  de los chicos. Lo pidió Asier así: *«que tenga un widget grande, por lo menos que ocupe toda
  la pantalla, para que lo vean bien claro DÓNDE ESTÁ»*. Nace a 320x460dp (≈13 rayas) y admite
  hasta **20**; las rayas van clavadas a 30dp y la cabecera a 54dp para que la cuenta de
  "cuántas caben" sea EXACTA y el *"… y N más"* no se salga nunca de la pantalla. Las
  **direcciones salen a 20sp, en negrita y en azul oscuro** (el resto, 16sp): es lo que un chico
  busca de un vistazo desde la furgoneta. Cada raya lleva su botón: 📍 mapa, 📄 el parte de
  trabajo, 📋 el plan entero. Cómo se pinta cada raya (`estilo`: dia | direccion | titulo |
  aviso | normal) viaja **DENTRO de la misma casilla que el botón**, no en una lista aparte, para
  que el texto de una raya no pueda quedarse nunca con el botón ni con el tamaño de otra — que
  es justo el fallo que mandaría a un chico a la dirección de otro cliente.
  **La tablet NUNCA lleva el usuario y la clave de Asier**: se instala desde el botón de la
  página de operarios y el enlace del portal viaja dentro de la propia dirección de instalación
  (`intent://equipo?u=…#Intent;scheme=azkarwidget;…;S.browser_fallback_url=<APK>;end`), así que
  nadie tiene que teclear un token de 40 letras. Si un botón fallara, la vuelta atrás es **el
  plan de trabajo de ellos**, jamás la pantalla de Asier (`AccionActivity.deReserva`). Cache
  propia (`cache_eq_*`), acción `REFRESCAR_EQUIPO`, códigos de PendingIntent 6/7 + 300..319, y
  se refresca solo cada media hora. Requiere backend 2.7.248 (`/api/equipo/<token>/hoy.json`).
- v1.17 — **AZKARIN YA SABE DÓNDE ESTÁS: LA UBICACIÓN EN LA PROPIA APK.** Asier: *«no me
  sale para activar la ubicación en la APK, yo uso la APK, no la app de Chrome»*. Y tenía
  razón: el walkie-talkie hablaba con Azkarin **sin decirle nunca desde dónde**, y la APK ni
  siquiera pedía el permiso (`AndroidManifest` solo tenía internet, micro e instalar), así que
  el aviso no salía jamás. Ahora la APK pide `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`,
  y al abrir la burbuja te sale el permiso de Android de toda la vida. Con eso, `Datos.chat()`
  manda `ubicacion` (lat/lon/precisión/momento) con cada frase y Azkarin te dice **los
  kilómetros y los minutos** hasta donde sea (backend 2.7.300/2.7.301).
  - **NI RASTREO NI BATERÍA:** la posición se lee **solo mientras la tarjeta está abierta**
    (`Ubic.arranca` al abrir, `Ubic.para` en `onDestroy`). En cuanto se cierra, se suelta el
    GPS: aquí no se sigue a nadie en segundo plano ni se guarda por dónde has ido.
  - **RED + GPS A LA VEZ**, quedándose con la lectura más nueva (dentro de un edificio la red
    contesta en segundos y el GPS puede no contestar nunca), con el `LocationManager` de
    siempre — sin Google Play Services, que el android.jar es API 25.
  - **UNA POSICIÓN VIEJA NO SE MANDA** (caduca a los 5 min): calcular la ruta desde donde ya
    no estás es peor que no calcularla. Si no hay posición, se manda el MOTIVO
    (`ubicacion_error`: denegado / sin señal) y Azkarin lo explica en vez de callarse.
  - **EL PERMISO DE UBICACIÓN NO PUEDE DEJARTE SIN HABLAR:** va aparte del micro (código 8);
    si dices que no, el walkie-talkie sigue funcionando exactamente igual, solo que sin tiempos.
  - Firmada con la MISMA `firma.jks` (SHA-256 d90d2e4a…): se instala **encima**, sin desinstalar.
- v1.18 — **EL PERMISO DE UBICACIÓN YA SALE DE VERDAD (arreglo del fallo de la v1.17).**
  Asier, con la 1.17 instalada: *«no sale permiso de ubicación para aceptar»*, y en Ajustes
  la app seguía enseñando solo Micrófono. El permiso ESTABA bien puesto en el manifest; lo
  que fallaba era **cuándo se pedía**. Dos cosas, y la segunda es la gorda:
  1. Con el micro YA concedido, se pedía la ubicación **y a la vez se empezaba a escuchar**.
  2. **`onPause()` cerraba la tarjeta** (`cierraYa()`) — y abrir un aviso de permiso provoca
     un `onPause`. O sea: el aviso salía y **se cerraba solo en el mismo instante**, sin dar
     tiempo a darle a Permitir. Por eso parecía que no salía nada.
  Ahora hay una marca `pidiendoPermiso`: mientras hay un aviso de permiso en pantalla, la
  tarjeta **NO se cierra** (`onPause` se salta el cierre), y **no se escucha nada** hasta que
  Asier contesta. Un aviso cada vez: primero la ubicación, y al contestar sigue el camino de
  siempre del micro. Si dice que NO, el walkie-talkie funciona igual: solo se queda sin tiempos.
  Además, **la versión sale a la vista** en la primera pantalla ("Widgets de Azkar · v1.18"),
  para saber de un vistazo si la actualización entró de verdad.
- v1.19 — **EL PERMISO SE PIDE EN LA PANTALLA DE LA APP, NO EN LA BURBUJA (así SÍ sale).**
  Con la v1.18 seguía sin poder aceptarse. La razón de fondo estaba en el manifest: la
  tarjeta del walkie-talkie (`VozActivity`) es **`android:noHistory="true"`** y con tema de
  **diálogo** — es decir, **Android la destruye en cuanto le sale cualquier ventana encima**.
  El aviso del permiso es una ventana encima: la tarjeta moría, el aviso se iba con ella y
  `onRequestPermissionsResult` no llegaba NUNCA. Ninguna marca interna puede evitar eso: lo
  hace el sistema, no nuestro código. Por eso en la pantalla normal de la app el permiso sí
  salía y en la burbuja no.
  Ahora el permiso de ubicación se pide en **`MainActivity`** (la primera pantalla de la app,
  una pantalla normal donde los avisos se pueden contestar con calma) al abrirla, y se dice
  en claro si quedó permitido o no. La burbuja **ya no intenta** sacar el aviso: si hay
  permiso, usa la posición; y si no, sigue hablando igual, solo que sin decir tiempos.
  Se mantiene la marca `pidiendoPermiso` de la v1.18 para el permiso del micro.
