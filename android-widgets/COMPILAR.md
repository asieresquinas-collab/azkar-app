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
