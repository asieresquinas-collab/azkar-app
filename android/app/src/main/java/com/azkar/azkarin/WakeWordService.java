package com.azkar.azkarin;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Locale;

/**
 * ESCUCHA DE LA PALABRA "AZKARIN" CON EL MOVIL BLOQUEADO.
 *
 * v1.8 · Asier, 4-sep: «sigue igual con los tonitos del microfono y no contesta hasta que
 * desbloqueo y me meto en la apk». Dos fallos, los dos aqui:
 *
 *  1) LOS PITIDOS. El reconocedor de Android hace sonar su "pi" al abrir y al cerrar, y antes
 *     se le tenia dando vueltas TODO EL RATO, tambien con la casa en silencio. Ahora el que
 *     escucha de continuo es un AudioRecord — que NO pita — midiendo si hay voz; el
 *     reconocedor solo se abre cuando alguien habla de verdad. Con la casa callada: cero
 *     pitidos. Y cuando se abre, se le tapan de golpe los altavoces por los que suena ese
 *     aviso (musica, sistema y notificaciones): en la v1.7 solo se tapaba el de musica, y el
 *     "pi" de su Samsung no va por ahi. Se destapa SIEMPRE, pase lo que pase.
 *
 *  2) QUE NO ABRIA NADA. Desde Android 10 un servicio en segundo plano no puede abrir una
 *     pantalla, y desde Android 14 la notificacion "de llamada" tampoco vale si la app no
 *     tiene concedido ese permiso. Lo que si funciona siempre es "mostrar sobre otras
 *     aplicaciones" (SYSTEM_ALERT_WINDOW): con eso concedido, startActivity SI abre Azkarin
 *     encima del bloqueo. Aqui se usan los tres caminos a la vez y el plugin le dice a la app
 *     cual falta para que Asier lo active con un toque.
 */
public class WakeWordService extends Service {
    public static final String CH = "azkarin_wake";
    public static final String CH_LLAMA = "azkarin_wake_llama";
    public static final int NOTIF_ID = 4711;
    public static volatile boolean RUNNING = false;

    private SpeechRecognizer sr;
    private Intent srIntent;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wakeLock;
    private volatile boolean stopping = false;
    private volatile boolean listening = false;      // el RECONOCEDOR esta abierto
    private volatile boolean vigilando = false;      // el AudioRecord esta midiendo
    private long lastTrigger = 0;
    private int reconocedorSinNada = 0;              // veces seguidas que se abrio y no oyo nada

    private AudioManager am;
    private boolean muted = false;
    // v1.9 · el cartero: cada pocos minutos pregunta si hay algo que recordarle a Asier
    private static final long CADA_MS = 5 * 60 * 1000L;
    private long ultimoCartero = 0;
    private Thread hiloVad;
    private AudioRecord rec;

    // ── El oido barato: mide el sonido sin pitar ────────────────────────────────
    private static final int HZ = 16000;
    private static final float MIN_ABSOLUTO = 0.020f;   // por debajo de esto no es voz ni de lejos
    private static final int MS_VOZ = 350;              // voz sostenida antes de abrir el reconocedor

