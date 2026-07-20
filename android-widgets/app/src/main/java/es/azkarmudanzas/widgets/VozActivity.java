package es.azkarmudanzas.widgets;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Locale;

/**
 * WALKIE-TALKIE CON AZKARIN (v1.2, petición de Asier): tocas la burbuja del widget y
 * hablas DIRECTAMENTE — sin navegador y sin abrir la app. Solo aparece una tarjetita
 * flotante encima de lo que estés haciendo: te escucha, manda tu frase al cerebro de
 * Azkarin (el MISMO canal que el chat de la app), él hace lo suyo (calendario, fichas…)
 * y te CONTESTA POR VOZ. Si algo necesita confirmación, te lo lee y le dices "sí" o "no".
 * Se cierra solo cuando te callas.
 */
public class VozActivity extends Activity implements RecognitionListener {

    SpeechRecognizer rec;
    TextToSpeech tts;
    boolean ttsListo = false;
    boolean cerrando = false;
    TextView estado, dicho, respuesta;
    Handler ui = new Handler(Looper.getMainLooper());
    JSONArray historial = new JSONArray();
    JSONObject accionPendiente = null; // {herramienta, argumentos} esperando "sí"/"no"
    // v1.3 MODO COCHE: la conversación se queda ABIERTA — el silencio NO la cierra al momento.
    // Se re-escucha con retardo creciente en vacío (lección v369 de la app: sin ametralladora
    // de pitidos) y solo se despide tras 3 MINUTOS seguidos sin voz de verdad.
    long ultimaVozReal = 0;
    int retardoRearme = 0; // ms extra entre escuchas vacías (0 → 1500 → 3000 → 4500 → 6000 tope)
    static final long SILENCIO_MAX_MS = 180000; // 3 min callado → me retiro

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        // v1.3: en el coche la pantalla NO se apaga mientras la conversación está abierta
        // (si se apagara, Android pausa la tarjeta y se cortaría la charla).
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        ultimaVozReal = android.os.SystemClock.elapsedRealtime();
        int pad = (int) (18 * getResources().getDisplayMetrics().density);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(pad, pad, pad, pad);
        GradientDrawable fondo = new GradientDrawable();
        fondo.setColor(Color.WHITE);
        fondo.setCornerRadius(22 * getResources().getDisplayMetrics().density);
        fondo.setStroke(2, Color.parseColor("#1B4F8A"));
        card.setBackground(fondo);

