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
        c.setConnectTimeout(8000);
        c.setReadTimeout(8000);
        c.setRequestProperty("x-api-key", API_KEY);
        c.setRequestProperty("Content-Type", "application/json");
        if (jwt != null && !jwt.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + jwt);
        return c;
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
                try { return new JSONObject(resp).optString("error", "Error " + code); } catch (Exception e) { return "Error " + code; }
            }
            JSONObject j = new JSONObject(resp);
            String token = j.optString("token", "");
            if (token.isEmpty()) return "El servidor no devolvió el pase de entrada";
            prefs(ctx).edit()
                    .putString("usuario", usuario)
                    .putString("pass", pass)
                    .putString("jwt", token)
                    .apply();
            return null;
        } catch (Exception e) {
            return "Sin conexión: " + e.getMessage();
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

    private static JSONObject pedirResumen(String jwt) {
        try {
            HttpURLConnection c = conecta(BASE + "/api/widget/resumen", "GET", jwt);
            int code = c.getResponseCode();
            if (code != 200) return null;
            JSONObject j = new JSONObject(leerTodo(c.getInputStream()));
            return j.optBoolean("ok", false) ? j : null;
        } catch (Exception e) {
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
