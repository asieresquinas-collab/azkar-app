#!/bin/bash
# Compila y firma la APK de widgets con la cadena clásica (sin Android Studio).
set -e
cd "$(dirname "$0")"
AJ=/tmp/sable/android-25/android.jar
SRC=app/src/main
B=/tmp/apkbuild
rm -rf $B
mkdir -p $B/gen $B/classes $B/out
KEY=firma.jks

echo "== 1/6 aapt: genera R.java =="
aapt package -f -m -J $B/gen -M $SRC/AndroidManifest.xml -S $SRC/res -I $AJ

echo "== 2/6 javac: compila Java =="
javac -source 1.8 -target 1.8 -bootclasspath $AJ -classpath $B/gen -d $B/classes \
  $B/gen/es/azkarmudanzas/widgets/R.java $SRC/java/es/azkarmudanzas/widgets/*.java

echo "== 3/6 dex =="
dalvik-exchange --dex --output=$B/out/classes.dex $B/classes

echo "== 4/6 empaqueta recursos =="
aapt package -f -M $SRC/AndroidManifest.xml -S $SRC/res -I $AJ -F $B/out/sin-firmar.apk
cd $B/out && aapt add sin-firmar.apk classes.dex >/dev/null

echo "== 5/6 zipalign =="
zipalign -f 4 sin-firmar.apk alineada.apk

echo "== 6/6 firma =="
cd - >/dev/null
apksigner sign --ks $KEY --ks-pass pass:azkar2026widgets --key-pass pass:azkar2026widgets \
  --out $B/out/azkar-widgets.apk $B/out/alineada.apk

echo "== LISTO =="
ls -la $B/out/azkar-widgets.apk
apksigner verify --print-certs $B/out/azkar-widgets.apk | head -4