    @Override
    public void onCreate() {
        super.onCreate();
        crearCanales();
        Notification n = buildNotif("Di \"Azkarin\" para hablar");
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else {
                startForeground(NOTIF_ID, n);
            }
        } catch (Exception e) {
            try { startForeground(NOTIF_ID, n); } catch (Exception e2) {}
        }
        acquireLock();
        try { am = (AudioManager) getSystemService(Context.AUDIO_SERVICE); } catch (Exception e) { am = null; }
        initRecognizer();
        RUNNING = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        arrancarVigilancia();
        arrancarCartero();
        return START_STICKY;
    }

    // ── EL CARTERO ─────────────────────────────────────────────────────────────
    // v1.9 · Asier: «que sea mi companero y me recuerde las cosas aunque este bloqueado el
    // telefono». Cada cinco minutos se le pregunta al servidor si hay algo que decirle. El
    // servidor es el que decide QUE y CUANDO (horario, no repetir, sin nombres de cliente):
    // aqui solo se pregunta y, si hay algo, se abre Azkarin para que se lo diga hablando.
    private void arrancarCartero() {
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                if (stopping) return;
                try { preguntarSiHayAlgo(); } catch (Exception e) {}
                handler.postDelayed(this, CADA_MS);
            }
        }, 60000);   // el primero, un minuto despues de arrancar
    }

    private void preguntarSiHayAlgo() {
        if (System.currentTimeMillis() - ultimoCartero < CADA_MS - 5000) return;
        ultimoCartero = System.currentTimeMillis();
        final android.content.SharedPreferences pref =
            getSharedPreferences("azkarin", Context.MODE_PRIVATE);
        final String base = pref.getString("base", "");
        final String key = pref.getString("apiKey", "");
        if (!pref.getBoolean("avisos", true)) return;
        if (base == null || base.isEmpty() || key == null || key.isEmpty()) return;
        new Thread(new Runnable() {
            @Override public void run() {
                HttpURLConnection con = null;
                try {
                    URL u = new URL(base + "/api/voz/companero?apiKey=" + key);
                    con = (HttpURLConnection) u.openConnection();
                    con.setConnectTimeout(12000);
                    con.setReadTimeout(15000);
                    con.setRequestProperty("User-Agent", "AzkarinAPK");
                    if (con.getResponseCode() != 200) return;
                    StringBuilder sb = new StringBuilder();
                    BufferedReader br = new BufferedReader(new InputStreamReader(con.getInputStream(), "UTF-8"));
                    String l;
                    while ((l = br.readLine()) != null) sb.append(l);
                    br.close();
                    org.json.JSONObject j = new org.json.JSONObject(sb.toString());
                    if (!j.optBoolean("hay", false)) return;
                    final String texto = j.optString("texto", "");
                    final String id = j.optString("id", "");
                    if (texto.isEmpty()) return;
                    handler.post(new Runnable() {
                        @Override public void run() { abrirParaDecir(texto, id); }
                    });
                } catch (Exception e) {
                } finally { try { if (con != null) con.disconnect(); } catch (Exception e) {} }
            }
        }, "azkarin-cartero").start();
    }

    private void abrirParaDecir(String texto, String id) {
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        i.putExtra("azkarin_aviso", texto);
        i.putExtra("azkarin_aviso_id", id);
        try { startActivity(i); } catch (Exception e) {}
        try {
            int pf = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) pf |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent full = PendingIntent.getActivity(this, 8, i, pf);
            Notification n = new NotificationCompat.Builder(this, CH_LLAMA)
                .setContentTitle("Azkarin")
                .setContentText("Tengo que recordarte una cosa")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setTimeoutAfter(60000)
                .setContentIntent(full)
                .setFullScreenIntent(full, true)
                .build();
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_ID + 2, n);
        } catch (Exception e) {}
    }

    private void acquireLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "azkarin:wakeword");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
        } catch (Exception e) {}
    }

    private void initRecognizer() {
        try {
            if (Build.VERSION.SDK_INT >= 33 && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
                sr = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
            } else {
                sr = SpeechRecognizer.createSpeechRecognizer(this);
            }
        } catch (Exception e) {
            try { sr = SpeechRecognizer.createSpeechRecognizer(this); } catch (Exception e2) {}
        }
        if (sr != null) sr.setRecognitionListener(listener);

        srIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        srIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        srIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES");
        srIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        srIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        srIntent.putExtra("android.speech.extra.PREFER_OFFLINE", true);
        srIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L);
        srIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L);
    }

    // ── Tapar el aviso del sistema. En la v1.7 solo se tapaba la musica y su movil lo saca
    //    por otro altavoz; ahora se tapan los tres por los que puede salir. ───────────────
    private static final int[] CANALES = {
        AudioManager.STREAM_MUSIC, AudioManager.STREAM_SYSTEM, AudioManager.STREAM_NOTIFICATION
    };
    private void tapar() {
        if (am == null || muted) return;
        muted = true;
        for (int c : CANALES) {
            try { am.adjustStreamVolume(c, AudioManager.ADJUST_MUTE, 0); } catch (Exception e) {}
        }
    }
    private void destapar() {
        if (am == null || !muted) return;
        muted = false;
        for (int c : CANALES) {
            try { am.adjustStreamVolume(c, AudioManager.ADJUST_UNMUTE, 0); } catch (Exception e) {}
        }
    }
    private void destaparEn(long ms) {
        handler.postDelayed(new Runnable() { @Override public void run() { destapar(); } }, ms);
    }

    // ── EL OIDO BARATO ─────────────────────────────────────────────────────────
    private void arrancarVigilancia() {
        if (stopping || vigilando || listening) return;
        vigilando = true;
        hiloVad = new Thread(new Runnable() { @Override public void run() { bucleVad(); } }, "azkarin-vad");
        hiloVad.setPriority(Thread.MIN_PRIORITY);
        hiloVad.start();
    }

    private void bucleVad() {
        int min = 0;
        try { min = AudioRecord.getMinBufferSize(HZ, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT); } catch (Exception e) {}
        if (min <= 0) min = 4096;
        final int tam = Math.max(min, 2048);
        short[] buf = new short[tam / 2];
        try {
            rec = new AudioRecord(MediaRecorder.AudioSource.MIC, HZ,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, tam * 2);
            if (rec.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("no init");
            rec.startRecording();
        } catch (Exception e) {
            // Sin oido barato: se vuelve al bucle de antes (pita, pero funciona)
            soltarVad();
            vigilando = false;
            handler.post(new Runnable() { @Override public void run() { abrirReconocedor(); } });
            return;
        }
        float fondo = 0.01f;
        int msVoz = 0;
        while (vigilando && !stopping) {
            int n;
            try { n = rec.read(buf, 0, buf.length); } catch (Exception e) { break; }
            if (n <= 0) continue;
            double suma = 0;
            for (int i = 0; i < n; i++) { double v = buf[i] / 32768.0; suma += v * v; }
            float rms = (float) Math.sqrt(suma / n);
            int ms = (int) (n * 1000L / HZ);
            boolean voz = rms > Math.max(fondo * 3.5f, MIN_ABSOLUTO);
            if (!voz) {
                fondo = fondo * 0.97f + rms * 0.03f;     // el fondo se aprende solo con lo que NO es voz
                msVoz = 0;
            } else {
                msVoz += ms;
                if (msVoz >= MS_VOZ) {
                    msVoz = 0;
                    soltarVad();
                    vigilando = false;
                    handler.post(new Runnable() { @Override public void run() { abrirReconocedor(); } });
                    return;
                }
            }
        }
        soltarVad();
        vigilando = false;
    }

    private void soltarVad() {
        try { if (rec != null) { try { rec.stop(); } catch (Exception e) {} rec.release(); } } catch (Exception e) {}
        rec = null;
    }

    // ── EL RECONOCEDOR: solo cuando alguien ha hablado ─────────────────────────
    private void abrirReconocedor() {
        if (stopping || listening) return;
        if (sr == null) { initRecognizer(); if (sr == null) { volverAVigilar(1500); return; } }
        try {
            listening = true;
            tapar();
            sr.startListening(srIntent);
            destaparEn(700);
        } catch (Exception e) {
            listening = false;
            destapar();
            volverAVigilar(1200);
        }
    }

    private void volverAVigilar(long ms) {
        if (stopping) return;
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                listening = false;
                arrancarVigilancia();
            }
        }, ms);
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override public void onReadyForSpeech(Bundle params) { destaparEn(300); }
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float rmsdB) {}
        @Override public void onBufferReceived(byte[] buffer) {}
        @Override public void onEndOfSpeech() { tapar(); destaparEn(700); }
        @Override public void onEvent(int eventType, Bundle params) {}

        @Override public void onPartialResults(Bundle partialResults) {
            if (checkResults(partialResults)) reconocedorSinNada = 0;
        }
        @Override public void onResults(Bundle results) {
            destaparEn(700);
            boolean algo = checkResults(results);
            if (algo) { reconocedorSinNada = 0; return; }
            reconocedorSinNada++;
            volverAVigilar(reconocedorSinNada >= 3 ? 2500 : 400);
        }
        @Override public void onError(int error) {
            destaparEn(700);
            reconocedorSinNada++;
            long espera = (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY
                    || error == SpeechRecognizer.ERROR_CLIENT) ? 1200 : 400;
            volverAVigilar(espera);
        }
    };

    private boolean checkResults(Bundle b) {
        if (b == null) return false;
        ArrayList<String> list = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (list == null) return false;
        for (String s : list) {
            if (pareceAzkarin(s)) { trigger(); return true; }
        }
        return false;
    }

    /** Acepta "Azkarin" y como lo suele transcribir mal el reconocedor en espanol. */
    private boolean pareceAzkarin(String raw) {
        if (raw == null) return false;
        String t = raw.toLowerCase(Locale.ROOT)
            .replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u");
        String[] roots = {
            "azkarin","azcarin","askarin","ascarin","oscarin","ozkarin",
            "azkar","azcar","askar","ascar","zkarin","scarin","es karin","oscar in"
        };
        for (String r : roots) if (t.contains(r)) return true;
        return false;
    }

    private void trigger() {
        long now = System.currentTimeMillis();
        if (now - lastTrigger < 5000) return;
        lastTrigger = now;
        try { if (sr != null) sr.cancel(); } catch (Exception e) {}
        listening = false;
        destapar();

        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        i.putExtra("azkarin_wake", true);

        // Camino 1: abrir directamente. Funciona si la app tiene "mostrar sobre otras
        // aplicaciones" o si ya esta delante. Es el unico que abre SIN tocar nada.
        try { startActivity(i); } catch (Exception e) {}

        // Camino 2: notificacion de pantalla completa (como una llamada entrante). En
        // Android 14 hace falta que el permiso este concedido; si no lo esta, sale como
        // aviso normal arriba y con un toque abre.
        try {
            int pf = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) pf |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent full = PendingIntent.getActivity(this, 7, i, pf);
            Notification llama = new NotificationCompat.Builder(this, CH_LLAMA)
                .setContentTitle("Azkarin")
                .setContentText("Te escucho — toca para hablar")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(true)
                .setTimeoutAfter(25000)
                .setContentIntent(full)
                .setFullScreenIntent(full, true)
                .build();
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_ID + 1, llama);
        } catch (Exception e) {}

        volverAVigilar(9000);
    }

    private void crearCanales() {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel ch = new NotificationChannel(CH, "Escucha de Azkarin", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
            NotificationChannel cl = new NotificationChannel(CH_LLAMA, "Azkarin te contesta", NotificationManager.IMPORTANCE_HIGH);
            cl.setSound(null, null);
            cl.setShowBadge(false);
            nm.createNotificationChannel(cl);
        } catch (Exception e) {}
    }

    private Notification buildNotif(String txt) {
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int pf = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) pf |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, pf);

        Intent stop = new Intent(this, WakeWordService.class);
        stop.setAction("STOP");
        PendingIntent stopPi = PendingIntent.getService(this, 1, stop, pf);

        return new NotificationCompat.Builder(this, CH)
            .setContentTitle("Azkarin te escucha")
            .setContentText(txt)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pi)
            .addAction(0, "Parar", stopPi)
            .build();
    }

    @Override
    public void onDestroy() {
        stopping = true;
        vigilando = false;
        RUNNING = false;
        destapar();                                   // nunca dejar el movil mudo
        try { handler.removeCallbacksAndMessages(null); } catch (Exception e) {}
        soltarVad();
        try { if (sr != null) sr.destroy(); } catch (Exception e) {}
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception e) {}
        super.onDestroy();
    }

    @Nullable @Override
    public IBinder onBind(Intent intent) { return null; }
}
