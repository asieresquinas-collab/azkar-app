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
import android.widget.Button;
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

    // v1.18: mientras hay un aviso de permiso en pantalla, la tarjeta NO se cierra. Android
    // manda onPause al abrir el aviso, y esta tarjeta se cierra en onPause: por eso el permiso
    // salia y desaparecia al instante, sin dar tiempo a darle a Permitir (fallo de la v1.17).
    boolean pidiendoPermiso = false;
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
    // v1.6: reproductor de grabaciones de llamada dentro de la propia conversación del widget
    LinearLayout filaLl;
    Button btnLl, btnVelLl;
    android.media.MediaPlayer mpLl = null;
    boolean sonandoLl = false;
    String cidLl = null;
    final float[] velsLl = { 1f, 1.5f, 2f };
    int velIdxLl = 0;
    // v1.11: botón(es) de NAVEGACIÓN (planificar_ruta) en la propia tarjeta
    LinearLayout filaNav;
    Button btnNavMaps, btnNavSygic;
    String navMapsUrl = "", navSygicUrl = "";
    // v1.13 (Asier): cuando Azkarin genera un ARCHIVO (PDF del borrador/informe, DOCX…) se
    // DESCARGA SOLO al móvil y aparece un botón para ABRIRLO. Sin pedir permisos ni salir del widget.
    LinearLayout filaArch;
    Button btnArch;
    android.net.Uri archUri = null;
    String archMime = "application/pdf";
    static String ultimoErrorArch = "";

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        // v1.3: en el coche la pantalla NO se apaga mientras la conversación está abierta
        // (si se apagara, Android pausa la tarjeta y se cortaría la charla).
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // v1.13: permitir abrir un archivo recién descargado con un Uri de fichero como plan B
        // (sin esto Android mata la app al compartir file:// en apps que apuntan a Android 7+).
        try { android.os.StrictMode.setVmPolicy(new android.os.StrictMode.VmPolicy.Builder().build()); } catch (Exception e) { /* nada */ }
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

        // v1.6: fila del reproductor de la grabación (oculta hasta que Azkarin manda una llamada)
        filaLl = new LinearLayout(this);
        filaLl.setOrientation(LinearLayout.HORIZONTAL);
        filaLl.setPadding(0, pad / 2, 0, 0);
        filaLl.setVisibility(View.GONE);
        btnLl = new Button(this);
        btnLl.setText("▶️ ESCUCHAR LA LLAMADA");
        btnLl.setBackgroundColor(Color.parseColor("#1a7a3f"));
        btnLl.setTextColor(Color.WHITE);
        filaLl.addView(btnLl, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        btnVelLl = new Button(this);
        btnVelLl.setText("1×");
        filaLl.addView(btnVelLl, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        card.addView(filaLl);
        btnLl.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { onPlayPauseLlamada(); } });
        btnVelLl.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                velIdxLl = (velIdxLl + 1) % velsLl.length;
                btnVelLl.setText((velsLl[velIdxLl] == 1f ? "1" : velsLl[velIdxLl] == 1.5f ? "1,5" : "2") + "×");
                aplicaVelLlamada();
            }
        });

        // v1.11: fila de botones de NAVEGACIÓN (oculta hasta que Azkarin manda una ruta)
        filaNav = new LinearLayout(this);
        filaNav.setOrientation(LinearLayout.VERTICAL);
        filaNav.setPadding(0, pad / 2, 0, 0);
        filaNav.setVisibility(View.GONE);
        btnNavMaps = new Button(this);
        btnNavMaps.setText("🗺️ IR CON GOOGLE MAPS");
        btnNavMaps.setBackgroundColor(Color.parseColor("#2376C5"));
        btnNavMaps.setTextColor(Color.WHITE);
        filaNav.addView(btnNavMaps, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        btnNavSygic = new Button(this);
        btnNavSygic.setText("🚚 IR CON SYGIC (CAMIÓN)");
        btnNavSygic.setBackgroundColor(Color.parseColor("#1a7a3f"));
        btnNavSygic.setTextColor(Color.WHITE);
        LinearLayout.LayoutParams lpNS = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpNS.topMargin = (int) (6 * getResources().getDisplayMetrics().density);
        filaNav.addView(btnNavSygic, lpNS);
        card.addView(filaNav);
        btnNavMaps.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { abrirUrlNav(navMapsUrl); } });
        btnNavSygic.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { abrirUrlNav(navSygicUrl); } });

        // v1.13: botón para ABRIR el archivo que Azkarin acaba de descargar (oculto hasta que haya uno)
        filaArch = new LinearLayout(this);
        filaArch.setOrientation(LinearLayout.VERTICAL);
        filaArch.setPadding(0, pad / 2, 0, 0);
        filaArch.setVisibility(View.GONE);
        btnArch = new Button(this);
        btnArch.setText("📄 ABRIR EL ARCHIVO");
        btnArch.setBackgroundColor(Color.parseColor("#E85C0D"));
        btnArch.setTextColor(Color.WHITE);
        filaArch.addView(btnArch, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        card.addView(filaArch);
        btnArch.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { abrirArchivo(); } });

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
            @Override public void onError(String id) { if ("azk_mid".equals(id)) return; ui.post(new Runnable() { @Override public void run() { escuchar(); } }); }
            @Override public void onDone(String id) { if ("azk_mid".equals(id)) return; ui.post(new Runnable() { @Override public void run() { escuchar(); } }); }
        });

        // v1.18 · UN AVISO CADA VEZ, Y NADIE ESCUCHA MIENTRAS HAY UN AVISO EN PANTALLA.
        // El fallo de la v1.17 (Asier: «no sale permiso de ubicacion para aceptar»): con el
        // micro YA concedido, se pedia la ubicacion y AL MISMO TIEMPO se empezaba a escuchar.
        // Como esta tarjeta se cierra sola con el silencio, se cerraba con el aviso encima y
        // el permiso desaparecia antes de poder darle a Permitir. Ahora: si falta la ubicacion,
        // se pide y NO se escucha; al contestar (onRequestPermissionsResult, codigo 8) sigue
        // el camino de siempre. La ubicacion NUNCA corta la conversacion: si dice que no, el
        // walkie-talkie va igual, solo que sin decir tiempos.
        if (Ubic.hayPermiso(this)) {
            Ubic.arranca(this);
            if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                pidiendoPermiso = true;
                requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 7);
            } else {
                escuchar();
            }
        } else {
            // v1.19: aquí NO se pide el permiso. Esta tarjeta es `noHistory` y con tema de
            // diálogo: Android la DESTRUYE en cuanto le sale una ventana encima, así que el
            // aviso del permiso moría al instante y la respuesta no llegaba nunca. El permiso
            // se pide en la pantalla principal de la app (MainActivity), que es normal y ahí
            // sí se puede contestar. Aquí solo se sigue hablando, sin tiempos.
            if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                pidiendoPermiso = true;
                requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 7);
            } else {
                escuchar();
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        pidiendoPermiso = false;   // v1.18: ya se contesto, la tarjeta vuelve a poder cerrarse
        if (code == 8) {   // v1.17: la ubicacion NUNCA corta la conversacion
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) Ubic.arranca(this);
            if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                pidiendoPermiso = true;
                requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 7);
            } else {
                escuchar();
            }
            return;
        }
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
            // v1.3/v1.10: aguanta pausas al hablar. Asier habla pausado → 4s de silencio antes de
            // dar la frase por terminada, para no cortarle cuando piensa (Android puede no respetarlo del todo).
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L);
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L);
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 4000L);
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
            // v1.8: si hay una grabación cargada, NUNCA cerramos por silencio (puede estar
            // escuchándola callado) — solo re-escuchamos por si dice "a dos", "pausa", etc.
            if (mpLl != null) { ui.postDelayed(new Runnable() { @Override public void run() { if (!cerrando) escuchar(); } }, 1600); return; }
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
        // v1.8: si hay una grabación en marcha, el micro solo hace caso a ÓRDENES DEL REPRODUCTOR
        // (velocidad/pausa/sigue/repite/cierra) — así la propia llamada no dispara nada.
        if (mpLl != null) {
            int cmd = comandoReproductor(texto);
            if (cmd == 1) { escuchar(); return; }                         // velocidad/pausa/sigue/repite hecho
            if (cmd == 2) { limpiaLlamada(); di("Vale, cerrado."); return; } // cerrar el reproductor
            if (sonandoLl) { escuchar(); return; }                        // suena y no es orden → ignora (eco)
            limpiaLlamada();                                              // parada + orden normal → sal del reproductor y sigue
        }
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
                        // v1.6: ¿Azkarin manda una GRABACIÓN de llamada? → reproductor en el widget
                        JSONObject datos = r.optJSONObject("datos");
                        if (datos != null && "reproducir_llamada".equals(datos.optString("accion")) && !datos.optString("call_id").isEmpty()) {
                            meteHistorial("assistant", msg.isEmpty() ? "Grabación de la llamada" : msg);
                            prepararLlamada(datos.optString("call_id"), msg);
                            return;
                        }
                        // v1.11: Azkarin manda una RUTA → botón(es) de navegación en la tarjeta
                        if (datos != null && "navegar".equals(datos.optString("accion"))) {
                            String _dstNav = datos.optString("destino", "el destino");
                            meteHistorial("assistant", msg.isEmpty() ? ("Ruta a " + _dstNav) : msg);
                            mostrarNavegacion(_dstNav, datos.optString("maps_url", ""), datos.optString("sygic_url", ""), msg);
                            return;
                        }
                        // v1.13: ¿Azkarin ha generado un ARCHIVO (PDF de borrador/informe, DOCX…)? → se
                        // DESCARGA SOLO al móvil. Va en 'datos' como pdf_base64 / docx_base64 / pdf_url.
                        if (datos != null) {
                            String _b64 = datos.optString("pdf_base64", "");
                            boolean _docx = false;
                            if (_b64.isEmpty()) { _b64 = datos.optString("docx_base64", ""); _docx = !_b64.isEmpty(); }
                            if (!_b64.isEmpty()) {
                                String _nom = _nombreArchivo(datos, _docx ? "docx" : "pdf");
                                meteHistorial("assistant", msg.isEmpty() ? ("Archivo generado: " + _nom) : msg);
                                guardarArchivoBase64(_b64, _nom,
                                        _docx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
                                        msg);
                                return;
                            }
                            String _url = datos.optString("pdf_url", "");
                            if (_url.isEmpty()) _url = datos.optString("archivo_url", "");
                            if (!_url.isEmpty()) {
                                String _nom = _nombreArchivo(datos, _extDeUrl(_url));
                                meteHistorial("assistant", msg.isEmpty() ? ("Archivo: " + _nom) : msg);
                                descargarArchivo(_url, _nom, msg);
                                return;
                            }
                        }
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

    // ── v1.6/1.8: GRABACIÓN DE LLAMADA en la conversación del widget — se pone SOLA (autoplay)
    //   y se controla POR VOZ ("a 1,5", "a dos", "más rápido", "pausa", "sigue", "repite", "cierra").
    void prepararLlamada(String cid, String msg) {
        limpiaLlamada();
        if (filaNav != null) filaNav.setVisibility(View.GONE);
        cidLl = cid; velIdxLl = 0;
        try { if (tts != null) tts.stop(); } catch (Exception e) { /* nada */ }
        respuesta.setText("Azkarin: " + (msg == null || msg.isEmpty() ? "Aquí tienes la grabación." : msg.replaceAll("\\s+", " ").trim()));
        estado.setText("  Bajando el audio…");
        btnLl.setText("⏸️ PAUSA"); btnLl.setEnabled(true);
        btnVelLl.setText("1×");
        filaLl.setVisibility(View.VISIBLE);
        descargaYReproduce(); // AUTOPLAY: se pone sola, sin tocar el play
    }

    // El botón: si ya está cargada, play/pausa a mano; si no, la baja y la pone.
    void onPlayPauseLlamada() {
        if (mpLl != null) { if (sonandoLl) pausaLl(); else reanudaLl(); return; }
        if (cidLl != null) descargaYReproduce();
    }

    void descargaYReproduce() {
        if (cidLl == null) return;
        estado.setText("  Bajando el audio…");
        btnLl.setEnabled(false);
        final String cid = cidLl;
        new Thread(new Runnable() {
            @Override
            public void run() {
                final java.io.File f = Datos.descargarGrabacion(VozActivity.this, cid);
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        if (cerrando) return;
                        btnLl.setEnabled(true);
                        if (f == null) {
                            estado.setText("  No pude bajar la grabación");
                            respuesta.setText("Azkarin: No pude bajar el audio" + (Datos.ultimoErrorChat.isEmpty() ? " — reinténtalo." : " (" + Datos.ultimoErrorChat + ")."));
                            if (!cerrando) escuchar();
                            return;
                        }
                        try {
                            mpLl = new android.media.MediaPlayer();
                            mpLl.setAudioStreamType(android.media.AudioManager.STREAM_MUSIC);
                            mpLl.setDataSource(f.getAbsolutePath());
                            mpLl.setOnPreparedListener(new android.media.MediaPlayer.OnPreparedListener() {
                                @Override public void onPrepared(android.media.MediaPlayer mp) {
                                    aplicaVelLlamada(); mp.start(); sonandoLl = true;
                                    btnLl.setText("⏸️ PAUSA"); estado.setText("  ▶️ Sonando — di 'a 1,5', 'a dos', 'pausa'…");
                                    if (!cerrando) escuchar(); // micro a la escucha de órdenes del reproductor
                                }
                            });
                            mpLl.setOnCompletionListener(new android.media.MediaPlayer.OnCompletionListener() {
                                @Override public void onCompletion(android.media.MediaPlayer mp) {
                                    sonandoLl = false;
                                    try { mp.seekTo(0); } catch (Exception e) { /* nada */ }
                                    btnLl.setText("🔁 REPETIR"); estado.setText("  🎧 Fin — di 'repite' o dime otra cosa");
                                    if (!cerrando) escuchar();
                                }
                            });
                            mpLl.setOnErrorListener(new android.media.MediaPlayer.OnErrorListener() {
                                @Override public boolean onError(android.media.MediaPlayer mp, int w, int e) { estado.setText("  Fallo al reproducir el audio"); return true; }
                            });
                            estado.setText("  Preparando el audio…");
                            mpLl.prepareAsync();
                        } catch (Exception e) { estado.setText("  No pude reproducir: " + e.getMessage()); if (!cerrando) escuchar(); }
                    }
                });
            }
        }).start();
    }

    void pausaLl() { try { if (mpLl != null && mpLl.isPlaying()) mpLl.pause(); } catch (Exception e) {} sonandoLl = false; btnLl.setText("▶️ SEGUIR"); estado.setText("  ⏸️ En pausa"); }
    void reanudaLl() { try { if (mpLl != null) { aplicaVelLlamada(); mpLl.start(); sonandoLl = true; } } catch (Exception e) {} btnLl.setText("⏸️ PAUSA"); estado.setText("  ▶️ Sonando"); }
    void repiteLl() { try { if (mpLl != null) { mpLl.seekTo(0); aplicaVelLlamada(); mpLl.start(); sonandoLl = true; } } catch (Exception e) {} btnLl.setText("⏸️ PAUSA"); estado.setText("  🔁 Desde el principio"); }

    void aplicaVelLlamada() {
        try { if (mpLl != null) mpLl.setPlaybackParams(mpLl.getPlaybackParams().setSpeed(velsLl[velIdxLl])); } catch (Exception e) { /* API vieja: sin cambio de velocidad */ }
    }
    void ponVel(float v) {
        int idx = 0; for (int i = 0; i < velsLl.length; i++) if (Math.abs(velsLl[i] - v) < 0.05f) idx = i;
        velIdxLl = idx;
        btnVelLl.setText((v == 1f ? "1" : v == 1.5f ? "1,5" : "2") + "×");
        if (mpLl != null && sonandoLl) aplicaVelLlamada();
        estado.setText("  ▶️ a " + (v == 1f ? "1" : v == 1.5f ? "1,5" : "2") + "×");
    }

    // Interpreta una orden del reproductor. Devuelve 1 (hecha), 2 (cerrar) o 0 (no es orden).
    int comandoReproductor(String texto) {
        String t = _sinAcentos(String.valueOf(texto).toLowerCase(Locale.ROOT)).trim();
        if (t.split("\\s+").length > 5) return 0; // frases largas = seguramente la propia grabación (eco)
        if (t.matches(".*\\b(cierra|cierralo|quita|quitalo|cerrar|ya vale|ya esta|ya esta bien|corta)\\b.*")) return 2;
        if (t.matches(".*\\b(pausa|pausalo|para|paralo|stop|quieto|espera)\\b.*")) { pausaLl(); return 1; }
        if (t.matches(".*\\b(sigue|continua|reanuda|dale|play|ponla|arranca)\\b.*")) { reanudaLl(); return 1; }
        if (t.matches(".*\\b(repite|repitela|repitelo|otra vez|desde el principio|empieza|vuelve a empezar)\\b.*")) { repiteLl(); return 1; }
        if (t.matches(".*\\b(mas rapido|acelera|rapido|deprisa)\\b.*")) { velIdxLl = Math.min(velIdxLl + 1, velsLl.length - 1); ponVel(velsLl[velIdxLl]); return 1; }
        if (t.matches(".*\\b(mas lento|despacio|lento|ralentiza)\\b.*")) { velIdxLl = Math.max(velIdxLl - 1, 0); ponVel(velsLl[velIdxLl]); return 1; }
        Float v = _velDeTexto(t);
        if (v != null) { ponVel(v); return 1; }
        if (t.matches(".*\\b(velocidad normal|normal)\\b.*")) { ponVel(1f); return 1; }
        return 0;
    }
    // Saca la velocidad (1 / 1,5 / 2) de frases tipo "a dos", "ponlo a 1,5", "a uno con cinco", "por dos".
    Float _velDeTexto(String t) {
        if (t.matches(".*\\b(dos|x ?2|por dos|doble|al doble)\\b.*")) return 2f;
        if (t.matches(".*\\b(uno (con |coma )?cinco|1[.,]5|una y media|uno y medio)\\b.*")) return 1.5f;
        if (t.matches(".*\\b(a|de|por|ponlo a|ponmelo a|velocidad)\\s+(uno|1)\\b.*")) return 1f;
        return null;
    }
    String _sinAcentos(String s) {
        try { return java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", ""); }
        catch (Exception e) { return s; }
    }

    void limpiaLlamada() {
        try { if (mpLl != null) { mpLl.release(); mpLl = null; } } catch (Exception e) { /* nada */ }
        sonandoLl = false; cidLl = null;
        if (filaLl != null) filaLl.setVisibility(View.GONE);
    }

    /** Enseña y LEE la respuesta (limpia markdown/enlaces para que la voz no lea garabatos). */
    void di(String texto) { di(texto, null); }

    /** v1.13: igual que di(), pero puede leer por voz un texto DISTINTO del que se ve (vozAlt).
     *  Sirve para archivos: en pantalla se ve el nombre del fichero, pero la voz dice algo natural. */
    void di(String texto, String vozAlt) {
        limpiaLlamada(); // una respuesta de texto cierra el reproductor de la llamada anterior
        if (filaNav != null) filaNav.setVisibility(View.GONE); // y quita el botón de ruta anterior
        if (filaArch != null) filaArch.setVisibility(View.GONE); // y el botón de archivo anterior
        // tras cada respuesta de Azkarin, cuenta de silencio a cero y micro ágil (modo coche)
        ultimaVozReal = android.os.SystemClock.elapsedRealtime();
        retardoRearme = 0;
        String base = String.valueOf(texto == null ? "" : texto);
        // v1.9: para MOSTRAR conservamos los ENLACES (para poder TOCARLOS); solo quitamos el markdown feo.
        String paraVer = base
                .replaceAll("\\*\\*|__|`|#+", "")
                .replaceAll("\\[([^\\]]*)\\]\\((https?://[^)]*)\\)", "$1: $2") // [texto](http…) -> texto: http… (tocable)
                .replaceAll("\\[([^\\]]*)\\]\\([^)]*\\)", "$1")                // enlaces raros (sygic…) -> solo el texto
                .replaceAll("[ \\t]+", " ")
                .replaceAll(" *\\n *", "\n")
                .replaceAll("\\n{3,}", "\n\n").trim();
        respuesta.setText("Azkarin: " + paraVer);
        try { // v1.9: hace TOCABLES los enlaces (Google Maps, PDF del presupuesto, Drive…)
            android.text.util.Linkify.addLinks(respuesta, android.text.util.Linkify.WEB_URLS);
            respuesta.setMovementMethod(android.text.method.LinkMovementMethod.getInstance());
            respuesta.setLinkTextColor(Color.parseColor("#1B4F8A"));
        } catch (Exception e) { /* si falla el Linkify, al menos se ve el texto con la URL */ }
        estado.setText("  Azkarin");
        // v1.12: la voz lee la respuesta ENTERA (en trozos con _trozosVoz, sin cortar ni mandar "a la app"),
        // pero SIN leer los enlaces — los cambia por "el enlace"; en pantalla sí se ven y se tocan.
        // v1.13: si hay vozAlt, la voz lee ESO (limpio de enlaces) en vez del texto de pantalla.
        String paraVoz = String.valueOf(vozAlt != null ? vozAlt : paraVer)
                .replaceAll("\\*\\*|__|`|#+", "")
                .replaceAll("https?://\\S+", "el enlace").replaceAll("\\s+", " ").trim();
        if (ttsListo && tts != null) {
            try {
                Bundle bp = new Bundle();
                java.util.ArrayList<String> _tr = _trozosVoz(paraVoz);
                for (int _i = 0; _i < _tr.size(); _i++) {
                    tts.speak(_tr.get(_i), _i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, bp, _i == _tr.size() - 1 ? "azk" : "azk_mid");
                }
                return;
            } catch (Exception e) { /* sin voz, al menos se lee */ }
        }
        ui.postDelayed(new Runnable() { @Override public void run() { escuchar(); } }, 1200);
    }

    // v1.9 (Asier): parte la respuesta en trozos que quepan en el motor de voz (~4000 car.)
    // para leerla ENTERA y seguida, sin cortar a la mitad ni mandar a la app.
    java.util.ArrayList<String> _trozosVoz(String t) {
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        String resto = String.valueOf(t == null ? "" : t).trim();
        int maxLen = 3500;
        try { maxLen = Math.min(maxLen, TextToSpeech.getMaxSpeechInputLength() - 50); } catch (Exception e) { /* API vieja */ }
        if (maxLen < 200) maxLen = 200;
        while (resto.length() > maxLen) {
            int corte = resto.lastIndexOf(". ", maxLen);
            if (corte < maxLen / 2) corte = resto.lastIndexOf(' ', maxLen);
            if (corte <= 0) corte = maxLen - 1;
            out.add(resto.substring(0, corte + 1).trim());
            resto = resto.substring(corte + 1).trim();
        }
        if (!resto.isEmpty()) out.add(resto);
        if (out.isEmpty()) out.add("");
        return out;
    }

    // v1.11: enseña el/los botón(es) de navegación y deja el micro escuchando por si sigues hablando
    void mostrarNavegacion(String destino, String mapsUrl, String sygicUrl, String msg) {
        limpiaLlamada();
        navMapsUrl = (mapsUrl == null ? "" : mapsUrl.trim());
        navSygicUrl = (sygicUrl == null ? "" : sygicUrl.trim());
        String limpio = String.valueOf(msg == null ? "" : msg)
                .replaceAll("\\*\\*|__|`|#+", "")
                .replaceAll("\\[([^\\]]*)\\]\\([^)]*\\)", "$1")
                .replaceAll("https?://\\S+", "")
                .replaceAll("\\s+", " ").trim();
        if (limpio.isEmpty()) limpio = "Aquí tienes la ruta a " + destino + ". Toca el botón para ir.";
        respuesta.setText("Azkarin: " + limpio);
        estado.setText("  🧭 Ruta a " + destino);
        btnNavMaps.setVisibility(navMapsUrl.isEmpty() ? View.GONE : View.VISIBLE);
        btnNavSygic.setVisibility(navSygicUrl.isEmpty() ? View.GONE : View.VISIBLE);
        filaNav.setVisibility((navMapsUrl.isEmpty() && navSygicUrl.isEmpty()) ? View.GONE : View.VISIBLE);
        if (ttsListo && tts != null) {
            try { Bundle bp = new Bundle(); tts.speak(limpio, TextToSpeech.QUEUE_FLUSH, bp, "azk"); return; } catch (Exception e) { /* sin voz */ }
        }
        ui.postDelayed(new Runnable() { @Override public void run() { escuchar(); } }, 1200);
    }

    void abrirUrlNav(String url) {
        if (url == null || url.trim().isEmpty()) return;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url.trim()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            estado.setText("  No pude abrir el mapa (¿tienes la app?)");
        }
    }

    // ─────────────── v1.13: ARCHIVOS (PDF/DOCX) que se descargan solos ───────────────

    /** Descarga automática de un archivo por URL (borradores de permiso/policía → /api/pdf/borrador/…).
     *  Va a la carpeta propia de la app (sin pedir permisos) y saca aviso tocable de "descarga lista". */
    void descargarArchivo(String url, String nombre, String msg) {
        try {
            android.app.DownloadManager dm = (android.app.DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            android.app.DownloadManager.Request req = new android.app.DownloadManager.Request(android.net.Uri.parse(url));
            req.setTitle(nombre);
            req.setDescription("Azkar Mudanzas");
            req.setMimeType("pdf".equalsIgnoreCase(_extDeUrl(url)) ? "application/pdf" : "*/*");
            req.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setAllowedOverMetered(true);
            req.setAllowedOverRoaming(true);
            // si es NUESTRO servidor, mete la misma llave + pase del login (inofensivo en rutas públicas)
            if (url.startsWith(Datos.BASE)) {
                req.addRequestHeader("x-api-key", Datos.API_KEY);
                String jwt = Datos.prefs(this).getString("jwt", "");
                if (!jwt.isEmpty()) req.addRequestHeader("Authorization", "Bearer " + jwt);
            }
            req.setDestinationInExternalFilesDir(this, android.os.Environment.DIRECTORY_DOWNLOADS, nombre);
            dm.enqueue(req);
            String vis = (msg == null || msg.trim().isEmpty() ? "" : msg + "\n\n") + "📥 Descargando «" + nombre + "». En cuanto acabe, te sale el aviso arriba para abrirlo.";
            String voz = (msg == null || msg.trim().isEmpty() ? "" : msg + ". ") + "Te lo estoy descargando al móvil, en cuanto acabe te aviso.";
            di(vis, voz);
            mostrarBotonArchivo(android.net.Uri.parse(url), "application/pdf");
        } catch (Exception e) {
            estado.setText("  Abriendo el archivo…");
            abrirUrlNav(url); // plan B: el navegador también lo descarga/enseña
        }
    }

    /** Guarda en el móvil un archivo que viene EMBEBIDO en base64 (informes PDF, DOCX oficiales) y
     *  saca el botón para abrirlo. Trabaja en segundo plano para no congelar la tarjeta. */
    void guardarArchivoBase64(final String b64, final String nombre, final String mime, final String msg) {
        estado.setText("  📥 Guardando " + nombre + "…");
        new Thread(new Runnable() { @Override public void run() {
            final android.net.Uri uri = _escribeBase64Archivo(b64, nombre, mime);
            ui.post(new Runnable() { @Override public void run() {
                if (cerrando) return;
                if (uri != null) {
                    String vis = (msg == null || msg.trim().isEmpty() ? "" : msg + "\n\n") + "✅ Guardado en el móvil: «" + nombre + "». Toca ABRIR EL ARCHIVO para verlo.";
                    String voz = (msg == null || msg.trim().isEmpty() ? "" : msg + ". ") + "Listo, ya lo tienes guardado en el móvil. Toca abrir para verlo.";
                    di(vis, voz);
                    mostrarBotonArchivo(uri, mime);
                } else {
                    di("He generado el archivo pero no he podido guardarlo en el móvil (" + ultimoErrorArch + "). Vuelve a pedírmelo, por favor.");
                }
            }});
        }}).start();
    }

    /** Decodifica el base64 a un fichero de la app y lo REGISTRA en Descargas (aviso + poder abrirlo).
     *  Devuelve un Uri que se puede abrir, o null (detalle en ultimoErrorArch). Compila con API 25. */
    android.net.Uri _escribeBase64Archivo(String b64, String nombre, String mime) {
        try {
            byte[] bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
            if (bytes == null || bytes.length == 0) { ultimoErrorArch = "el archivo venía vacío"; return null; }
            java.io.File dir = getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) dir = getCacheDir();
            if (!dir.exists()) dir.mkdirs();
            java.io.File f = new java.io.File(dir, nombre);
            java.io.FileOutputStream out = new java.io.FileOutputStream(f);
            out.write(bytes); out.flush(); out.close();
            // registrarlo en el gestor de Descargas → aviso tocable + Uri que abre cualquier visor
            try {
                android.app.DownloadManager dm = (android.app.DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                long id = dm.addCompletedDownload(nombre, "Azkar Mudanzas", true, mime, f.getAbsolutePath(), f.length(), true);
                android.net.Uri u = dm.getUriForDownloadedFile(id);
                if (u != null) { ultimoErrorArch = ""; return u; }
            } catch (Exception e2) { /* Android muy nuevo puede no dejar registrarlo: seguimos con el fichero */ }
            ultimoErrorArch = "";
            return android.net.Uri.fromFile(f); // plan B (funciona porque relajamos StrictMode en onCreate)
        } catch (Exception e) {
            ultimoErrorArch = "[" + e.getClass().getSimpleName() + "] " + (e.getMessage() == null ? "" : e.getMessage());
            return null;
        }
    }

    void mostrarBotonArchivo(android.net.Uri uri, String mime) {
        archUri = uri;
        archMime = (mime == null || mime.isEmpty()) ? "application/pdf" : mime;
        if (filaArch == null || btnArch == null) return;
        boolean hay = (uri != null);
        btnArch.setVisibility(hay ? View.VISIBLE : View.GONE);
        filaArch.setVisibility(hay ? View.VISIBLE : View.GONE);
    }

    void abrirArchivo() {
        if (archUri == null) return;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            String esq = archUri.getScheme();
            if ("http".equals(esq) || "https".equals(esq)) i.setData(archUri);
            else i.setDataAndType(archUri, archMime);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            estado.setText("  No encuentro app para abrir ese archivo");
        }
    }

    /** Elige un nombre de fichero decente con los campos que manda el backend. */
    String _nombreArchivo(JSONObject datos, String ext) {
        String n = "";
        String[] claves = { "pdf_filename", "pdf_nombre", "docx_filename", "filename", "nombre_archivo", "nombre" };
        for (String k : claves) { n = datos.optString(k, ""); if (!n.isEmpty()) break; }
        if (n.isEmpty()) n = "azkar_" + System.currentTimeMillis();
        n = n.replaceAll("[\\\\/:*?\"<>|\\s]+", "_").replaceAll("_+", "_");
        if (ext != null && !ext.isEmpty() && !n.toLowerCase().endsWith("." + ext.toLowerCase())) n = n + "." + ext;
        return n;
    }

    String _extDeUrl(String url) {
        try {
            String p = android.net.Uri.parse(url).getLastPathSegment();
            if (p != null && p.contains(".")) {
                String e = p.substring(p.lastIndexOf('.') + 1);
                if (e.length() >= 2 && e.length() <= 5 && e.matches("[A-Za-z0-9]+")) return e.toLowerCase();
            }
        } catch (Exception e) { /* nada */ }
        return "pdf"; // los enlaces que manda Azkarin son PDF salvo que digan otra cosa
    }

    void cierraYa() {
        cerrando = true;
        try { if (mpLl != null) { mpLl.release(); mpLl = null; } } catch (Exception e) { /* nada */ }
        try { if (rec != null) { rec.destroy(); rec = null; } } catch (Exception e) { /* nada */ }
        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception e) { /* nada */ }
        finish();
    }

    @Override
    protected void onDestroy() {
        cerrando = true;
        try { if (rec != null) rec.destroy(); } catch (Exception e) { /* nada */ }
        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception e) { /* nada */ }
        Ubic.para(this);   // v1.17: se suelta el GPS al cerrar la tarjeta — aquí NO se sigue a nadie
        super.onDestroy();
    }

    @Override
    protected void onPause() {
        super.onPause();
        // v1.18: si lo que hay delante es un aviso de PERMISO, no se cierra nada: hay que
        // dejar que Asier conteste. Si no, el permiso se cierra solo y no sale nunca.
        if (pidiendoPermiso) return;
        cierraYa(); // si Asier se va a otra cosa, el micro se suelta y la tarjeta se quita
    }
}
