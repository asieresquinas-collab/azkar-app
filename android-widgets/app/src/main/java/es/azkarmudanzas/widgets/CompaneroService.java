package es.azkarmudanzas.widgets;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
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
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Locale;

/**
 * EL COMPAÑERO (v1.39, 12-nov-2026). Asier: «quiero que Azkarin sea como KITT, el coche fantástico:
 * que me hable en voz alta como si fuera mi compañero de verdad… que me hable él solo sin tocar el
 * móvil y le pueda hablar yo… pero no me vale como lo hicimos la última vez, eso era una castaña».
 *
 * Lo de la otra vez iba dentro de la app-web y Android le cortaba el micro y el sonido. Esto es un
 * servicio de Android de verdad, que Asier ENCIENDE una vez desde la pantalla de la app (así Android
 * le deja usar el micro) y se queda en la barra de avisos:
 *   · cada medio minuto mira si Azkarin tiene algo que decirle por su cuenta (/api/widget/companero);
 *   · si lo hay, lo DICE EN ALTO él solo y se queda ESCUCHANDO la respuesta, sin tocar nada;
 *   · lo que Asier conteste va al mismo cerebro de Azkarin que el chat; si esperaba un «sí», el «sí»
 *     de palabra lo hace (y el servidor quita el que esperaba en Telegram, para no hacerlo dos veces);
 *   · la conversación sigue mientras hable; tras dos escuchas en silencio vuelve a esperar callado.
 * No abre ninguna pantalla. Se apaga con el mismo botón o desde el aviso.
 */
public class CompaneroService extends Service implements RecognitionListener {

    static final String PREF = "companero_on";
    static final String ACCION_APAGAR = "es.azkarmudanzas.widgets.COMPANERO_APAGAR";
    static final String ACCION_PROBAR = "es.azkarmudanzas.widgets.COMPANERO_PROBAR";
    static final int ID_AVISO = 41;
    static final long CADA_MS = 30000;
    static final int VERSION = 41;
    static volatile boolean vivo = false;
    static volatile String ultimoEstado = "";

    static final int REPOSO = 0, HABLANDO = 1, ESCUCHANDO = 2, PENSANDO = 3;
    int fase = REPOSO;
    Handler ui = new Handler(Looper.getMainLooper());
    TextToSpeech tts;
    boolean ttsListo = false;
    SpeechRecognizer rec;
    PowerManager.WakeLock despierto;
    AudioManager audio;
    JSONArray historial = new JSONArray();
    JSONObject accionPendiente = null;
    String idActual = null;          // lo de la cola que se está diciendo
    boolean resuelto = false;        // si lo de la cola ya se contestó de palabra (sí / no)
    int vacias = 0;                  // escuchas seguidas sin voz
    boolean mirando = false;
    String pendienteDeDecir = null;  // si la voz aún no estaba lista
    // v1.40 · lo que de verdad oye el micro (para verlo desde fuera): el parcial más largo, el volumen máximo y los últimos sucesos
    String mejorParcial = "";
    float rmsMax = -99f;
    static final java.util.LinkedList<String> diario = new java.util.LinkedList<String>();
    static void apunta(String que) {
        synchronized (diario) { diario.add((System.currentTimeMillis() / 1000) + " " + que); while (diario.size() > 14) diario.removeFirst(); }
    }
    static String diarioTexto() {
        StringBuilder b = new StringBuilder();
        synchronized (diario) { for (String x : diario) { if (b.length() > 0) b.append(" | "); b.append(x); } }
        return b.toString();
    }
    /** Una palabra suelta de relleno no es una frase: el reconocedor de Google la «oye» en un ruido o un pitido. */
    static boolean esRuido(String t) {
        String x = t.toLowerCase(Locale.ROOT).replaceAll("[^a-záéíóúüñ ]", "").trim();
        return x.isEmpty() || x.matches("^(pero|eh|em|mm+|ah|oh|y|a|o|e|que|qué|es|el|la|de|en|pues|bueno|hola)$");
    }

    static boolean encendido(Context c) { return Datos.prefs(c).getBoolean(PREF, false); }