        LinearLayout fila = new LinearLayout(this);
        fila.setOrientation(LinearLayout.HORIZONTAL);
        fila.setGravity(Gravity.CENTER_VERTICAL);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.azkarin);
        int sz = (int) (44 * getResources().getDisplayMetrics().density);
        LinearLayout.LayoutParams lpLogo = new LinearLayout.LayoutParams(sz, sz);
        fila.addView(logo, lpLogo);
        estado = new TextView(this);
        estado.setText("  Un momento…");
        estado.setTextSize(19);
        estado.setTypeface(null, Typeface.BOLD);
        estado.setTextColor(Color.parseColor("#1B4F8A"));
        fila.addView(estado);
        TextView cerrar = new TextView(this);
        cerrar.setText("  ✖");
        cerrar.setTextSize(22);
        cerrar.setTextColor(Color.parseColor("#888888"));
        cerrar.setPadding(pad, 0, 0, 0);
        cerrar.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { cierraYa(); } });
        LinearLayout.LayoutParams lpX = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        fila.addView(cerrar, lpX);
        card.addView(fila);

        dicho = new TextView(this);
        dicho.setTextSize(16);
        dicho.setTextColor(Color.parseColor("#555555"));
        dicho.setPadding(0, pad / 2, 0, 0);
        card.addView(dicho);

        respuesta = new TextView(this);
        respuesta.setTextSize(17);
        respuesta.setTextColor(Color.parseColor("#111111"));
        respuesta.setPadding(0, pad / 2, 0, 0);
        card.addView(respuesta);

        ScrollView sc = new ScrollView(this);
        sc.addView(card, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(sc);

        if (!Datos.hayLogin(this)) {
            estado.setText("  Entra primero");
            respuesta.setText("Abre \"Azkar Widgets\" y entra una vez con tu usuario y clave de la app.");
            ui.postDelayed(new Runnable() { @Override public void run() { cierraYa(); } }, 3500);
            return;
        }

        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int st) {
                ttsListo = (st == TextToSpeech.SUCCESS);
                if (ttsListo) {
                    try { tts.setLanguage(new Locale("es", "ES")); } catch (Exception e) { /* nada */ }
                    try { tts.setSpeechRate(1.5f); } catch (Exception e) { /* nada */ } // v1.5: Asier lo quiere a 1,5
                }
            }
        });
        if (tts != null) tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { }
            @Override public void onError(String id) { ui.post(new Runnable() { @Override public void run() { escuchar(); } }); }
            @Override public void onDone(String id) { ui.post(new Runnable() { @Override public void run() { escuchar(); } }); }
        });

        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 7);
        } else {
            escuchar();
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == 7 && res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) escuchar();
        else {
            estado.setText("  Sin micrófono");
            respuesta.setText("Sin el permiso del micro no puedo escucharte. Dale a la burbuja otra vez y acepta el permiso.");
            ui.postDelayed(new Runnable() { @Override public void run() { cierraYa(); } }, 4000);
        }
    }

    void escuchar() {
        if (cerrando) return;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            // sin reconocimiento de Google en el móvil → camino viejo (la web con voz)
            try { startActivity(AbrirAzkar.hablarConAzkarin(this)); } catch (Exception e) { /* nada */ }
            cierraYa();
            return;
        }
        try {
            if (rec == null) {
                rec = SpeechRecognizer.createSpeechRecognizer(this);
                rec.setRecognitionListener(this);
            }
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES");
            i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            // v1.3: aguanta pausas al hablar (frases largas dictando en el coche)
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L);
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L);
            rec.startListening(i);
            estado.setText(accionPendiente != null ? "  ¿Sí o no?" : "  🎤 Te escucho…");
        } catch (Exception e) {
            estado.setText("  No pude abrir el micro");
            respuesta.setText(String.valueOf(e.getMessage()));
        }
    }

    // ── RecognitionListener ──
    @Override public void onReadyForSpeech(Bundle p) { }
    @Override public void onBeginningOfSpeech() { }
    @Override public void onRmsChanged(float r) { }
    @Override public void onBufferReceived(byte[] b) { }
    @Override public void onEndOfSpeech() { estado.setText("  Pensando…"); }
    @Override public void onEvent(int t, Bundle p) { }

    @Override
    public void onPartialResults(Bundle p) {
        ArrayList<String> l = p.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (l != null && !l.isEmpty()) dicho.setText("Tú: " + l.get(0));
    }

    @Override
    public void onError(int e) {
        if (cerrando) return;
        if (e == SpeechRecognizer.ERROR_NO_MATCH || e == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
            // v1.3 MODO COCHE: el silencio NO cierra — sigo a la escucha con retardo creciente
            // (para no ametrallar a pitidos). Solo tras 3 min sin voz real me despido.
            if (android.os.SystemClock.elapsedRealtime() - ultimaVozReal > SILENCIO_MAX_MS) {
                cerrando = true; // que el fin de la despedida no re-abra el micro
                di("Me retiro. Toca la burbuja cuando me necesites.");
                ui.postDelayed(new Runnable() { @Override public void run() { cierraYa(); } }, 2800);
                return;
            }
            retardoRearme = Math.min(retardoRearme + 1500, 6000);
            estado.setText("  🎤 Sigo aquí — háblame");
            ui.postDelayed(new Runnable() { @Override public void run() { if (!cerrando) escuchar(); } }, retardoRearme);
            return;
        }
        if (e == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) { estado.setText("  Sin permiso de micro"); return; }
        estado.setText("  Fallo del micro (" + e + ")");
        ui.postDelayed(new Runnable() { @Override public void run() { if (!cerrando) escuchar(); } }, 1000);
    }

    @Override
    public void onResults(Bundle p) {
        ArrayList<String> l = p.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (l == null || l.isEmpty()) { escuchar(); return; }
        ultimaVozReal = android.os.SystemClock.elapsedRealtime();
        retardoRearme = 0; // voz de verdad → micro ágil otra vez
        final String texto = l.get(0).trim();
        dicho.setText("Tú: " + texto);
        if (accionPendiente != null) { resolverConfirmacion(texto); return; }
        if (esDespedida(texto)) { di("Vale. Aquí estoy."); ui.postDelayed(new Runnable() { @Override public void run() { cierraYa(); } }, 1600); return; }
        estado.setText("  Pensando…");
        mandar(texto, null);
    }

    boolean esAfirmacion(String t) { t = t.toLowerCase(Locale.ROOT); return t.startsWith("si") || t.startsWith("sí") || t.startsWith("vale") || t.startsWith("dale") || t.startsWith("ok") || t.startsWith("hazlo") || t.startsWith("confirmo") || t.startsWith("adelante"); }
    boolean esNegacion(String t) { t = t.toLowerCase(Locale.ROOT); return t.startsWith("no") || t.startsWith("cancela") || t.startsWith("déjalo") || t.startsWith("dejalo") || t.startsWith("para"); }
    boolean esDespedida(String t) { t = t.toLowerCase(Locale.ROOT).trim(); return t.equals("adiós") || t.equals("adios") || t.equals("agur") || t.equals("nada más") || t.equals("nada mas") || t.equals("cierra") || t.equals("ya está") || t.equals("ya esta"); }

    void resolverConfirmacion(String texto) {
        final JSONObject acc = accionPendiente;
        accionPendiente = null;
        if (esAfirmacion(texto)) {
            estado.setText("  Haciéndolo…");
            try {
                JSONObject conf = new JSONObject();
                conf.put("herramienta", acc.optString("herramienta"));
                conf.put("argumentos", acc.optJSONObject("argumentos") == null ? new JSONObject() : acc.optJSONObject("argumentos"));
                conf.put("confirmado", true);
                mandar("(confirmación)", conf);
            } catch (Exception e) { di("No pude montar la confirmación."); }
        } else if (esNegacion(texto)) {
            meteHistorial("assistant", "Acción cancelada por el usuario.");
            di("Vale, no lo hago.");
        } else {
            accionPendiente = acc; // ni sí ni no → repregunto
            di("¿Lo hago? Di sí o no.");
        }
    }

    void mandar(final String texto, final JSONObject confirmarAccion) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                if (confirmarAccion == null) meteHistorial("user", texto);
                final JSONObject r = Datos.chat(VozActivity.this, texto, historial, confirmarAccion);
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        if (cerrando) return;
                        if (r == null) { di("No llego al cerebro de Azkarin. " + (Datos.ultimoErrorChat.isEmpty() ? "" : "Detalle: " + Datos.ultimoErrorChat)); return; }
                        String msg = r.optString("mensaje", "");
                        if ("confirmacion".equals(r.optString("tipo"))) {
                            accionPendiente = r.optJSONObject("accion");
                            String desc = accionPendiente != null ? accionPendiente.optString("descripcion", "") : "";
                            String hablar = (msg.isEmpty() ? "" : msg + ". ") + (desc.isEmpty() ? "" : desc + ". ") + "¿Lo hago? Di sí o no.";
                            meteHistorial("assistant", msg + (desc.isEmpty() ? "" : "\n" + desc));
                            di(hablar);
                            return;
                        }
                        if (msg.isEmpty()) msg = "Hecho.";
                        meteHistorial("assistant", msg);
                        di(msg);
                    }
                });
            }
        }).start();
    }

    void meteHistorial(String rol, String contenido) {
        try {
            JSONObject m = new JSONObject();
            m.put("role", rol);
            m.put("content", contenido);
            historial.put(m);
            while (historial.length() > 12) historial.remove(0);
        } catch (Exception e) { /* nada */ }
    }

    /** Enseña y LEE la respuesta (limpia markdown/enlaces para que la voz no lea garabatos). */
    void di(String texto) {
        // tras cada respuesta de Azkarin, cuenta de silencio a cero y micro ágil (modo coche)
        ultimaVozReal = android.os.SystemClock.elapsedRealtime();
        retardoRearme = 0;
        String limpio = String.valueOf(texto == null ? "" : texto)
                .replaceAll("\\*\\*|__|`|#+", "")
                .replaceAll("\\[([^\\]]*)\\]\\([^)]*\\)", "$1")
                .replaceAll("https?://\\S+", "el enlace")
                .replaceAll("\\s+", " ").trim();
        respuesta.setText("Azkarin: " + limpio);
        estado.setText("  Azkarin");
        String paraVoz = limpio.length() > 700 ? limpio.substring(0, 700) + ". Te he resumido, el resto en la app." : limpio;
        if (ttsListo && tts != null) {
            try {
                Bundle bp = new Bundle();
                tts.speak(paraVoz, TextToSpeech.QUEUE_FLUSH, bp, "azk");
                return;
            } catch (Exception e) { /* sin voz, al menos se lee */ }
        }
        ui.postDelayed(new Runnable() { @Override public void run() { escuchar(); } }, 1200);
    }

    void cierraYa() {
        cerrando = true;
        try { if (rec != null) { rec.destroy(); rec = null; } } catch (Exception e) { /* nada */ }
        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception e) { /* nada */ }
        finish();
    }

    @Override
    protected void onDestroy() {
        cerrando = true;
        try { if (rec != null) rec.destroy(); } catch (Exception e) { /* nada */ }
        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception e) { /* nada */ }
        super.onDestroy();
    }

    @Override
    protected void onPause() {
        super.onPause();
        cierraYa(); // si Asier se va a otra cosa, el micro se suelta y la tarjeta se quita
    }
}
