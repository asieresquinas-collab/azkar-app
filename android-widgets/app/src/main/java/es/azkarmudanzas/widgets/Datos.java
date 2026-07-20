package es.azkarmudanzas.widgets;

import android.content.Context;
import android.content.SharedPreferences;

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

    /** Trae el resumen del widget. Si el pase caducó, re-entra solo con lo guardado. */
    static JSONObject resumen(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String jwt = p.getString("jwt", "");
        if (jwt.isEmpty()) return null;
        JSONObject r = pedirResumen(jwt);
        if (r != null) return r;
        // puede haber caducado el pase (30 días) → re-login con lo guardado y reintento
        String u = p.getString("usuario", ""), pw = p.getString("pass", "");
        if (u.isEmpty() || pw.isEmpty()) return null;
        if (login(ctx, u, pw) == null) {
            return pedirResumen(p.getString("jwt", ""));
        }
        return null;
    }

    static String ultimoErrorResumen = "";

    private static JSONObject pedirResumen(String jwt) {
        try {
            HttpURLConnection c = conecta(BASE + "/api/widget/resumen", "GET", jwt);
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

    /** Cache de las líneas del widget (para pintar al instante y aguantar sin red). */
    static void guardaCache(Context ctx, JSONObject r) {
        try {
            prefs(ctx).edit()
                    .putString("cache_lineas", r.optJSONArray("lineas") == null ? "[]" : r.optJSONArray("lineas").toString())
                    .putString("cache_hora", r.optString("hora", ""))
                    .apply();
        } catch (Exception e) { /* nada */ }
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

    static boolean hayLogin(Context ctx) {
        return !prefs(ctx).getString("jwt", "").isEmpty();
    }
}
