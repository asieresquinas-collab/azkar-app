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
   algunos móviles guardan el archivo con el query pegado y el instalador no lo reconoce).
4. Actualizar apk/widgets-version.json → {"versionCode":N,"versionName":"X.Y","url":".../apk/azkar-widgets-vNN.apk"}.
5. git push. La app instalada lo ve sola (al abrirla, botón 🔄 ACTUALIZAR; el widget avisa en el panel)
   → Asier descarga e instala CON UN TOQUE, sin enlaces.

## Historial de versiones
- v1.0–v1.1 — Primeros widgets (burbuja de Azkarin + panel del día). v1.1: login sin
  autocorrector del teclado (arreglaba el usuario a escondidas) + botón PROBAR CONEXIÓN.
- v1.2 — Burbuja = walkie-talkie: tocas y hablas directo, sin abrir navegador ni app.
- v1.3 — Modo coche: la charla se queda abierta (tocas una vez, hablas y escuchas en bucle),
  el silencio NO cierra al momento (solo tras 3 min), pantalla siempre encendida.
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
