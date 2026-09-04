package com.azkar.azkarin;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
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

import java.util.ArrayList;
import java.util.Locale;

/**
 * Servicio en primer plano que mantiene el micro escuchando la palabra clave
 * "Azkarin" incluso con la pantalla apagada. Via gratis: usa el SpeechRecognizer
 * del sistema (on-device si esta disponible) en bucle continuo. Al oir la palabra,
 * abre MainActivity sobre la pantalla de bloqueo para hablar manos libres.
 */
public class WakeWordService extends Service {
    public static final String CH = "azkarin_wake";
    public static final int NOTIF_ID = 4711;
    public static volatile boolean RUNNING = false;

    private SpeechRecognizer sr;
    private Intent srIntent;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wakeLock;
    private boolean stopping = false;
    private boolean listening = false;
    private long lastTrigger = 0;
    // v1.7 · el «pi» del reconocedor de Android se silencia tapando el altavoz un instante
    private AudioManager am;
    private boolean muted = false;

    @Override
    public void onCreate() {
        super.onCreate();
        Notification n = buildNotif("Di \"Azkarin\" para hablar");
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else {
                startForeground(NOTIF_ID, n);
            }
        } catch (Exception e) {
            startForeground(NOTIF_ID, n);
        }
        acquireLock();
        initRecognizer();
        RUNNING = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startLoop();
        return START_STICKY;
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
        // v1.7 · sesiones mas largas en silencio: menos veces se abre y se cierra el micro
        srIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 8000L);
        srIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 8000L);
        try { am = (AudioManager) getSystemService(Context.AUDIO_SERVICE); } catch (Exception e) { am = null; }
    }

    /**
     * v1.7 · EL «PI» DEL MICRO. Cada vez que el reconocedor de Android arranca y para hace
     * sonar su pitido por el altavoz, y con la escucha en bucle eso es todo el dia. No se
     * puede quitar: es del sistema. Lo que si se puede es tapar el altavoz de musica el
     * instante en que suena (unos 350 ms) y destaparlo justo despues. Se destapa SIEMPRE
     * (tambien en errores y al morir el servicio), para no dejar el movil mudo.
     */
    private void tapar() {
        try { if (am != null && !muted) { am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_MUTE, 0); muted = true; } } catch (Exception e) {}
    }
    private void destapar() {
        try { if (am != null && muted) { am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, 0); muted = false; } } catch (Exception e) {}
    }
    private void destaparEn(long ms) {
        handler.postDelayed(new Runnable() { @Override public void run() { destapar(); } }, ms);
    }

    private void startLoop() {
        if (listening || stopping || sr == null) return;
        try {
            listening = true;
            tapar();                 // el pitido de arranque
            sr.startListening(srIntent);
            destaparEn(450);
        } catch (Exception e) {
            listening = false;
            destapar();
            restartDelayed(800);
        }
    }

    private void restartDelayed(long ms) {
        if (stopping) return;
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                listening = false;
                startLoop();
            }
        }, ms);
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override public void onReadyForSpeech(Bundle params) { destaparEn(250); }
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float rmsdB) {}
        @Override public void onBufferReceived(byte[] buffer) {}
        @Override public void onEndOfSpeech() { tapar(); destaparEn(450); }   // el pitido de cierre
        @Override public void onEvent(int eventType, Bundle params) {}

        @Override public void onPartialResults(Bundle partialResults) {
            checkResults(partialResults);
        }
        @Override public void onResults(Bundle results) {
            destaparEn(450);
            if (!checkResults(results)) {
                listening = false;
                restartDelayed(120);
            }
        }
        @Override public void onError(int error) {
            destaparEn(450);
            listening = false;
            long wait = (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY
                    || error == SpeechRecognizer.ERROR_CLIENT) ? 600 : 200;
            restartDelayed(wait);
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
        // v1.7 · POR QUE ANTES «OIA EL MICRO PERO NO HABLABA» (Asier, 4-sep): desde Android 10
        // un servicio en segundo plano NO puede abrir una pantalla asi como asi — la llamada se
        // ignora en silencio con el movil bloqueado o con otra app delante. Lo que SI deja es
        // una notificacion a pantalla completa (como una llamada entrante): esa abre Azkarin
        // encima de lo que haya. Se manda esa, y ademas se intenta abrir directamente por si
        // la app ya esta delante o tiene el permiso de «mostrar sobre otras apps».
        try {
            int pf = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) pf |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent full = PendingIntent.getActivity(this, 7, i, pf);
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel chAlta = new NotificationChannel(CH + "_llama", "Azkarin te contesta",
                        NotificationManager.IMPORTANCE_HIGH);
                chAlta.setSound(null, null);
                NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (nm != null) nm.createNotificationChannel(chAlta);
            }
            Notification llama = new NotificationCompat.Builder(this, CH + "_llama")
                .setContentTitle("Azkarin")
                .setContentText("Te escucho — toca para hablar")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(true)
                .setTimeoutAfter(20000)
                .setContentIntent(full)
                .setFullScreenIntent(full, true)
                .build();
            NotificationManager nm2 = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm2 != null) nm2.notify(NOTIF_ID + 1, llama);
        } catch (Exception e) {}
        try { startActivity(i); } catch (Exception e) {}
        restartDelayed(9000);
    }

    private Notification buildNotif(String txt) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CH, "Escucha de Azkarin",
                    NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ch.setSound(null, null);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
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
        RUNNING = false;
        destapar();   // v1.7 · nunca dejar el altavoz tapado
        try { handler.removeCallbacksAndMessages(null); } catch (Exception e) {}
        try { if (sr != null) sr.destroy(); } catch (Exception e) {}
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception e) {}
        super.onDestroy();
    }

    @Nullable @Override
    public IBinder onBind(Intent intent) { return null; }
}