    /** Encender desde una pantalla a la vista (así Android deja usar el micro al servicio). */
    static void encender(Context c) {
        Datos.prefs(c).edit().putBoolean(PREF, true).apply();
        Intent i = new Intent(c, CompaneroService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) Context.class.getMethod("startForegroundService", Intent.class).invoke(c, i);
            else c.startService(i);
        } catch (Exception e) { try { c.startService(i); } catch (Exception e2) { ultimoEstado = "no ha arrancado: " + e2.getMessage(); } }
    }
    static void apagar(Context c) {
        Datos.prefs(c).edit().putBoolean(PREF, false).apply();
        try { c.stopService(new Intent(c, CompaneroService.class)); } catch (Exception e) { /* nada */ }
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        vivo = true;
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        try { startForeground(ID_AVISO, aviso("Estoy contigo. Te hablo cuando tenga algo.")); } catch (Exception e) { ultimoEstado = "sin aviso fijo: " + e.getMessage(); }
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            despierto = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "azkar:companero");
            despierto.setReferenceCounted(false);
            despierto.acquire();
        } catch (Exception e) { /* sin él también va, con la pantalla encendida */ }
        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override public void onInit(int st) {
                ttsListo = (st == TextToSpeech.SUCCESS);
                if (ttsListo) {
                    try { tts.setLanguage(new Locale("es", "ES")); } catch (Exception e) { /* nada */ }
                    try { tts.setSpeechRate(1.3f); } catch (Exception e) { /* nada */ }
                    if (pendienteDeDecir != null) { final String t = pendienteDeDecir; pendienteDeDecir = null; ui.post(new Runnable() { @Override public void run() { di(t); } }); }
                } else ultimoEstado = "la voz del móvil no arranca";
            }
        });
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { }
            @Override public void onError(String id) { ui.post(new Runnable() { @Override public void run() { trasHablar(); } }); }
            @Override public void onDone(String id) { ui.post(new Runnable() { @Override public void run() { trasHablar(); } }); }
        });
        ui.postDelayed(vuelta, 4000);
        ultimoEstado = "encendido";
    }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        String a = i == null ? null : i.getAction();
        if (ACCION_APAGAR.equals(a)) { apagar(this); stopSelf(); return START_NOT_STICKY; }
        if (ACCION_PROBAR.equals(a) && fase == REPOSO) {
            historial = new JSONArray(); accionPendiente = null; idActual = null; resuelto = false; vacias = 0;
            di("Hola Asier, soy Azkarin. Ya estoy contigo. Dime algo y te contesto.");
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        vivo = false;
        ui.removeCallbacksAndMessages(null);
        try { if (rec != null) rec.destroy(); } catch (Exception e) { /* nada */ }
        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception e) { /* nada */ }
        try { if (despierto != null && despierto.isHeld()) despierto.release(); } catch (Exception e) { /* nada */ }
        try { audio.abandonAudioFocus(null); } catch (Exception e) { /* nada */ }
        ultimoEstado = "apagado";
        super.onDestroy();
    }

    // ── el aviso fijo (obligatorio en Android para que el servicio siga vivo) ──
    Notification aviso(String texto) {
        String canal = "companero";
        if (Build.VERSION.SDK_INT >= 26) {
            try { // NotificationChannel es de la API 26 y esto se compila con la 25: por reflexión
                Class<?> nc = Class.forName("android.app.NotificationChannel");
                Object ch = nc.getConstructor(String.class, CharSequence.class, int.class).newInstance(canal, "Azkarin · compañero", 2 /* IMPORTANCE_LOW */);
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                NotificationManager.class.getMethod("createNotificationChannel", nc).invoke(nm, ch);
            } catch (Exception e) { /* nada */ }
        }
        Notification.Builder b = new Notification.Builder(this);
        if (Build.VERSION.SDK_INT >= 26) { try { Notification.Builder.class.getMethod("setChannelId", String.class).invoke(b, canal); } catch (Exception e) { /* nada */ } }
        int f = Build.VERSION.SDK_INT >= 23 ? 0x04000000 /* FLAG_IMMUTABLE */ : 0;
        PendingIntent abrir = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), f);
        PendingIntent apagar = PendingIntent.getService(this, 1, new Intent(this, CompaneroService.class).setAction(ACCION_APAGAR), f);
        b.setSmallIcon(R.drawable.azkarin).setContentTitle("Azkarin · compañero").setContentText(texto).setOngoing(true).setContentIntent(abrir)
         .addAction(0, "APAGAR", apagar);
        return b.build();
    }
    void estado(String t) {
        ultimoEstado = t;
        try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(ID_AVISO, aviso(t)); } catch (Exception e) { /* nada */ }
    }

    // ── cada medio minuto: ¿tiene Azkarin algo que decirme? ──
    final Runnable vuelta = new Runnable() {
        @Override public void run() {
            if (!vivo) return;
            ui.postDelayed(this, CADA_MS);
            if (fase != REPOSO || mirando) return;
            mirando = true;
            new Thread(new Runnable() { @Override public void run() {
                JSONObject j = null;
                try { j = Datos.companero(CompaneroService.this); } catch (Exception e) { j = null; }
                final JSONObject r = j;
                ui.post(new Runnable() { @Override public void run() {
                    mirando = false;
                    if (r == null || !r.optBoolean("hay") || fase != REPOSO) return;
                    String texto = r.optString("texto", "").trim();
                    if (texto.isEmpty()) return;
                    historial = new JSONArray(); vacias = 0; resuelto = false;
                    idActual = r.optString("id", null);
                    accionPendiente = r.optJSONObject("accion");
                    mete("assistant", texto);
                    di(texto);
                } });
            } }).start();
        }
    };

    void mete(String rol, String texto) {
        try { JSONObject m = new JSONObject(); m.put("role", rol); m.put("content", texto); historial.put(m); while (historial.length() > 12) historial.remove(0); } catch (Exception e) { /* nada */ }
    }

    /** v1.40 · Asier: «cuando me hable por el widget, que no me diga el consumo de IA en cada mensaje». Quita la coletilla del
     *  final (el punto de color con el gasto, o el aviso de pago) antes de leer en voz. En pantalla se sigue viendo. */
    static String sinConsumo(String t) {
        return String.valueOf(t == null ? "" : t)
            .replaceAll("(?s)\\s*[\\x{1F534}\\x{1F7E0}-\\x{1F7EB}\\x{26AA}\\x{26AB}][ \\t]*(?:[0-9]\\x{FE0F}?\\x{20E3}|[ ,.\\x{FE0F}])+\\s*$", "")
            .replaceAll("(?s)\\s*\\x{1F4B8}[^\\n]*$", "").trim();
    }

    static String paraVoz(String t) {
        return sinConsumo(t)
            .replaceAll("(?is)<br\\s*/?>", ". ").replaceAll("(?is)</?[a-z][^>]*>", "")
            .replaceAll("\\[([^\\]]*)\\]\\([^)]*\\)", "$1")
            .replaceAll("https?://\\S+", "")
            .replaceAll("\\*\\*|__|`|#+", "")
            .replaceAll("[\\x{1F000}-\\x{1FAFF}\\x{2600}-\\x{27BF}\\x{FE0F}]", "")
            .replaceAll("\\s*\\n+\\s*", ". ").replaceAll("[ \\t]+", " ").trim();
    }

    // ── hablar ──
    void di(String texto) {
        String t = paraVoz(texto);
        if (t.isEmpty()) { trasHablar(); return; }
        if (!ttsListo) { pendienteDeDecir = texto; return; }
        fase = HABLANDO;
        estado("Te estoy hablando…");
        try { if (rec != null) rec.cancel(); } catch (Exception e) { /* nada */ }
        try { audio.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK); } catch (Exception e) { /* nada */ }
        try {
            if (t.length() > 3500) t = t.substring(0, 3500);
            tts.speak(t, TextToSpeech.QUEUE_FLUSH, null, "azk_comp");
        } catch (Exception e) { trasHablar(); }
    }

    void trasHablar() {
        if (!vivo) return;
        apunta("dicho");
        // lo de la cola ya está dicho: que el servidor no lo repita
        if (idActual != null && !resuelto) { final String id = idActual; new Thread(new Runnable() { @Override public void run() { Datos.companeroOido(CompaneroService.this, id, "dicho"); } }).start(); }
        ui.postDelayed(new Runnable() { @Override public void run() { if (vivo) escuchar(); } }, 500);   // v1.40: medio segundo, que no se oiga a sí mismo
    }

    // ── escuchar ──
    void escuchar() {
        if (!vivo) return;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { reposo("el móvil no tiene el reconocimiento de voz de Google"); return; }
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) { reposo("falta el permiso del micrófono: abre Azkar Widgets y acéptalo"); return; }
        try {
            if (rec == null) { rec = SpeechRecognizer.createSpeechRecognizer(this); rec.setRecognitionListener(this); }
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES");
            i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
            i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);   // v1.40: como la burbuja (que oye bien)
            mejorParcial = ""; rmsMax = -99f;
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L);
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L);
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 4000L);
            fase = ESCUCHANDO;
            estado(accionPendiente != null ? "Te escucho: ¿sí o no?" : "Te escucho…");
            rec.startListening(i);
        } catch (Exception e) { reposo("no he podido abrir el micro: " + e.getMessage()); }
    }

    void reposo(String porque) {
        apunta("reposo" + (porque == null ? "" : " " + porque));
        fase = REPOSO; vacias = 0; idActual = null; accionPendiente = null;
        try { audio.abandonAudioFocus(null); } catch (Exception e) { /* nada */ }
        estado(porque == null ? "Estoy contigo. Te hablo cuando tenga algo." : "En espera · " + porque);
    }

    @Override public void onReadyForSpeech(Bundle p) { }
    @Override public void onBeginningOfSpeech() { }
    @Override public void onRmsChanged(float r) { if (r > rmsMax) rmsMax = r; }
    @Override public void onBufferReceived(byte[] b) { }
    @Override public void onEndOfSpeech() { }
    @Override public void onEvent(int t, Bundle p) { }
    @Override public void onPartialResults(Bundle p) {
        try { ArrayList<String> l = p.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); if (l != null && !l.isEmpty() && l.get(0).length() > mejorParcial.length()) mejorParcial = l.get(0); } catch (Exception e) { /* nada */ }
    }

    @Override
    public void onError(int e) {
        if (!vivo || fase != ESCUCHANDO) return;
        apunta("error " + e + " vol " + Math.round(rmsMax));
        if (e == SpeechRecognizer.ERROR_NO_MATCH || e == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
            vacias++;
            if (vacias >= 2) { reposo(null); return; }   // se ha callado: a esperar otra vez, sin pitar más
            ui.postDelayed(new Runnable() { @Override public void run() { if (vivo && fase == ESCUCHANDO) escuchar(); } }, 1200);
            return;
        }
        if (e == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) { reposo("Android no me deja el micro: abre Azkar Widgets, apaga y enciende el compañero"); return; }
        if (e == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) { ui.postDelayed(new Runnable() { @Override public void run() { if (vivo && fase == ESCUCHANDO) escuchar(); } }, 1500); return; }
        vacias++;
        if (vacias >= 3) { reposo("fallo del micro (" + e + ")"); return; }
        ui.postDelayed(new Runnable() { @Override public void run() { if (vivo && fase == ESCUCHANDO) escuchar(); } }, 1500);
    }

    @Override
    public void onResults(Bundle p) {
        if (!vivo) return;
        ArrayList<String> l = p.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (l == null || l.isEmpty() || l.get(0).trim().isEmpty()) { onError(SpeechRecognizer.ERROR_NO_MATCH); return; }
        String oido0 = l.get(0).trim();
        if (mejorParcial.trim().length() > oido0.length() + 3) oido0 = mejorParcial.trim();   // v1.40: si el final llega recortado, vale el parcial más largo
        final String texto = oido0;
        String b = texto.toLowerCase(Locale.ROOT);
        apunta("oido «" + (texto.length() > 40 ? texto.substring(0, 40) + "…" : texto) + "» vol " + Math.round(rmsMax));
        // v1.40 · 13-nov: le llegaba «pero» una y otra vez (un ruido que el reconocedor convierte en palabra) y contestaba en bucle.
        //  Una palabra suelta de relleno, sin un «sí/no» pendiente, no se manda: cuenta como silencio.
        if (accionPendiente == null && esRuido(texto)) { onError(SpeechRecognizer.ERROR_NO_MATCH); return; }
        vacias = 0;
        if (accionPendiente != null) {
            final JSONObject acc = accionPendiente;
            if (esSi(b)) {
                accionPendiente = null;
                try {
                    JSONObject conf = new JSONObject();
                    conf.put("herramienta", acc.optString("herramienta"));
                    conf.put("argumentos", acc.optJSONObject("argumentos") == null ? new JSONObject() : acc.optJSONObject("argumentos"));
                    conf.put("confirmado", true);
                    cerrarCola("hecho");
                    mandar("(confirmación)", conf);
                } catch (Exception e) { di("No he podido montar la confirmación."); }
                return;
            }
            if (esNo(b)) { accionPendiente = null; cerrarCola("no"); mete("assistant", "Acción cancelada por Asier."); di("Vale, no lo hago."); return; }
            // ni sí ni no: es que me está diciendo otra cosa (una corrección, una pregunta): va al cerebro y el sí sigue esperando en Telegram
            accionPendiente = null;
        }
        if (esAdios(b)) { fase = REPOSO; try { tts.speak("Vale. Aquí estoy.", TextToSpeech.QUEUE_FLUSH, null, null); } catch (Exception e) { /* nada */ } reposo(null); return; }
        mandar(texto, null);
    }

    void cerrarCola(final String resultado) {
        resuelto = true;
        if (idActual == null) return;
        final String id = idActual;
        new Thread(new Runnable() { @Override public void run() { Datos.companeroOido(CompaneroService.this, id, resultado); } }).start();
    }

    static boolean esSi(String t) { return t.matches("^(s[ií]|vale|dale|ok|okey|hazlo|m[aá]ndalo|m[aá]ndaselo|env[ií]alo|confirmo|adelante|venga|claro|perfecto)\\b.*"); }
    static boolean esNo(String t) { return t.matches("^(no|cancela|d[eé]jalo|para|espera|todav[ií]a no)\\b.*"); }
    static boolean esAdios(String t) { t = t.trim(); return t.equals("adiós") || t.equals("adios") || t.equals("agur") || t.equals("nada más") || t.equals("nada mas") || t.equals("ya está") || t.equals("ya esta") || t.equals("luego hablamos") || t.equals("cállate") || t.equals("callate"); }

    void mandar(final String texto, final JSONObject conf) {
        fase = PENSANDO;
        estado("Pensando…");
        if (conf == null) mete("user", texto);
        new Thread(new Runnable() { @Override public void run() {
            final JSONObject r = Datos.chat(CompaneroService.this, texto, historial, conf);
            ui.post(new Runnable() { @Override public void run() {
                if (!vivo) return;
                if (r == null) { di("No llego al cerebro de Azkarin." + (Datos.ultimoErrorChat.isEmpty() ? "" : " " + Datos.ultimoErrorChat)); return; }
                String msg = r.optString("mensaje", "");
                if (msg.isEmpty()) msg = r.optString("texto", r.optString("respuesta", ""));
                if (msg.isEmpty() && r.has("error")) msg = "No he podido: " + r.optString("error");
                if (msg.isEmpty()) msg = "Hecho.";
                JSONObject acc = "confirmacion".equals(r.optString("tipo")) ? r.optJSONObject("accion") : null;
                if (acc != null) { accionPendiente = acc; idActual = null; msg = msg.replaceAll("(?is)si te parece bien,? dime «sí».*$", "").trim() + " ¿Lo hago?"; }
                mete("assistant", msg);
                di(msg);
            } });
        } }).start();
    }
}
