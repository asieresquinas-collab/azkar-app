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
import android.os.BatteryManager;
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
    public static volatile boolean VIGILANDO = false;      // v1.20 · escuchando de verdad
    public static volatile String ULTIMO_OIDO = "";        // v1.20 · lo ultimo que entendio

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
    private android.content.BroadcastReceiver pantallaReceiver = null;   // v1.18
    private long listeningDesde = 0;   // v1.21 · para saber si el reconocedor se ha quedado colgado
    private Runnable vigilante = null;  // v1.21 · el que se asegura de que SIEMPRE se escucha
    private long esperaCesion = 0;   // v1.19 · cuanto se espera al ceder el micro (crece hasta 30 s)
    private volatile boolean vieneDelReconocedor = false;   // v1.17
    // v1.9 · el cartero: cada pocos minutos pregunta si hay algo que recordarle a Asier
    private static final long CADA_MS = 5 * 60 * 1000L;    // v1.27 · cada cinco minutos: una perdida se dice «al de diez minutos como maximo» (era 15)
    private long ultimoCartero = 0;
    // v1.10 · LA SIESTA. Asier: «que le diga deja de escuchar Azkarin y se desactive».
    // Se calla el rato que diga y VUELVE SOLO. (Callado del todo no podria oir que le
    // vuelven a llamar: por eso lo normal es un rato, no para siempre.)
    public static final String PREF = "azkarin";
    public static final String K_SIESTA = "siestaHasta";
    private static final long SIESTA_POR_DEFECTO = 60 * 60 * 1000L;   // una hora
    // v1.11 · LA BATERIA. Asier: «va a gastar mucha bateria». Tres frenos, y los tres se
    // pueden quitar desde la app:
    //   · solo escucha en su horario de trabajo (8-19, lunes a sabado). Por la noche y los
    //     domingos duerme: ahi es donde se iba la mitad del gasto, escuchando a nadie.
    //   · si la bateria baja del 15% y no esta cargando, se para sola y vuelve al enchufarlo.
    //   · el cartero de los recados pregunta cada cuarto de hora, no cada cinco minutos.
    public static final String K_SOLO_HORARIO = "soloHorario";
    // v1.30 · Asier, 10-sep: «que no tenga restricciones de hora». En la 1.29 se cambio el valor
    // POR DEFECTO a false, pero el suyo estaba GUARDADO a true (de un boton de la tarjeta), y un
    // valor guardado gana al defecto: a las 23:24, ya con la 1.29, el parte seguia diciendo
    // «sigue sin escuchar: fuera de horario (escucha de 7 a 22)». Aqui se apaga de verdad, una
    // sola vez; si algun dia el quiere horario, lo enciende desde el chat y esto no lo vuelve a tocar.
    public static final String K_MIGRO_HORARIO = "migroHorario130";
    public static void quitarHorarioUnaVez(Context ctx) {
        try {
            android.content.SharedPreferences pf = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
            if (pf.getBoolean(K_MIGRO_HORARIO, false)) return;
            pf.edit().putBoolean(K_MIGRO_HORARIO, true).putBoolean(K_SOLO_HORARIO, false).apply();
        } catch (Exception e) {}
    }
    public static final String K_MIN_BATERIA = "minBateria";
    public static final String K_CEDE_EN_USO = "cedeEnUso";   // v1.18: soltar el micro mientras usa el movil
    // v1.29 · Asier, 10-sep 22:58: «se me dice que solo se escucha de 8 a 19, para que me dices
    // eso si son las 11». Trabaja de noche y los domingos: la restriccion de hora viene APAGADA
    // de fabrica (K_SOLO_HORARIO por defecto false). Si algun dia quiere ahorrar bateria, se
    // enciende desde el chat con horario_de_la_escucha.
    public static final int HORA_ABRE = 7, HORA_CIERRA = 22;   // v1.22: sin domingo y mas ancho
    private Thread hiloVad;
    private AudioRecord rec;
    private android.media.audiofx.AcousticEchoCanceler aec;   // v1.23
    private android.media.audiofx.NoiseSuppressor ns;         // v1.23
    private volatile int MI_SESION = -1;                      // v1.23 · para saber cual grabacion es MIA
    private volatile long arranqueVad = 0;                    // v1.24 · cuando se abrio el oido
    private Object vigilanteMicro;                            // v1.23 · AudioManager.AudioRecordingCallback

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
        if (tocaEscuchar()) acquireLock();   // v1.11 · si no toca escuchar, ni se coge
        try {   // v1.18 · en cuanto apaga la pantalla o bloquea, se vuelve a escuchar al instante
            android.content.IntentFilter fp = new android.content.IntentFilter();
            fp.addAction(Intent.ACTION_SCREEN_OFF);
            fp.addAction(Intent.ACTION_USER_PRESENT);
            fp.addAction(Intent.ACTION_SCREEN_ON);
            pantallaReceiver = new android.content.BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent i) {
                    if (stopping) return;
                    if (Intent.ACTION_SCREEN_OFF.equals(i.getAction())) {
                        handler.postDelayed(new Runnable() { @Override public void run() { if (!stopping) arrancarVigilancia(); } }, 1200);
                    } else if (cedeEnUso() && estaEnUso()) {
                        // ha desbloqueado: se suelta el micro para que pueda dictar donde quiera
                        vigilando = false;
                        try { if (sr != null) sr.cancel(); } catch (Exception e) {}
                        listening = false;
                        soltarVad();
                        destapar();
                        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception e) {}
                        try {
                            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                            if (nm != null) nm.notify(NOTIF_ID, buildNotif("Callado mientras usas el móvil (así puedes dictar)"));
                        } catch (Exception e) {}
                        handler.postDelayed(new Runnable() { @Override public void run() { if (!stopping) arrancarVigilancia(); } }, 15000);
                    }
                }
            };
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(pantallaReceiver, fp, Context.RECEIVER_NOT_EXPORTED);
            else registerReceiver(pantallaReceiver, fp);
        } catch (Exception e) {}
        try { am = (AudioManager) getSystemService(Context.AUDIO_SERVICE); } catch (Exception e) { am = null; }
        initRecognizer();
        RUNNING = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) {
            try { getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putLong(K_SIESTA, 0).apply(); } catch (Exception e) {}
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && "DESPIERTA".equals(intent.getAction())) {   // v1.10
            quitarSiesta();
            return START_STICKY;
        }
        arrancarVigilancia();
        arrancarVigilante();   // v1.21 · y el que vigila al vigilante
        arrancarVigilanteDelMicro();   // v1.23 · y el que pregunta a Android quien graba
        arrancarCartero();
        quitarHorarioUnaVez(this);   // v1.30 · sin restricciones de hora, de verdad
        arrancarLatido();            // v1.30 · un parte cada cuarto de hora: se sabe si escucha o no
        Cartero.armar(this);   // v1.26 · y la alarma, por si a este lo matan
        return START_STICKY;
    }

    // ── EL CARTERO ─────────────────────────────────────────────────────────────
    // v1.9 · Asier: «que sea mi companero y me recuerde las cosas aunque este bloqueado el
    // telefono». Cada cinco minutos se le pregunta al servidor si hay algo que decirle. El
    // servidor es el que decide QUE y CUANDO (horario, no repetir, sin nombres de cliente):
    // aqui solo se pregunta y, si hay algo, se abre Azkarin para que se lo diga hablando.
    // v1.30 · EL LATIDO. Asier: «estoy probando y no escucha, sale la notificacion y no
    // funciona». Hasta ahora el estado solo se sabia si el abria la tarjeta. Ahora el propio
    // servicio manda cada cuarto de hora que esta vivo, si esta escuchando DE VERDAD y, si no,
    // por que: asi se ve desde fuera sin tener que pedirle nada.
    private long ultimoLatido = 0;
    private void arrancarLatido() {
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                if (stopping) return;
                try {
                    if (System.currentTimeMillis() - ultimoLatido > 14 * 60 * 1000L) {
                        ultimoLatido = System.currentTimeMillis();
                        String motivo = porQueNoEscucha();
                        parteAlServidor("ww_latido", "{\"vigilando\":" + (vigilando ? "true" : "false")
                                + ",\"listening\":" + (listening ? "true" : "false")
                                + ",\"motivo\":" + org.json.JSONObject.quote(motivo == null ? "escuchando" : motivo) + "}");
                    }
                } catch (Exception e) {}
                handler.postDelayed(this, 15 * 60 * 1000L);
            }
        }, 30 * 1000L);
    }

    /** null si esta escuchando; si no, POR QUE no. */
    private String porQueNoEscucha() {
        try {
            if (vigilando) return null;
            if (listening) return "el reconocedor esta abierto (hablando)";
            if (siestaHasta() > System.currentTimeMillis()) return "le has dicho que se calle un rato";
            android.content.SharedPreferences pf = getSharedPreferences(PREF, Context.MODE_PRIVATE);
            if (pf.getBoolean(K_CEDE_EN_USO, false) && estaEnUso()) return "estas usando el movil y le has dicho que ceda el micro";
            BatteryManager bm = (BatteryManager) getSystemService(Context.BATTERY_SERVICE);
            int minBat = pf.getInt(K_MIN_BATERIA, 15);
            if (bm != null && minBat > 0) {
                int nivel = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
                boolean cargando = false;
                try { cargando = bm.isCharging(); } catch (Exception e) {}
                if (nivel > 0 && nivel < minBat && !cargando) return "bateria al " + nivel + "%";
            }
            if (pf.getBoolean(K_SOLO_HORARIO, false)) {
                int h = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY);
                if (h < HORA_ABRE || h >= HORA_CIERRA) return "fuera de horario (" + HORA_ABRE + " a " + HORA_CIERRA + ")";
            }
            return "el micro no se ha abierto (no se por que)";
        } catch (Exception e) { return "no se ha podido mirar"; }
    }

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
        if (!tocaEscuchar()) return;   // v1.11 · fuera de hora o con la batería baja, ni se pregunta
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
        AudioManager.STREAM_MUSIC, AudioManager.STREAM_SYSTEM, AudioManager.STREAM_NOTIFICATION,
        AudioManager.STREAM_RING   // v1.17: en Samsung el aviso puede salir por el canal del timbre
    };
    // v1.17 · Lo que no se deja tapar (SecurityException: «No molestar»), apuntado UNA vez al
    // parte del servidor para saber por donde sale el «pi» en su movil, en vez de adivinarlo.
    private final java.util.Map<Integer,Integer> volAntes = new java.util.HashMap<Integer,Integer>();
    private String tapaFalla = "";
    private boolean tapaAvisado = false;
    private static String nombreCanal(int c) {
        if (c == AudioManager.STREAM_MUSIC) return "music";
        if (c == AudioManager.STREAM_SYSTEM) return "system";
        if (c == AudioManager.STREAM_NOTIFICATION) return "notification";
        if (c == AudioManager.STREAM_RING) return "ring";
        return "" + c;
    }
    private void tapar() {
        if (am == null || muted) return;
        muted = true;
        StringBuilder falla = new StringBuilder();
        for (int c : CANALES) {
            boolean ok = false;
            try { am.adjustStreamVolume(c, AudioManager.ADJUST_MUTE, 0); ok = true; } catch (Exception e) {}
            if (!ok) {
                // segunda via: bajar el volumen a cero y acordarse de cuanto habia
                try {
                    int v = am.getStreamVolume(c);
                    if (v > 0) { volAntes.put(c, v); am.setStreamVolume(c, 0, 0); }
                    ok = true;
                } catch (Exception e) {}
            }
            if (!ok) { if (falla.length() > 0) falla.append(","); falla.append(nombreCanal(c)); }
        }
        tapaFalla = falla.toString();
        if (!tapaAvisado) { tapaAvisado = true; parteAlServidor("ww_mute", "{\"motivo\":\"" + (tapaFalla.isEmpty() ? "todos tapados" : "no se tapan: " + tapaFalla) + "\",\"permiso\":" + noMolestarConcedido() + "}"); }
    }
    private void destapar() {
        if (am == null || !muted) return;
        muted = false;
        for (int c : CANALES) {
            try { am.adjustStreamVolume(c, AudioManager.ADJUST_UNMUTE, 0); } catch (Exception e) {}
            try {
                Integer v = volAntes.remove(c);
                if (v != null) am.setStreamVolume(c, v, 0);
            } catch (Exception e) {}
        }
    }
    private boolean noMolestarConcedido() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            return nm != null && Build.VERSION.SDK_INT >= 23 && nm.isNotificationPolicyAccessGranted();
        } catch (Exception e) { return false; }
    }
    /** v1.17 · Un parte corto al servidor (misma llave publica que el cartero). */
    private void parteAlServidor(final String evento, final String datosJson) {
        try {
            final android.content.SharedPreferences pref = getSharedPreferences("azkarin", Context.MODE_PRIVATE);
            final String base = pref.getString("base", "");
            final String key = pref.getString("apiKey", "");
            if (base == null || base.isEmpty() || key == null || key.isEmpty()) return;
            new Thread(new Runnable() {
                @Override public void run() {
                    HttpURLConnection con = null;
                    try {
                        URL u = new URL(base + "/api/voz/parte");
                        con = (HttpURLConnection) u.openConnection();
                        con.setConnectTimeout(8000); con.setReadTimeout(8000);
                        con.setRequestMethod("POST");
                        con.setRequestProperty("Content-Type", "application/json");
                        con.setRequestProperty("x-api-key", key);
                        con.setRequestProperty("User-Agent", "AzkarinAPK");
                        con.setDoOutput(true);
                        byte[] body = ("{\"evento\":\"" + evento + "\",\"datos\":" + datosJson + "}").getBytes("UTF-8");
                        con.getOutputStream().write(body);
                        con.getResponseCode();
                    } catch (Exception e) {
                    } finally { try { if (con != null) con.disconnect(); } catch (Exception e) {} }
                }
            }).start();
        } catch (Exception e) {}
    }
    private void destaparEn(long ms) {
        handler.postDelayed(new Runnable() { @Override public void run() { destapar(); } }, ms);
    }

    // ── EL OIDO BARATO ─────────────────────────────────────────────────────────
    private long siestaHasta() {
        try { return getSharedPreferences(PREF, Context.MODE_PRIVATE).getLong(K_SIESTA, 0); } catch (Exception e) { return 0; }
    }
    private void ponerSiesta(long hasta, String comoLoDigo) {
        try { getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putLong(K_SIESTA, hasta).apply(); } catch (Exception e) {}
        vigilando = false;
        listening = false;
        try { if (sr != null) sr.cancel(); } catch (Exception e) {}
        soltarVad();
        destapar();
        avisoDeSiesta(comoLoDigo, hasta);
        if (hasta > 0) {
            handler.postDelayed(new Runnable() {
                @Override public void run() {
                    if (stopping) return;
                    if (siestaHasta() > System.currentTimeMillis()) return;   // la han alargado
                    quitarSiesta();
                }
            }, Math.max(1000, hasta - System.currentTimeMillis()) + 500);
        }
    }
    private void quitarSiesta() {
        try { getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putLong(K_SIESTA, 0).apply(); } catch (Exception e) {}
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_ID, buildNotif("Di \"Azkarin\" para hablar"));
        } catch (Exception e) {}
        arrancarVigilancia();
    }

    /** v1.11 · ¿toca escuchar ahora, o toca ahorrar? */
    /**
     * v1.18 · ¿ESTA USANDO EL MOVIL? (pantalla encendida y desbloqueado).
     * Asier, 5-sep: «cada vez que tengo Azkarin activado no me deja dictar en otra aplicacion».
     * Y es cierto: este servicio tiene el microfono cogido, y ademas abre el reconocedor de voz
     * de Android — del que solo puede haber UNO en todo el movil. Mientras el escucha, el
     * dictado del teclado (o cualquier otra app) se queda sin micro y sin reconocedor.
     * v1.19 · PERO parar SIEMPRE que use el movil no vale: Asier usa Azkarin CON el movil en la
     * mano, y asi no podia hablarle. Esto queda APAGADO por defecto (es solo un interruptor por
     * si algun dia lo quiere); lo que de verdad resuelve el dictado es cederPorque(): se suelta
     * el micro SOLO cuando otra app lo esta usando de verdad, y se recupera solo.
     */
    private boolean estaEnUso() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            boolean pantalla = pm != null && (Build.VERSION.SDK_INT >= 20 ? pm.isInteractive() : true);
            if (!pantalla) return false;
            android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            boolean bloqueado = km != null && km.isKeyguardLocked();
            return !bloqueado;
        } catch (Exception e) { return false; }
    }

    private boolean cedeEnUso() {
        try { return getSharedPreferences(PREF, Context.MODE_PRIVATE).getBoolean(K_CEDE_EN_USO, false); } catch (Exception e) { return false; }
    }

    /**
     * v1.22 · POR QUE no esta escuchando, en cristiano. Desde fuera solo se veia «no
     * escucha» y habia que adivinar. Devuelve "" cuando si toca escuchar.
     */
    public static String porQueNoEscucha(Context ctx) {
        try {
            android.content.SharedPreferences pf = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
            long siesta = pf.getLong(K_SIESTA, 0);
            if (siesta > System.currentTimeMillis()) return "esta callado un rato porque se lo pediste";
            if (pf.getBoolean(K_SOLO_HORARIO, false)) {
                int h = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY);
                if (h < HORA_ABRE || h >= HORA_CIERRA) return "fuera de horario (escucha de " + HORA_ABRE + " a " + HORA_CIERRA + ")";
            }
            try {
                int minBat = pf.getInt(K_MIN_BATERIA, 15);
                BatteryManager bm = (BatteryManager) ctx.getSystemService(Context.BATTERY_SERVICE);
                if (bm != null && minBat > 0) {
                    int nivel = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
                    boolean cargando = false;
                    try { cargando = bm.isCharging(); } catch (Exception e) {}
                    if (nivel > 0 && nivel < minBat && !cargando) return "bateria por debajo del " + minBat + "%";
                }
            } catch (Exception e) {}
            if (pf.getBoolean(K_CEDE_EN_USO, false)) return "esta puesto «callado mientras uso el movil»";
            return "";
        } catch (Exception e) { return ""; }
    }

    private boolean tocaEscuchar() {
        try {
            android.content.SharedPreferences pf = getSharedPreferences(PREF, Context.MODE_PRIVATE);
            // 0) v1.18 · si esta usando el movil, el microfono es suyo (dictado del teclado, notas de voz…)
            if (pf.getBoolean(K_CEDE_EN_USO, false) && estaEnUso()) return false;
            // 1) la bateria manda
            int minBat = pf.getInt(K_MIN_BATERIA, 15);
            BatteryManager bm = (BatteryManager) getSystemService(Context.BATTERY_SERVICE);
            if (bm != null && minBat > 0) {
                int nivel = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
                boolean cargando = false;
                try { cargando = bm.isCharging(); } catch (Exception e) {}
                if (nivel > 0 && nivel < minBat && !cargando) return false;
            }
            // 2) su horario (se puede quitar desde la app)
            // 🛑 v1.22 (6-sep-2026, domingo): Asier «tengo todo activado y le hablo y no me oye».
            //    Era esto: los DOMINGOS no escuchaba en todo el dia, por ahorrar bateria. El
            //    hombre trabaja los domingos. Fuera el domingo: solo manda la hora, y ancha
            //    (7 a 22), que a las siete y media de la tarde sigue trabajando.
            if (pf.getBoolean(K_SOLO_HORARIO, false)) {
                java.util.Calendar c = java.util.Calendar.getInstance();
                int h = c.get(java.util.Calendar.HOUR_OF_DAY);
                if (h < HORA_ABRE || h >= HORA_CIERRA) return false;
            }
            return true;
        } catch (Exception e) { return true; }
    }

    /**
     * v1.21 · EL VIGILANTE (Asier, 5-sep: «le hablo y no funciona»). El servicio estaba VIVO
     * pero sin escuchar: basta con que una vuelta se quede a medias (el reconocedor de Android
     * abierto y sin contestar nunca, o el bucle salido por un fallo) para que `listening` o
     * `vigilando` se queden pegados y `arrancarVigilancia()` se dé media vuelta para siempre.
     * Desde ahora, cada minuto se comprueba y se levanta solo — y se avisa al servidor.
     */
    private void arrancarVigilante() {
        if (vigilante != null) return;
        vigilante = new Runnable() {
            @Override public void run() {
                try {
                    if (stopping) return;
                    boolean siesta = siestaHasta() > System.currentTimeMillis();
                    boolean colgado = listening && (System.currentTimeMillis() - listeningDesde > 25000);
                    if (colgado) {
                        parteAlServidor("ww_revive", "{\"motivo\":\"el reconocedor se quedo colgado\"}");
                        try { if (sr != null) sr.cancel(); } catch (Exception e) {}
                        listening = false;
                        try { destapar(); } catch (Exception e) {}
                    }
                    if (!siesta && !vigilando && !listening && tocaEscuchar()) {
                        parteAlServidor("ww_revive", "{\"motivo\":\"estaba vivo pero sin escuchar\"}");
                        arrancarVigilancia();
                    }
                } catch (Exception e) {
                } finally {
                    if (!stopping) handler.postDelayed(vigilante, 60000);
                }
            }
        };
        handler.postDelayed(vigilante, 60000);
    }

    private void arrancarVigilancia() {
        if (stopping || vigilando || listening) return;
        if (siestaHasta() > System.currentTimeMillis()) return;   // v1.10 · está de siesta
        if (!tocaEscuchar()) {                                    // v1.11 · fuera de hora o sin batería
            boolean enUso = cedeEnUso() && estaEnUso();            // v1.18 · o es que está usando el móvil
            try {
                NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (nm != null) nm.notify(NOTIF_ID, buildNotif(enUso
                        ? "Callado mientras usas el móvil (así puedes dictar)"
                        : ("Descansando — vuelvo a las " + HORA_ABRE + ":00")));
            } catch (Exception e) {}
            handler.postDelayed(new Runnable() {
                @Override public void run() { if (!stopping) arrancarVigilancia(); }
            }, enUso ? 15 * 1000L : 10 * 60 * 1000L);              // en uso, se mira cada quince segundos
            return;
        }
        vigilando = true;
        if (esperaCesion > 0) avisoNormal();   // v1.19 · vuelve a escuchar tras haber cedido
        hiloVad = new Thread(new Runnable() { @Override public void run() { bucleVad(); } }, "azkarin-vad");
        hiloVad.setPriority(Thread.MIN_PRIORITY);
        hiloVad.start();
    }

    private void bucleVad() {
        try { if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire(); } catch (Exception e) {}
        int min = 0;
        try { min = AudioRecord.getMinBufferSize(HZ, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT); } catch (Exception e) {}
        if (min <= 0) min = 4096;
        final int tam = Math.max(min, 2048);
        short[] buf = new short[tam / 2];
        try {
            // 🛑 v1.23 · «ESTOY VIENDO UN VIDEO Y LE DIGO AZKARIN Y NO ME OYE» (Asier, 7-sep).
            // Con MIC a secas entra tambien el sonido del PROPIO movil: el video sube el "fondo"
            // y su voz ya nunca lo pasa (voz = rms > fondo x 3,5), asi que se queda sordo.
            // VOICE_RECOGNITION es la fuente pensada para hablar: el movil le quita el eco de su
            // altavoz y el ruido. Y encima se enchufan el cancelador de eco y el de ruido si el
            // telefono los trae. Si esa fuente no estuviera, se cae al MIC de siempre.
            // 🛑 v1.24 · SE VUELVE AL MICRO DE SIEMPRE. En la 1.23 se cambio a VOICE_RECOGNITION
            // y Asier se quedo sin escucha («Escuchando de verdad: NO»). No se arriesga con la
            // fuente: se queda el MIC de toda la vida y se conserva SOLO lo que ayuda de verdad
            // con el video — el cancelador de eco y el de ruido, que se enchufan aparte.
            rec = new AudioRecord(MediaRecorder.AudioSource.MIC, HZ,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, tam * 2);
            if (rec.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("no init");
            // v1.24 · la sesion se apunta LO PRIMERO (asi el vigilante del micro sabe cual es la
            // mia aunque los filtros de abajo fallen), y cada filtro va en su propio try: si el
            // movil no trae uno, se sigue sin el. Ninguno de estos dos puede dejarle sin escucha.
            try { MI_SESION = rec.getAudioSessionId(); } catch (Exception e3) { MI_SESION = -1; }
            if (MI_SESION >= 0) {
                try { if (android.media.audiofx.AcousticEchoCanceler.isAvailable()) { aec = android.media.audiofx.AcousticEchoCanceler.create(MI_SESION); if (aec != null) aec.setEnabled(true); } } catch (Exception e4) { aec = null; }
                try { if (android.media.audiofx.NoiseSuppressor.isAvailable()) { ns = android.media.audiofx.NoiseSuppressor.create(MI_SESION); if (ns != null) ns.setEnabled(true); } } catch (Exception e5) { ns = null; }
            }
            rec.startRecording();
        } catch (Exception e) {
            // Sin oido barato: se vuelve al bucle de antes (pita, pero funciona)
            soltarVad();
            vigilando = false;
            handler.post(new Runnable() { @Override public void run() { abrirReconocedor(); } });
            return;
        }
        VIGILANDO = true;
        arranqueVad = System.currentTimeMillis();   // v1.24
        parteAlServidor("ww_escucha", "{\"motivo\":\"micro abierto, escuchando\"}");
        long _ultimoInforme = System.currentTimeMillis();
        int _vecesVoz = 0;
        float fondo = 0.01f;
        int msVoz = 0;
        int msMudo = 0;   // v1.19 · ceros exactos = otra app tiene el microfono
        boolean huboAudioReal = false;   // v1.20
        long _miraReloj = 0;
        // v1.17 · si se viene de una sesión del reconocedor, hay que oír un hueco de silencio
        // (1,2 s) antes de abrir otra: si alguien habla seguido, un solo «pi» por parrafada, no uno cada cinco segundos
        int msSilencio = 0;
        boolean hueco = !vieneDelReconocedor;
        vieneDelReconocedor = false;
        while (vigilando && !stopping) {
            // cada minuto se comprueba si ha dejado de tocar (se hizo de noche, batería baja)
            if (System.currentTimeMillis() - _miraReloj > 60000) {
                _miraReloj = System.currentTimeMillis();
                if (!tocaEscuchar()) { vigilando = false; handler.post(new Runnable(){ @Override public void run(){ arrancarVigilancia(); } }); break; }
            }
            int n;
            try { n = rec.read(buf, 0, buf.length); } catch (Exception e) { break; }
            if (n <= 0) continue;
            double suma = 0;
            boolean todoCeros = true;
            for (int i = 0; i < n; i++) { if (buf[i] != 0) todoCeros = false; double v = buf[i] / 32768.0; suma += v * v; }
            float rms = (float) Math.sqrt(suma / n);
            int ms = (int) (n * 1000L / HZ);
            // v1.19 · CEDER EL MICRO CUANDO OTRA APP LO USA (Asier: «con Azkarin activado no me
            // deja dictar en otra aplicacion»). Cuando otra app coge el microfono, Android NO da
            // error al de atras: le manda SILENCIO DIGITAL (ceros exactos). Una habitacion callada
            // nunca da ceros exactos, asi que esto no se confunde. Al detectarlo se suelta todo y
            // se vuelve a probar mas tarde, esperando cada vez un poco mas (hasta medio minuto).
            // v1.20 · con dos candados mas, para no quedarse sordo por nada: solo se cede si
            // ANTES habia audio de verdad (algunos moviles devuelven ceros al arrancar) y con
            // dos segundos y medio seguidos de ceros.
            if (todoCeros) {
                msMudo += ms;
                // v1.23 · esto era el unico aviso y tardaba 2,5 s. Ahora, cuando Android nos deja
                // preguntar quien graba (de la 10 en adelante), aquel es el que manda y esto se
                // queda de red de seguridad, con mas margen para no cortarse por nada.
                final int _topeCeros = (vigilanteMicro != null) ? 6000 : 2500;
                if (huboAudioReal && msMudo >= _topeCeros) { cedidoDetectado(); return; }
            } else { huboAudioReal = true; msMudo = 0; if (esperaCesion > 0) { esperaCesion = 0; avisoNormal(); } }
            boolean voz = rms > Math.max(fondo * 3.5f, MIN_ABSOLUTO);
            // v1.20 · cada cinco minutos, una foto: cuanto ruido hay y cuantas veces se abrio
            // el reconocedor. Asi se ve desde fuera si esta sordo, sin preguntarle a Asier.
            if (System.currentTimeMillis() - _ultimoInforme > 300000) {
                _ultimoInforme = System.currentTimeMillis();
                parteAlServidor("ww_estado", "{\"fondo\":" + Math.round(fondo * 1000) + ",\"pico\":" + Math.round(rms * 1000) + ",\"veces\":" + _vecesVoz + "}");
                _vecesVoz = 0;
            }
            if (!voz) {
                fondo = fondo * 0.97f + rms * 0.03f;     // el fondo se aprende solo con lo que NO es voz
                msVoz = 0;
                msSilencio += ms;
                if (msSilencio >= 1200) hueco = true;
            } else {
                msSilencio = 0;
                msVoz += ms;
                if (hueco && msVoz >= MS_VOZ) {
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
        VIGILANDO = false;   // v1.20
        // v1.11 · si se ha salido del bucle porque no toca escuchar, se suelta la CPU
        try { if (!tocaEscuchar() && wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception e) {}
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  v1.23 · QUIEN ESTA GRABANDO, PREGUNTANDOSELO A ANDROID (Asier, 7-sep:
    //  «con Azkarin activado intente hablar por el dictado y no me funciono»).
    //  Hasta ahora se adivinaba: si llegaban ceros exactos DOS SEGUNDOS Y MEDIO, se
    //  suponia que otra app tenia el micro. Eso son dos segundos y medio de dictado
    //  muerto, y encima solo saltaba si ANTES habia habido audio de verdad.
    //  Android tiene una puerta que lo dice AL INSTANTE y ademas avisa cuando la otra
    //  app TERMINA — asi se vuelve en un segundo, no en medio minuto.
    // ══════════════════════════════════════════════════════════════════════════
    private void arrancarVigilanteDelMicro() {
        if (Build.VERSION.SDK_INT < 29 || vigilanteMicro != null) return;
        try {
            if (am == null) am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            final AudioManager.AudioRecordingCallback cb = new AudioManager.AudioRecordingCallback() {
                @Override public void onRecordingConfigChanged(java.util.List<android.media.AudioRecordingConfiguration> cfgs) {
                    try {
                        // 🛑 v1.24 · SI NO SE CUAL ES LA MIA, NO SE CEDE. En la 1.23 esto dejaba a
                        // Asier sordo: mientras MI_SESION valia -1 (justo al arrancar, o entre
                        // vueltas) NINGUNA grabacion se reconocia como propia, asi que la primera
                        // que apareciera —la mia— se tomaba por «otra app» y se soltaba el micro.
                        // Ahora: sin saber cual es la mia, este vigilante NO hace nada.
                        if (MI_SESION < 0) return;
                        // y tampoco en los primeros segundos, que es cuando Android reordena todo
                        if (System.currentTimeMillis() - arranqueVad < 3000) return;
                        boolean otra = false;
                        if (cfgs != null) {
                            for (android.media.AudioRecordingConfiguration c : cfgs) {
                                if (c == null) continue;
                                if (c.getClientAudioSessionId() == MI_SESION) continue;   // esa soy yo
                                otra = true; break;
                            }
                        }
                        if (otra && vigilando) {
                            parteAlServidor("ww_cede", "{\"motivo\":\"Android dice que otra app esta grabando\"}");
                            cedidoDetectado();
                        } else if (!otra && !vigilando && !stopping && esperaCesion > 0) {
                            // la otra app ha terminado: se vuelve YA, no dentro de medio minuto
                            esperaCesion = 0;
                            handler.removeCallbacksAndMessages(null);
                            handler.postDelayed(new Runnable() { @Override public void run() { if (!stopping) { avisoNormal(); arrancarVigilancia(); } } }, 900);
                        }
                    } catch (Exception e) {}
                }
            };
            am.registerAudioRecordingCallback(cb, handler);
            vigilanteMicro = cb;
        } catch (Exception e) { vigilanteMicro = null; }
    }

    private void pararVigilanteDelMicro() {
        try { if (am != null && vigilanteMicro != null) am.unregisterAudioRecordingCallback((AudioManager.AudioRecordingCallback) vigilanteMicro); } catch (Exception e) {}
        vigilanteMicro = null;
    }

    /** v1.19 · otra app tiene el microfono: se suelta TODO y se reintenta con espera creciente. */
    private void cedidoDetectado() {
        vigilando = false;
        VIGILANDO = false;   // v1.20
        listening = false;
        try { if (sr != null) sr.cancel(); } catch (Exception e) {}
        soltarVad();
        destapar();
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception e) {}
        if (esperaCesion == 0) {
            parteAlServidor("ww_cede", "{\"motivo\":\"otra app tiene el microfono\"}");
            try {
                NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (nm != null) nm.notify(NOTIF_ID, buildNotif("Te dejo el micro (lo usa otra app) — vuelvo solo"));
            } catch (Exception e) {}
        }
        // v1.23 · esperas cortas: el vigilante del micro avisa en cuanto la otra app termina,
        // asi que ya no hace falta ir doblando hasta medio minuto.
        esperaCesion = esperaCesion == 0 ? 3000L : Math.min(esperaCesion * 2, 12000L);
        handler.postDelayed(new Runnable() { @Override public void run() { if (!stopping) arrancarVigilancia(); } }, esperaCesion);
    }

    private void avisoNormal() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_ID, buildNotif("Di \"Azkarin\" para hablar"));
        } catch (Exception e) {}
    }

    private void soltarVad() {
        try { if (aec != null) { aec.release(); aec = null; } } catch (Exception e) {}
        try { if (ns != null) { ns.release(); ns = null; } } catch (Exception e) {}
        MI_SESION = -1;
        try { if (rec != null) { try { rec.stop(); } catch (Exception e) {} rec.release(); } } catch (Exception e) {}
        rec = null;
    }

    // ── EL RECONOCEDOR: solo cuando alguien ha hablado ─────────────────────────
    private void abrirReconocedor() {
        if (stopping || listening) return;
        if (sr == null) { initRecognizer(); if (sr == null) { volverAVigilar(1500); return; } }
        try {
            listening = true;
            listeningDesde = System.currentTimeMillis();   // v1.21
            tapar();
            sr.startListening(srIntent);
            destaparEn(1500);   // v1.17: antes 700; el «pi» de entrada puede sonar más tarde
        } catch (Exception e) {
            listening = false;
            destapar();
            volverAVigilar(1200);
        }
    }

    private void volverAVigilar(long ms) {
        if (stopping) return;
        vieneDelReconocedor = true;
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                listening = false;
                arrancarVigilancia();
            }
        }, ms);
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override public void onReadyForSpeech(Bundle params) { destaparEn(900); }   // v1.17: antes 300
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float rmsdB) {}
        @Override public void onBufferReceived(byte[] buffer) {}
        @Override public void onEndOfSpeech() { tapar(); destaparEn(1200); }
        @Override public void onEvent(int eventType, Bundle params) {}

        @Override public void onPartialResults(Bundle partialResults) {
            if (checkResults(partialResults)) reconocedorSinNada = 0;
        }
        @Override public void onResults(Bundle results) {
            destaparEn(1000);
            boolean algo = checkResults(results);
            if (algo) { reconocedorSinNada = 0; return; }
            reconocedorSinNada++;
            volverAVigilar(reconocedorSinNada >= 3 ? 2500 : 400);
        }
        @Override public void onError(int error) {
            destaparEn(1000);
            reconocedorSinNada++;
            // v1.19 · «reconocedor ocupado» = lo esta usando otra app (el dictado del teclado).
            // De reconocedor solo hay UNO en el movil: aqui se cede y se vuelve mas tarde.
            if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) { listening = false; cedidoDetectado(); return; }
            long espera = (error == SpeechRecognizer.ERROR_CLIENT) ? 1200 : 400;
            volverAVigilar(espera);
        }
    };

    private boolean checkResults(Bundle b) {
        if (b == null) return false;
        ArrayList<String> list = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (list == null) return false;
        // v1.20 · lo que oye, apuntado (recortado): si le oye pero no reconoce el nombre, se ve.
        try {
            String prim = list.isEmpty() ? "" : String.valueOf(list.get(0));
            if (prim.length() > 60) prim = prim.substring(0, 60);
            prim = prim.replace("\\", " ").replace("\"", " ");
            if (!prim.isEmpty()) ULTIMO_OIDO = prim;
            if (!prim.isEmpty()) parteAlServidor("ww_oye", "{\"texto\":\"" + prim + "\",\"vale\":" + pareceAzkarin(prim) + "}");
        } catch (Exception e) {}
        for (String s : list) {
            if (pareceParar(s)) {                      // v1.10 · «Azkarin, deja de escuchar»
                long hasta = plazoDeLaSiesta(s);
                String comoLoDigo;
                if (hasta < 0) { comoLoDigo = "Callado. Para volver, toca aqui."; hasta = 0; }
                else {
                    java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("HH:mm", new Locale("es","ES"));
                    comoLoDigo = "Vuelvo solo a las " + f.format(new java.util.Date(hasta)) + " · o toca aqui";
                }
                ponerSiesta(hasta, comoLoDigo);
                return true;
            }
            if (pareceAzkarin(s)) { trigger(); return true; }
        }
        return false;
    }

    /**
     * v1.10 · «DEJA DE ESCUCHAR». Se le puede mandar callar hablando, y con plazo:
     * «deja de escuchar» (una hora), «...una hora», «...hasta mañana», «...del todo».
     * Tiene que llevar su nombre delante o detras: asi no se calla porque alguien lo diga
     * en una conversacion cualquiera.
     */
    private boolean pareceParar(String raw) {
        if (raw == null) return false;
        String t = raw.toLowerCase(Locale.ROOT)
            .replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u");
        if (!pareceAzkarin(t)) return false;
        return t.contains("deja de escuchar") || t.contains("dejate de escuchar")
            || t.contains("no me escuches") || t.contains("no escuches")
            || t.contains("deja de oir") || t.contains("callate del todo")
            || t.contains("desactivate") || t.contains("desconectate")
            || t.contains("modo silencio") || t.contains("descansa");
    }
    private long plazoDeLaSiesta(String raw) {
        String t = raw == null ? "" : raw.toLowerCase(Locale.ROOT);
        long ahora = System.currentTimeMillis();
        if (t.contains("del todo") || t.contains("para siempre") || t.contains("apagate")) return -1;
        if (t.contains("manana") || t.contains("mañana") || t.contains("hasta manana") || t.contains("hasta mañana")) {
            java.util.Calendar c = java.util.Calendar.getInstance();
            c.setTimeInMillis(ahora);
            c.add(java.util.Calendar.DAY_OF_YEAR, 1);
            c.set(java.util.Calendar.HOUR_OF_DAY, 8);
            c.set(java.util.Calendar.MINUTE, 0);
            c.set(java.util.Calendar.SECOND, 0);
            return c.getTimeInMillis();
        }
        java.util.regex.Matcher m = java.util.regex.Pattern
            .compile("(\\d{1,3})\\s*(hora|h\\b|minuto|min)").matcher(t);
        if (m.find()) {
            long n = Long.parseLong(m.group(1));
            return ahora + (m.group(2).startsWith("h") ? n * 3600000L : n * 60000L);
        }
        if (t.contains("media hora")) return ahora + 30 * 60000L;
        if (t.contains("un rato")) return ahora + 30 * 60000L;
        return ahora + SIESTA_POR_DEFECTO;
    }

    /** Acepta "Azkarin" y como lo suele transcribir mal el reconocedor en espanol. */
    private boolean pareceAzkarin(String raw) {
        if (raw == null) return false;
        String t = raw.toLowerCase(Locale.ROOT)
            .replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u")
            .replace(" ","").replace("-","");   // v1.13: «az carin», «as-karin» → sin huecos
        String[] roots = {
            "azkarin","azcarin","askarin","ascarin","oscarin","ozkarin",
            "azkar","azcar","askar","ascar","zkarin","scarin","eskarin","escarin","oscarin","azkarim","ascarim"
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

    private void avisoDeSiesta(String comoLoDigo, long hasta) {
        try {
            int pf = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) pf |= PendingIntent.FLAG_IMMUTABLE;
            Intent volver = new Intent(this, WakeWordService.class);
            volver.setAction("DESPIERTA");
            PendingIntent volverPi = PendingIntent.getService(this, 3, volver, pf);
            Intent stop = new Intent(this, WakeWordService.class);
            stop.setAction("STOP");
            PendingIntent stopPi = PendingIntent.getService(this, 1, stop, pf);
            Notification n = new NotificationCompat.Builder(this, CH)
                .setContentTitle("Azkarin NO te escucha")
                .setContentText(comoLoDigo)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(volverPi)
                .addAction(0, "Volver a escuchar", volverPi)
                .addAction(0, "Parar del todo", stopPi)
                .build();
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_ID, n);
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
        try { if (vigilante != null) handler.removeCallbacks(vigilante); } catch (Exception e) {}   // v1.21
        try { if (pantallaReceiver != null) unregisterReceiver(pantallaReceiver); } catch (Exception e) {}   // v1.18
        pararVigilanteDelMicro();   // v1.23
        stopping = true;
        vigilando = false;
        RUNNING = false;
        VIGILANDO = false;   // v1.20
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
