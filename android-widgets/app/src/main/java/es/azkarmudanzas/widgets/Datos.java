package es.azkarmudanzas.widgets;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Conexión con el backend de Azkar (Railway). SOLO LECTURA del resumen.
 * Auth: la MISMA que la app de siempre — el login de Asier (JWT 30 días) + api key.
 * Usuario y contraseña se guardan SOLO en este móvil (SharedPreferences privadas).
 */
public class Datos {

    static final String BASE = "https://azkar-presupuestos-production.up.railway.app";
    static final String API_KEY = "azk_08103a9ae1a401abed02dd73db68ab89d28d421d3dbc3c710f29e456b4bec5cc";
    static final String URL_APP_VOZ = "https://asieresquinas-collab.github.io/azkar-app/?azkarin=voz";
    /** v1.14: abrir la app DIRECTA en la pestaña Repaso (la app lo entiende desde la v382). */
    static final String URL_APP_REPASO = "https://asieresquinas-collab.github.io/azkar-app/?ir=repaso";

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("azkar_widgets", Context.MODE_PRIVATE);
    }

    static String leerTodo(InputStream in) throws Exception {
        if (in == null) return "";
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String l;
        while ((l = r.readLine()) != null) sb.append(l);
        r.close();
        return sb.toString();
    }

    static HttpURLConnection conecta(String url, String metodo, String jwt) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(metodo);
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestProperty("x-api-key", API_KEY);
        c.setRequestProperty("Content-Type", "application/json");
        if (jwt != null && !jwt.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + jwt);
        return c;
    }

    /** v1.1: prueba de conexión SIN clave — separa "no llego al servidor" de "clave mal". */
    static String probarConexion() {
        try {
            HttpURLConnection c = conecta(BASE + "/api/health", "GET", null);
            int code = c.getResponseCode();
            String resp = leerTodo(code < 400 ? c.getInputStream() : c.getErrorStream());
            if (code == 200) {
                try { return "✅ Llego al servidor de Azkar (versión " + new JSONObject(resp).optString("version", "?") + ")"; } catch (Exception e) { return "✅ Llego al servidor de Azkar"; }
            }
            return "⚠️ El servidor responde raro: HTTP " + code;
        } catch (Exception e) {
            return "🚫 NO llego al servidor: " + e.getClass().getSimpleName() + (e.getMessage() != null ? " — " + e.getMessage() : "");
        }
    }

    /** Entra con usuario+contraseña y guarda el token (30 días). Devuelve null si OK, o el error. */
    static String login(Context ctx, String usuario, String pass) {
        try {
            HttpURLConnection c = conecta(BASE + "/api/usuarios/login", "POST", null);
            c.setDoOutput(true);
            JSONObject body = new JSONObject();
            body.put("usuario", usuario);
            body.put("password", pass);
            OutputStream os = c.getOutputStream();
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            os.close();
            int code = c.getResponseCode();
            String resp = leerTodo(code < 400 ? c.getInputStream() : c.getErrorStream());
            if (code >= 400) {
                String detalle;
                try { detalle = new JSONObject(resp).optString("error", ""); } catch (Exception e) { detalle = ""; }
                if (detalle.isEmpty()) detalle = String.valueOf(resp).length() > 0 ? String.valueOf(resp).substring(0, Math.min(160, resp.length())) : "(sin detalle)";
                return "HTTP " + code + ": " + detalle;
            }
            JSONObject j = new JSONObject(resp);
            String token = j.optString("token", "");
            if (token.isEmpty()) return "El servidor respondió (HTTP " + code + ") pero sin pase de entrada. Respuesta: " + String.valueOf(resp).substring(0, Math.min(160, resp.length()));
            prefs(ctx).edit()
                    .putString("usuario", usuario)
                    .putString("pass", pass)
                    .putString("jwt", token)
                    .apply();
            return null;
        } catch (Exception e) {
            return "Fallo de conexión [" + e.getClass().getSimpleName() + "]" + (e.getMessage() != null ? ": " + e.getMessage() : "") + " — dale a 🩺 PROBAR CONEXIÓN para ver si llego al servidor";
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  v1.22 · LAS ALARMAS QUE PONE AZKARIN SOLO
    //  Asier: «cuando en una llamada se dice que hay que hacer algo a tal hora, que
    //  la pongas en ese momento… y que avise, para que no se me pase nada».
    //  El servidor no puede meter una alarma en el móvil por su cuenta, así que es
    //  el móvil el que pregunta: cada vez que se asoma (la burbuja, la app o un
    //  widget refrescando) recoge lo que haya y lo mete en el reloj.
    // ══════════════════════════════════════════════════════════════════════════
    static String ultimoErrorAlarmas = "";
    /** v1.38 · lo que sabe hacer esta app con las alarmas (el servidor lo mira): la lista con sus días y sin repetirlas. */
    static final int VERSION_ALARMAS = 38;

    /** v1.38 · ¿esta alarma (por su número) ya la ha metido esta app en el reloj? Así ninguna entra dos veces,
     *  venga por la pantalla de Azkarin, por la burbuja o por el recadero. */
    static synchronized boolean yaPuesta(Context ctx, String id) {
        if (ctx == null || id == null || id.length() == 0) return false;
        return prefs(ctx).getString("alarmas_puestas", "|").contains("|" + id + "|");
    }
    static synchronized void apuntarPuesta(Context ctx, String id) {
        if (ctx == null || id == null || id.length() == 0) return;
        String s = prefs(ctx).getString("alarmas_puestas", "|");
        if (s.contains("|" + id + "|")) return;
        s = s + id + "|";
        if (s.length() > 6000) { int k = s.indexOf('|', s.length() - 4000); s = k > 0 ? s.substring(k) : "|"; }
        prefs(ctx).edit().putString("alarmas_puestas", s).apply();
    }
    /** v1.38 · una sola recogida a la vez (los tres widgets, la app, la burbuja y la pantalla de Azkarin podían
     *  ir a por la misma lista a la vez y meter la misma alarma dos veces). */
    private static final java.util.concurrent.atomic.AtomicBoolean recogiendo = new java.util.concurrent.atomic.AtomicBoolean(false);
    static volatile long ultimaRecogida = 0;
    static boolean empezarRecogida() { return recogiendo.compareAndSet(false, true); }
    static void acabarRecogida() { recogiendo.set(false); }

    /** v1.38 · le dice al servidor, sin esperar, que esa alarma ya ha entrado (en su propio hilo). */
    static void avisarPuesta(final Context ctx, final String id) {
        if (ctx == null || id == null || id.length() == 0) return;
        final Context app = ctx.getApplicationContext();
        new Thread(new Runnable() { public void run() {
            try { JSONArray ids = new JSONArray(); ids.put(id); alarmasPuestas(app, ids); } catch (Exception e) { }
        } }).start();
    }

    /** Trae las alarmas que el móvil tiene que poner ahora (null si no se puede). */
    static JSONArray alarmasPendientes(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String jwt = p.getString("jwt", "");
        if (jwt.isEmpty()) return null;
        JSONArray r = pedirAlarmas(jwt);
        if (r != null) return r;
        String u = p.getString("usuario", ""), pw = p.getString("pass", "");
        if (u.isEmpty() || pw.isEmpty()) return null;
        if (login(ctx, u, pw) == null) return pedirAlarmas(p.getString("jwt", ""));
        return null;
    }

    private static JSONArray pedirAlarmas(String jwt) {
        try {
            // v1.38 · con la versión: desde la 1.38 el servidor da también las alarmas que pide Asier (con sus días)
            HttpURLConnection c = conecta(BASE + "/api/widget/alarmas?v=" + VERSION_ALARMAS + "&max=20", "GET", jwt);
            int code = c.getResponseCode();
            if (code != 200) { ultimoErrorAlarmas = "HTTP " + code; return null; }
            JSONObject j = new JSONObject(leerTodo(c.getInputStream()));
            ultimoErrorAlarmas = "";
            return j.optJSONArray("alarmas");
        } catch (Exception e) {
            ultimoErrorAlarmas = String.valueOf(e.getMessage());
            return null;
        }
    }

    /** Le dice al servidor cuáles han entrado DE VERDAD en el reloj. */
    static void alarmasPuestas(Context ctx, JSONArray ids) {
        if (ids == null || ids.length() == 0) return;
        try {
            String jwt = prefs(ctx).getString("jwt", "");
            if (jwt.isEmpty()) return;
            HttpURLConnection c = conecta(BASE + "/api/widget/alarmas/puestas", "POST", jwt);
            JSONObject cuerpo = new JSONObject();
            cuerpo.put("ids", ids);
            c.setDoOutput(true);
            c.getOutputStream().write(cuerpo.toString().getBytes("UTF-8"));
            c.getResponseCode();
        } catch (Exception e) { /* si falla, se reintenta en el siguiente vistazo */ }
    }

    /**
     * EL RECADERO: mira si hay alarmas que poner y las pone. Va en su propio hilo,
     * así que se puede llamar desde donde sea (widget, burbuja, pantalla) sin miedo.
     */
    static void recogerAlarmas(final Context ctx) {
        if (ctx == null) return;
        final Context app = ctx.getApplicationContext();
        // v1.38 · desde un widget que se refresca solo (sin ninguna pantalla de esta app delante) Android no deja
        //  abrir el reloj: la alarma no entraría aunque pareciera que sí. Las que ha pedido Asier se dejan para cuando
        //  haya una pantalla delante (abrir la app, la burbuja o la tarjeta de Azkarin), y así nunca se pierden.
        final boolean conPantalla = ctx instanceof android.app.Activity;
        ultimaRecogida = System.currentTimeMillis();
        new Thread(new Runnable() {
            @Override
            public void run() {
                if (!empezarRecogida()) return;   // ya hay otra recogida en marcha: esa las mete
                try {
                    JSONArray lista = alarmasPendientes(app);
                    if (lista == null || lista.length() == 0) return;
                    JSONArray puestas = new JSONArray();
                    int metidas = 0;
                    for (int i = 0; i < lista.length() && i < 20; i++) {
                        JSONObject a = lista.optJSONObject(i);
                        if (a == null) continue;
                        String id = a.optString("id", "");
                        // v1.38 · la que ya entró (por la pantalla de Azkarin o por la burbuja) no se vuelve a poner
                        if (yaPuesta(app, id)) { puestas.put(id); continue; }
                        if (!conPantalla && (a.optBoolean("pedida", false) || id.startsWith("alp_"))) continue;   // espera a una pantalla
                        if (metidas > 0) { try { Thread.sleep(700); } catch (InterruptedException ie) { } }   // un respiro al reloj entre una y otra
                        String hecho = AlarmaActivity.aplicar(app, "poner",
                                a.optInt("hora", -1), a.optInt("minutos", 0), a.optString("texto", "Azkar"),
                                AlarmaActivity.diasDeJson(a.optJSONArray("dias")));
                        metidas++;
                        // Solo se da por puesta si el reloj la ha cogido de verdad.
                        if (hecho != null && hecho.startsWith("⏰")) { puestas.put(id); apuntarPuesta(app, id); }
                    }
                    alarmasPuestas(app, puestas);
                } catch (Exception e) { /* nunca puede tumbar al widget */ }
                finally { acabarRecogida(); }
            }
        }).start();
    }

    /** Trae el resumen del widget. Si el pase caducó, re-entra solo con lo guardado. */
    static JSONObject resumen(Context ctx) { return resumen(ctx, 7); }

    /** v1.15: `filas` = las rayas que caben DE VERDAD en el widget tal y como está puesto.
     *  Con eso el servidor rellena el hueco de abajo con cosas del repaso (y sus botones)
     *  en vez de dejar medio widget en blanco, que es lo que le pasaba a Asier. */
    static JSONObject resumen(Context ctx, int filas) {
        SharedPreferences p = prefs(ctx);
        String jwt = p.getString("jwt", "");
        if (jwt.isEmpty()) return null;
        JSONObject r = pedirResumen(jwt, filas);
        if (r != null) return r;
        // puede haber caducado el pase (30 días) → re-login con lo guardado y reintento
        String u = p.getString("usuario", ""), pw = p.getString("pass", "");
        if (u.isEmpty() || pw.isEmpty()) return null;
        if (login(ctx, u, pw) == null) {
            return pedirResumen(p.getString("jwt", ""), filas);
        }
        return null;
    }

    static String ultimoErrorResumen = "";

    private static JSONObject pedirResumen(String jwt, int filas) {
        try {
            // lineas=N = las rayas que caben ahora mismo. El tope del servidor es 3..20;
            // aquí se recorta igual por si acaso.
            int f = filas < 3 ? 3 : (filas > 20 ? 20 : filas);
            HttpURLConnection c = conecta(BASE + "/api/widget/resumen?lineas=" + f, "GET", jwt);
            int code = c.getResponseCode();
            if (code != 200) {
                String resp = leerTodo(c.getErrorStream());
                ultimoErrorResumen = "HTTP " + code + (resp.isEmpty() ? "" : ": " + resp.substring(0, Math.min(160, resp.length())));
                return null;
            }
            JSONObject j = new JSONObject(leerTodo(c.getInputStream()));
            if (!j.optBoolean("ok", false)) { ultimoErrorResumen = "Respuesta sin ok"; return null; }
            ultimoErrorResumen = "";
            return j;
        } catch (Exception e) {
            ultimoErrorResumen = "[" + e.getClass().getSimpleName() + "]" + (e.getMessage() != null ? " " + e.getMessage() : "");
            return null;
        }
    }

    /** v1.14: EL REPASO — lo que quedó colgado (formularios, llamadas sin devolver, correos sin
     *  contestar, promesas y borradores). SOLO LECTURA: lo que Asier tacha en la app deja de
     *  salir aquí. Mismo pase que el resumen; si caducó, re-entra solo y reintenta una vez. */
    static JSONObject repaso(Context ctx) { return repaso(ctx, 12); }

    /** v1.15: `filas` = las rayas que caben DE VERDAD en el widget tal y como está puesto. */
    static JSONObject repaso(Context ctx, int filas) {
        SharedPreferences p = prefs(ctx);
        String jwt = p.getString("jwt", "");
        if (jwt.isEmpty()) return null;
        JSONObject r = pedirRepaso(jwt, filas);
        if (r != null) return r;
        String u = p.getString("usuario", ""), pw = p.getString("pass", "");
        if (u.isEmpty() || pw.isEmpty()) return null;
        if (login(ctx, u, pw) == null) {
            return pedirRepaso(p.getString("jwt", ""), filas);
        }
        return null;
    }

    static String ultimoErrorRepaso = "";

    private static JSONObject pedirRepaso(String jwt, int filas) {
        try {
            // lineas=N = las rayas que caben en el widget ahora mismo: así el servidor NUNCA
            // manda más de las que se ven y el "… y N más" no se queda fuera de la pantalla.
            // El tope del servidor es 3..20; aquí se recorta igual por si acaso.
            int f = filas < 3 ? 3 : (filas > 20 ? 20 : filas);
            HttpURLConnection c = conecta(BASE + "/api/widget/repaso?max=12&lineas=" + f, "GET", jwt);
            int code = c.getResponseCode();
            if (code != 200) {
                String resp = leerTodo(c.getErrorStream());
                ultimoErrorRepaso = "HTTP " + code + (resp.isEmpty() ? "" : ": " + resp.substring(0, Math.min(160, resp.length())));
                return null;
            }
            JSONObject j = new JSONObject(leerTodo(c.getInputStream()));
            if (!j.optBoolean("ok", false)) { ultimoErrorRepaso = "Respuesta sin ok"; return null; }
            ultimoErrorRepaso = "";
            return j;
        } catch (Exception e) {
            ultimoErrorRepaso = "[" + e.getClass().getSimpleName() + "]" + (e.getMessage() != null ? " " + e.getMessage() : "");
            return null;
        }
    }

    /** v1.2: hablar con el CEREBRO de Azkarin (el mismo canal que la app). Devuelve el JSON
     *  de respuesta ({tipo, mensaje, accion...}) o null; el detalle del fallo queda en ultimoErrorChat. */
    static String ultimoErrorChat = "";

    static JSONObject chat(Context ctx, String mensaje, org.json.JSONArray historial, JSONObject confirmarAccion) {
        JSONObject r = chatUna(ctx, mensaje, historial, confirmarAccion);
        if (r != null) return r;
        // pase caducado → re-entrar con lo guardado y reintentar una vez
        if (ultimoErrorChat.startsWith("HTTP 401")) {
            SharedPreferences p = prefs(ctx);
            String u = p.getString("usuario", ""), pw = p.getString("pass", "");
            if (!u.isEmpty() && !pw.isEmpty() && login(ctx, u, pw) == null) return chatUna(ctx, mensaje, historial, confirmarAccion);
        }
        return null;
    }

    private static JSONObject chatUna(Context ctx, String mensaje, org.json.JSONArray historial, JSONObject confirmarAccion) {
        try {
            String jwt = prefs(ctx).getString("jwt", "");
            if (jwt.isEmpty()) { ultimoErrorChat = "sin sesión"; return null; }
            HttpURLConnection c = conecta(BASE + "/api/chatbot/message", "POST", jwt);
            c.setReadTimeout(120000); // Azkarin puede tardar (consulta calendario, crea eventos…)
            c.setDoOutput(true);
            JSONObject body = new JSONObject();
            body.put("mensaje", mensaje);
            body.put("historial", historial == null ? new org.json.JSONArray() : historial);
            if (confirmarAccion != null) body.put("confirmar_accion", confirmarAccion);
            // v1.17: donde esta Asier AHORA (si dio permiso y la tarjeta esta abierta).
            // Si no hay, se manda el MOTIVO para que Azkarin lo explique en vez de callarse.
            JSONObject _ub = Ubic.json();
            if (_ub != null) body.put("ubicacion", _ub);
            else { String _m = Ubic.motivo(); if (_m != null) body.put("ubicacion_error", _m); }
            OutputStream os = c.getOutputStream();
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            os.close();
            int code = c.getResponseCode();
            String resp = leerTodo(code < 400 ? c.getInputStream() : c.getErrorStream());
            if (code >= 400) { ultimoErrorChat = "HTTP " + code + ": " + resp.substring(0, Math.min(160, resp.length())); return null; }
            ultimoErrorChat = "";
            return new JSONObject(resp);
        } catch (Exception e) {
            ultimoErrorChat = "[" + e.getClass().getSimpleName() + "]" + (e.getMessage() != null ? " " + e.getMessage() : "");
            return null;
        }
    }

    /** v1.39 · EL COMPAÑERO: ¿tiene Azkarin algo que decirme en alto? {hay, id, texto, accion} o null. */
    static JSONObject companero(Context ctx) {
        JSONObject r = companeroUna(ctx);
        if (r != null) return r;
        SharedPreferences p = prefs(ctx);
        String u = p.getString("usuario", ""), pw = p.getString("pass", "");
        if (ultimoErrorCompanero.startsWith("HTTP 401") && !u.isEmpty() && !pw.isEmpty() && login(ctx, u, pw) == null) return companeroUna(ctx);
        return null;
    }
    static String ultimoErrorCompanero = "";
    private static JSONObject companeroUna(Context ctx) {
        try {
            String jwt = prefs(ctx).getString("jwt", "");
            if (jwt.isEmpty()) { ultimoErrorCompanero = "sin sesión"; return null; }
            HttpURLConnection c = conecta(BASE + "/api/widget/companero?v=" + CompaneroService.VERSION, "GET", jwt);
            int code = c.getResponseCode();
            if (code != 200) { ultimoErrorCompanero = "HTTP " + code; return null; }
            ultimoErrorCompanero = "";
            return new JSONObject(leerTodo(c.getInputStream()));
        } catch (Exception e) { ultimoErrorCompanero = String.valueOf(e.getMessage()); return null; }
    }
    /** Ya lo he dicho en alto (resultado: dicho | hecho | no). */
    static void companeroOido(Context ctx, String id, String resultado) {
        try {
            String jwt = prefs(ctx).getString("jwt", "");
            if (jwt.isEmpty() || id == null) return;
            HttpURLConnection c = conecta(BASE + "/api/widget/companero/oido", "POST", jwt);
            JSONObject cuerpo = new JSONObject();
            cuerpo.put("id", id); cuerpo.put("resultado", resultado);
            c.setDoOutput(true);
            c.getOutputStream().write(cuerpo.toString().getBytes("UTF-8"));
            c.getResponseCode();
        } catch (Exception e) { /* si falla, como mucho lo repite una vez */ }
    }

    /** v1.4: ¿hay versión nueva del widget publicada? Lee widgets-version.json de la web de la
     *  app y compara con la versión instalada. Devuelve {versionCode, versionName, url} o null. */
    static JSONObject hayActualizacion(Context ctx) {
        try {
            HttpURLConnection c = conecta("https://asieresquinas-collab.github.io/azkar-app/apk/widgets-version.json?t=" + System.currentTimeMillis(), "GET", null);
            if (c.getResponseCode() != 200) return null;
            JSONObject j = new JSONObject(leerTodo(c.getInputStream()));
            int mio = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionCode;
            if (j.optInt("versionCode", 0) > mio && !j.optString("url", "").isEmpty()) return j;
            return null;
        } catch (Exception e) { return null; }
    }

    /** v1.6: baja el MP3 de una grabación de llamada (misma auth: api key + JWT del login) a un
     *  fichero temporal para reproducirlo en el widget. Devuelve el File o null (detalle en
     *  ultimoErrorChat). Reintenta una vez re-entrando si el pase caducó (401). */
    static java.io.File descargarGrabacion(Context ctx, String callId) {
        java.io.File f = _bajarGrab(ctx, callId);
        if (f != null) return f;
        if (ultimoErrorChat.startsWith("audio HTTP 401")) {
            SharedPreferences p = prefs(ctx);
            String u = p.getString("usuario", ""), pw = p.getString("pass", "");
            if (!u.isEmpty() && !pw.isEmpty() && login(ctx, u, pw) == null) return _bajarGrab(ctx, callId);
        }
        return null;
    }

    private static java.io.File _bajarGrab(Context ctx, String callId) {
        try {
            String jwt = prefs(ctx).getString("jwt", "");
            if (jwt.isEmpty()) { ultimoErrorChat = "sin sesión"; return null; }
            HttpURLConnection c = conecta(BASE + "/api/gesditel/calls/" + java.net.URLEncoder.encode(callId, "UTF-8") + "/recording", "GET", jwt);
            c.setReadTimeout(90000); // grabaciones largas
            int code = c.getResponseCode();
            if (code != 200) {
                String resp = leerTodo(c.getErrorStream());
                ultimoErrorChat = "audio HTTP " + code + (resp.isEmpty() ? "" : ": " + resp.substring(0, Math.min(120, resp.length())));
                return null;
            }
            java.io.File f = new java.io.File(ctx.getCacheDir(), "llamada_azkar.mp3");
            java.io.InputStream in = c.getInputStream();
            java.io.FileOutputStream out = new java.io.FileOutputStream(f);
            byte[] buf = new byte[8192]; int n; long total = 0;
            while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); total += n; }
            out.close(); in.close();
            if (total <= 0) { ultimoErrorChat = "audio vacío"; return null; }
            ultimoErrorChat = "";
            return f;
        } catch (Exception e) {
            ultimoErrorChat = "audio [" + e.getClass().getSimpleName() + "]" + (e.getMessage() != null ? " " + e.getMessage() : "");
            return null;
        }
    }

    /** Cache de las líneas del widget (para pintar al instante y aguantar sin red).
     *  v1.15: se guardan TAMBIÉN los botones, en el mismo momento y con el mismo largo
     *  que las rayas. Si se guardara una cosa sin la otra, el botón de una raya podría
     *  acabar llamando a otra persona. */
    static void guardaCache(Context ctx, JSONObject r) {
        try {
            prefs(ctx).edit()
                    .putString("cache_lineas", r.optJSONArray("lineas") == null ? "[]" : r.optJSONArray("lineas").toString())
                    .putString("cache_acciones", r.optJSONArray("acciones") == null ? "[]" : r.optJSONArray("acciones").toString())
                    .putString("cache_hora", r.optString("hora", ""))
                    .apply();
        } catch (Exception e) { /* nada */ }
    }

    /** v1.15: a dónde lleva el botón de cada raya del resumen (mismo orden que cacheLineas). */
    static Accion[] cacheAcciones(Context ctx) {
        return Accion.deTexto(prefs(ctx).getString("cache_acciones", "[]"));
    }

    static String[] cacheLineas(Context ctx) {
        try {
            org.json.JSONArray a = new org.json.JSONArray(prefs(ctx).getString("cache_lineas", "[]"));
            String[] out = new String[a.length()];
            for (int i = 0; i < a.length(); i++) out[i] = a.optString(i, "");
            return out;
        } catch (Exception e) {
            return new String[0];
        }
    }

    static String cacheHora(Context ctx) {
        return prefs(ctx).getString("cache_hora", "");
    }

    /** v1.14: cache del repaso — para pintarlo al instante y que no se quede en blanco sin red.
     *  Guarda también la hora en que se trajo, para no hacer pasar por fresco lo que es de antes. */
    static void guardaCacheRepaso(Context ctx, JSONObject r) {
        try {
            prefs(ctx).edit()
                    .putString("cache_rep_lineas", r.optJSONArray("lineas") == null ? "[]" : r.optJSONArray("lineas").toString())
                    .putString("cache_rep_acciones", r.optJSONArray("acciones") == null ? "[]" : r.optJSONArray("acciones").toString())
                    .putString("cache_rep_titulo", r.optString("titulo", "REPASO"))
                    .putString("cache_rep_hora", r.optString("hora", ""))
                    .apply();
        } catch (Exception e) { /* nada */ }
    }

    /** v1.15: a dónde lleva el botón de cada raya del repaso (mismo orden que las rayas). */
    static Accion[] cacheAccionesRepaso(Context ctx) {
        return Accion.deTexto(prefs(ctx).getString("cache_rep_acciones", "[]"));
    }

    static String[] cacheLineasRepaso(Context ctx) {
        try {
            org.json.JSONArray a = new org.json.JSONArray(prefs(ctx).getString("cache_rep_lineas", "[]"));
            String[] out = new String[a.length()];
            for (int i = 0; i < a.length(); i++) out[i] = a.optString(i, "");
            return out;
        } catch (Exception e) {
            return new String[0];
        }
    }

    static String cacheTituloRepaso(Context ctx) {
        return prefs(ctx).getString("cache_rep_titulo", "REPASO");
    }

    static String cacheHoraRepaso(Context ctx) {
        return prefs(ctx).getString("cache_rep_hora", "");
    }

    static boolean hayLogin(Context ctx) {
        return !prefs(ctx).getString("jwt", "").isEmpty();
    }

    // ══ v1.16 · EL PANEL GRANDE DE LA TABLET (el trabajo de hoy del equipo) ══════════
    // Asier: «que tenga un widget grande, por lo menos que ocupe toda la pantalla, para que
    // lo vean bien claro dónde está».
    //
    // OJO — ESTE NO VA CON EL LOGIN DE ASIER. Va con EL ENLACE DE LOS CHICOS (el mismo que
    // ya tienen abierto en la tablet). En la tablet no hay usuario ni contraseña de Asier, y
    // no debe haberlos: si este panel pidiera su clave, o habría que metérsela a los chicos
    // —que es justo lo que no puede pasar— o el panel no funcionaría nunca ahí.

    static String ultimoErrorEquipo = "";

    /** Guarda el enlace de los chicos. Acepta el enlace ENTERO (pegado del navegador, con o
     *  sin /parte/123 detrás) y se queda solo con la parte buena. Devuelve null si valía, o
     *  el motivo en cristiano si no. NUNCA guarda un enlace a medias: o vale, o se dice. */
    static String guardaEnlaceEquipo(Context ctx, String pegado) {
        String s = String.valueOf(pegado == null ? "" : pegado).trim();
        if (s.isEmpty()) return "No has pegado nada.";
        int i = s.indexOf("/api/equipo/");
        if (i < 0) return "Ese enlace no es el de los chicos. Tiene que llevar /api/equipo/ dentro. Ábrelo en la tablet y copia la dirección de arriba del navegador.";
        String resto = s.substring(i + "/api/equipo/".length());
        // el token es lo primero hasta la siguiente barra, ? o #
        int corte = resto.length();
        for (int k = 0; k < resto.length(); k++) {
            char c = resto.charAt(k);
            if (c == '/' || c == '?' || c == '#' || c == ' ') { corte = k; break; }
        }
        String token = resto.substring(0, corte);
        if (token.length() < 8) return "El enlace está cortado: le falta el código del final. Cópialo entero.";
        prefs(ctx).edit().putString("equipo_token", token).apply();
        return null;
    }

    /** El enlace entero de los chicos, o "" si aún no se ha puesto. */
    static String enlaceEquipo(Context ctx) {
        String t = prefs(ctx).getString("equipo_token", "");
        return t.isEmpty() ? "" : BASE + "/api/equipo/" + t;
    }

    static boolean hayEquipo(Context ctx) {
        return !prefs(ctx).getString("equipo_token", "").isEmpty();
    }

    /** El trabajo de hoy tal y como lo ve el portal, en rayas ya escritas. SOLO LECTURA. */
    static JSONObject hoyEquipo(Context ctx, int filas) {
        String t = prefs(ctx).getString("equipo_token", "");
        if (t.isEmpty()) { ultimoErrorEquipo = "sin enlace"; return null; }
        try {
            int f = filas < 4 ? 4 : (filas > 30 ? 30 : filas);
            HttpURLConnection c = conecta(BASE + "/api/equipo/" + t + "/hoy.json?lineas=" + f, "GET", null);
            int code = c.getResponseCode();
            if (code != 200) {
                String resp = leerTodo(c.getErrorStream());
                String detalle = "";
                try { detalle = new JSONObject(resp).optString("error", ""); } catch (Exception e) { /* nada */ }
                // 404 = enlace caducado o cambiado. Se DICE con esas palabras: es lo único que
                // Asier puede arreglar, y callarlo dejaría el panel "raro" para siempre.
                ultimoErrorEquipo = code == 404
                        ? "el enlace ya no vale — pídele el nuevo a Asier"
                        : "HTTP " + code + (detalle.isEmpty() ? "" : ": " + detalle);
                return null;
            }
            JSONObject j = new JSONObject(leerTodo(c.getInputStream()));
            if (!j.optBoolean("ok", false)) { ultimoErrorEquipo = "respuesta sin ok"; return null; }
            ultimoErrorEquipo = "";
            return j;
        } catch (Exception e) {
            ultimoErrorEquipo = "[" + e.getClass().getSimpleName() + "]" + (e.getMessage() != null ? " " + e.getMessage() : "");
            return null;
        }
    }

    /** Guarda lo último que trajo. Rayas, botones Y estilos se guardan A LA VEZ: si se
     *  guardara una cosa sin la otra, el botón 📍 de una raya podría acabar mandando a un
     *  chico a la dirección de otro cliente. */
    static void guardaCacheEquipo(Context ctx, JSONObject r) {
        try {
            prefs(ctx).edit()
                    .putString("cache_eq_lineas", r.optJSONArray("lineas") == null ? "[]" : r.optJSONArray("lineas").toString())
                    .putString("cache_eq_acciones", r.optJSONArray("acciones") == null ? "[]" : r.optJSONArray("acciones").toString())
                    .putString("cache_eq_titulo", r.optString("titulo", "AZKAR"))
                    .putString("cache_eq_hora", r.optString("hora", ""))
                    .apply();
        } catch (Exception e) { /* nada */ }
    }

    static Accion[] cacheAccionesEquipo(Context ctx) {
        return Accion.deTexto(prefs(ctx).getString("cache_eq_acciones", "[]"));
    }

    static String[] cacheLineasEquipo(Context ctx) {
        try {
            org.json.JSONArray a = new org.json.JSONArray(prefs(ctx).getString("cache_eq_lineas", "[]"));
            String[] out = new String[a.length()];
            for (int i = 0; i < a.length(); i++) out[i] = a.optString(i, "");
            return out;
        } catch (Exception e) {
            return new String[0];
        }
    }

    static String cacheTituloEquipo(Context ctx) {
        return prefs(ctx).getString("cache_eq_titulo", "AZKAR");
    }

    static String cacheHoraEquipo(Context ctx) {
        return prefs(ctx).getString("cache_eq_hora", "");
    }
}
