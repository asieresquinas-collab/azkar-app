package es.azkarmudanzas.widgets;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Parcelable;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * ═════════════════════════════════════════════════════════════════════════════════
 *  v1.33 · AZKARIN LEE LOS AVISOS DE WHATSAPP DEL MÓVIL  (Asier, 11-oct-2026)
 *
 *  «que Azkarin lea las notificaciones… hasta que conecte el WhatsApp… que sepa claro lo
 *  que es una notificación y claro lo que es un mensaje… me podría avisar: revisa, que es
 *  contestar a esta clienta que necesitaba tal… pero no afirman nada».
 *
 *  Qué hace: cuando WhatsApp (o WhatsApp Business) pone un aviso en el móvil, se copia
 *  lo que se VE en ese aviso (quién, la vista previa del texto, la hora) y se manda al
 *  servidor, que lo guarda APARTE de los chats exportados, marcado como AVISO.
 *
 *  🛑 Lo que NO hace, nunca:
 *   · No se conecta a WhatsApp ni lo toca: solo lee lo que Android ya enseña en la barra.
 *   · No contesta, no marca como leído, no quita avisos. Solo mirar.
 *   · Los GRUPOS no salen del móvil (ni se mandan).
 *   · Sin permiso («Acceso a notificaciones» en Ajustes) no lee nada; se quita igual.
 *
 *  Además, cuando un aviso desaparece (Asier abrió el chat o lo apartó) se avisa al
 *  servidor: así Azkarin no le recuerda lo que ya ha mirado.
 * ═════════════════════════════════════════════════════════════════════════════════
 */
public class AvisosWhatsapp extends NotificationListenerService {

    // v1.34 · SOLO el WhatsApp BUSINESS (el de la empresa). Asier: «de los WhatsApp Business,
    // no de los WhatsApp personales». Los avisos del WhatsApp normal ni se miran.
    static final String[] APPS = { "com.whatsapp.w4b" };
    static final String P_COLA = "avisos_cola";
    static final String P_VISTOS = "avisos_vistos";
    static final String P_ULT_OK = "avisos_ult_ok";
    static final String P_ULT_ERR = "avisos_ult_err";
    static final String P_TOTAL = "avisos_total";
    static final int MAX_COLA = 300;
    static final int MAX_VISTOS = 500;
    static final long VISTO_MS = 24L * 3600000L;

    // Los avisos de WhatsApp que NO son un mensaje de nadie
    static final Pattern RE_RUIDO = Pattern.compile(
            "^(\\d+\\s+(mensajes?|messages?)( nuevos?| new)?\\b.*|.*\\bmensajes? de \\d+ chats?\\b.*|.*\\bmessages? from \\d+ chats?\\b.*"
            + "|comprobando (si hay )?mensajes.*|checking for new messages.*|buscando mensajes nuevos.*"
            + "|.*whatsapp web.*|copia de seguridad.*|.*backup.*|descargando.*|downloading.*|enviando (mensaje|archivo).*|sending (message|file).*"
            + "|.*cifrado de extremo a extremo.*|whatsapp)$",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    static final Pattern RE_LLAMADA = Pattern.compile(
            "(llamada (de voz |de v[ií]deo )?(perdida|entrante)|missed (voice |video )?call|incoming (voice |video )?call|videollamada perdida)",
            Pattern.CASE_INSENSITIVE);
    static final Pattern RE_TEL_JID = Pattern.compile("(\\d{9,15})@s\\.whatsapp\\.net");
    static final Pattern RE_TEL = Pattern.compile("^\\+?[\\d\\s\\-().]{9,20}$");

    static HandlerThread hilo;
    static Handler h;

    static synchronized Handler manos() {
        if (h == null) {
            hilo = new HandlerThread("avisos-wa");
            hilo.start();
            h = new Handler(hilo.getLooper());
        }
        return h;
    }

    // ── ¿Tiene permiso? (lo mira la pantalla principal) ──────────────────────────
    static boolean tienePermiso(Context c) {
        try {
            String s = Settings.Secure.getString(c.getContentResolver(), "enabled_notification_listeners");
            if (s == null) return false;
            ComponentName yo = new ComponentName(c, AvisosWhatsapp.class);
            for (String x : s.split(":")) {
                ComponentName cn = ComponentName.unflattenFromString(x);
                if (cn != null && cn.equals(yo)) return true;
            }
        } catch (Exception e) { /* abajo */ }
        return false;
    }

    static String estadoTexto(Context c) {
        SharedPreferences p = Datos.prefs(c);
        if (!tienePermiso(c)) return "❌ Sin permiso: Azkarin NO está leyendo los avisos del WhatsApp Business. Toca el botón de arriba y activa «Azkar Widgets».";
        StringBuilder sb = new StringBuilder("✅ Permiso dado: Azkarin lee los avisos del WhatsApp BUSINESS (el personal no; los grupos tampoco).");
        int total = p.getInt(P_TOTAL, 0);
        long ok = p.getLong(P_ULT_OK, 0);
        String err = p.getString(P_ULT_ERR, "");
        int cola = 0;
        try { cola = new JSONArray(p.getString(P_COLA, "[]")).length(); } catch (Exception e) { }
        sb.append("\nMandados al servidor: ").append(total);
        if (ok > 0) sb.append(" · último envío bueno: ").append(new java.text.SimpleDateFormat("dd/MM HH:mm", java.util.Locale.getDefault()).format(new java.util.Date(ok)));
        if (cola > 0) sb.append("\n⏳ Esperando para mandar: ").append(cola);
        if (!err.isEmpty()) sb.append("\n⚠️ Último fallo: ").append(err);
        if (!Datos.hayLogin(c)) sb.append("\n⚠️ Falta entrar con tu usuario (arriba): sin eso no se puede mandar nada.");
        return sb.toString();
    }

    // ── Android avisa ────────────────────────────────────────────────────────────
    @Override
    public void onListenerConnected() {
        // Al arrancar (o al dar el permiso), se recogen los que ya están en la barra.
        try {
            StatusBarNotification[] activas = getActiveNotifications();
            if (activas != null) for (StatusBarNotification s : activas) recoger(s);
        } catch (Throwable t) { apuntarError("al arrancar: " + t.getClass().getSimpleName()); }
        programarEnvio(2000);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try { if (recoger(sbn)) programarEnvio(4000); }
        catch (Throwable t) { apuntarError("al leer: " + t.getClass().getSimpleName()); }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        try {
            if (sbn == null || !esWhatsapp(sbn.getPackageName())) return;
            Notification n = sbn.getNotification();
            if (n == null || (n.flags & 0x200) != 0) return;   // el resumen de varios chats no cuenta
            Bundle ex = n.extras;
            String chat = chatDe(sbn, ex);
            if (chat.isEmpty()) return;
            JSONObject ev = new JSONObject();
            ev.put("evento", "quitado");
            ev.put("app", appDe(sbn.getPackageName()));
            ev.put("chat", chat);
            ev.put("hora", System.currentTimeMillis());
            encolar(ev);
            programarEnvio(6000);
        } catch (Throwable t) { /* nada: es solo para no recordar lo ya mirado */ }
    }

    static boolean esWhatsapp(String pkg) {
        for (String a : APPS) if (a.equals(pkg)) return true;
        return false;
    }

    static String appDe(String pkg) { return "com.whatsapp.w4b".equals(pkg) ? "whatsapp_business" : "whatsapp"; }

    static String cs(Bundle b, String k) {
        if (b == null) return "";
        CharSequence c = b.getCharSequence(k);
        return c == null ? "" : c.toString().trim();
    }

    /** El chat de este aviso: el número si viene, si no el nombre que enseña WhatsApp. */
    static String chatDe(StatusBarNotification sbn, Bundle ex) {
        String tel = telefonoDe(sbn, ex);
        if (!tel.isEmpty()) return "tel:" + tel;
        String t = cs(ex, "android.title");
        return t;
    }

    static String soloCifras(String s) { return s == null ? "" : s.replaceAll("\\D", ""); }

    static String telefonoDe(StatusBarNotification sbn, Bundle ex) {
        try {
            String tag = sbn.getTag();
            if (tag != null) {
                Matcher m = RE_TEL_JID.matcher(tag);
                if (m.find()) return m.group(1);
            }
        } catch (Exception e) { }
        try {
            String[] gente = ex == null ? null : ex.getStringArray("android.people");
            if (gente != null) for (String g : gente) if (g != null && g.startsWith("tel:")) { String d = soloCifras(g); if (d.length() >= 9) return d; }
        } catch (Exception e) { }
        try {
            ArrayList<?> lista = ex == null ? null : (ArrayList<?>) ex.get("android.people.list");
            if (lista != null) for (Object o : lista) {
                try {
                    Object u = o.getClass().getMethod("getUri").invoke(o);
                    String s = u == null ? "" : u.toString();
                    if (s.startsWith("tel:")) { String d = soloCifras(s); if (d.length() >= 9) return d; }
                } catch (Exception e) { }
            }
        } catch (Exception e) { }
        String t = cs(ex, "android.title");
        if (RE_TEL.matcher(t).matches()) { String d = soloCifras(t); if (d.length() >= 9) return d; }
        return "";
    }

    static boolean esGrupo(StatusBarNotification sbn, Bundle ex) {
        try { if (ex != null && ex.getBoolean("android.isGroupConversation", false)) return true; } catch (Exception e) { }
        String tag = "";
        try { tag = String.valueOf(sbn.getTag()); } catch (Exception e) { }
        if (tag.contains("@g.us") || tag.contains("@broadcast") || tag.contains("@newsletter")) return true;
        String titulo = cs(ex, "android.title");
        String conv = cs(ex, "android.conversationTitle");
        if (!conv.isEmpty() && !conv.equals(titulo)) return true;
        if (titulo.matches("(?s).+ @ .+")) return true;   // «Persona @ Grupo» de algunas versiones
        return false;
    }

    /** Copia lo que se ve en un aviso. Devuelve true si había algo nuevo. */
    boolean recoger(StatusBarNotification sbn) throws Exception {
        if (sbn == null || !esWhatsapp(sbn.getPackageName())) return false;
        Notification n = sbn.getNotification();
        if (n == null) return false;
        if ((n.flags & 0x200) != 0) return false;   // FLAG_GROUP_SUMMARY: «5 mensajes de 3 chats»
        if ((n.flags & 0x02) != 0 || (n.flags & 0x40) != 0) return false;   // en curso / servicio
        Bundle ex = n.extras;
        if (ex == null) return false;
        if (esGrupo(sbn, ex)) return false;          // 🛑 los grupos no salen del móvil

        String titulo = cs(ex, "android.title");
        if (titulo.isEmpty() || RE_RUIDO.matcher(titulo).matches()) return false;
        String chat = chatDe(sbn, ex);
        String tel = telefonoDe(sbn, ex);
        String app = appDe(sbn.getPackageName());
        boolean hayYo = ex.containsKey("android.selfDisplayName") || ex.containsKey("android.messagingUser");

        List<JSONObject> nuevos = new ArrayList<>();
        Parcelable[] msgs = null;
        try { msgs = ex.getParcelableArray("android.messages"); } catch (Exception e) { }
        if (msgs != null && msgs.length > 0) {
            for (Parcelable p : msgs) {
                if (!(p instanceof Bundle)) continue;
                Bundle m = (Bundle) p;
                String txt = cs(m, "text");
                if (txt.isEmpty()) continue;
                long hora = m.getLong("time", sbn.getPostTime());
                String quien = cs(m, "sender");
                if (quien.isEmpty()) {
                    try {
                        Object per = m.get("sender_person");
                        if (per != null) { Object nm = per.getClass().getMethod("getName").invoke(per); quien = nm == null ? "" : nm.toString().trim(); }
                    } catch (Exception e) { }
                }
                String de = (quien.isEmpty() && hayYo) ? "yo" : "contacto";
                nuevos.add(item(app, chat, titulo, tel, txt, hora, de, quien));
            }
        } else {
            String txt = cs(ex, "android.bigText");
            if (txt.isEmpty()) txt = cs(ex, "android.text");
            CharSequence[] lineas = null;
            try { lineas = ex.getCharSequenceArray("android.textLines"); } catch (Exception e) { }
            if (lineas != null && lineas.length > 0) {
                for (CharSequence l : lineas) {
                    String s = l == null ? "" : l.toString().trim();
                    if (!s.isEmpty() && !RE_RUIDO.matcher(s).matches()) nuevos.add(item(app, chat, titulo, tel, s, 0, "contacto", ""));
                }
            } else if (!txt.isEmpty() && !RE_RUIDO.matcher(txt).matches()) {
                nuevos.add(item(app, chat, titulo, tel, txt, 0, "contacto", ""));
            }
        }
        if (nuevos.isEmpty()) return false;

        // Lo ya mandado no se repite (WhatsApp vuelve a poner el aviso entero con cada mensaje nuevo)
        SharedPreferences pr = Datos.prefs(this);
        JSONObject vistos;
        try { vistos = new JSONObject(pr.getString(P_VISTOS, "{}")); } catch (Exception e) { vistos = new JSONObject(); }
        long ahora = System.currentTimeMillis();
        boolean alguno = false;
        for (JSONObject it : nuevos) {
            if (it.optLong("hora", 0) == 0) it.put("hora", sbn.getPostTime() > 0 ? sbn.getPostTime() : ahora);
            String clave = it.optString("id");
            if (vistos.has(clave)) continue;
            vistos.put(clave, ahora);
            encolar(it);
            alguno = true;
        }
        // limpiar los vistos viejos
        try {
            Iterator<String> k = vistos.keys();
            List<String> fuera = new ArrayList<>();
            while (k.hasNext()) { String x = k.next(); if (ahora - vistos.optLong(x, 0) > VISTO_MS) fuera.add(x); }
            for (String x : fuera) vistos.remove(x);
            while (vistos.length() > MAX_VISTOS) { Iterator<String> k2 = vistos.keys(); if (k2.hasNext()) vistos.remove(k2.next()); else break; }
        } catch (Exception e) { }
        pr.edit().putString(P_VISTOS, vistos.toString()).apply();
        return alguno;
    }

    static JSONObject item(String app, String chat, String titulo, String tel, String texto, long hora, String de, String quien) throws Exception {
        JSONObject o = new JSONObject();
        o.put("evento", "aviso");
        o.put("app", app);
        o.put("chat", chat);
        o.put("contacto", titulo);
        if (!tel.isEmpty()) o.put("telefono", tel);
        o.put("texto", texto.length() > 1500 ? texto.substring(0, 1500) : texto);
        o.put("hora", hora);
        o.put("de", de);
        if (!quien.isEmpty() && !quien.equals(titulo)) o.put("remitente", quien);
        o.put("tipo", RE_LLAMADA.matcher(texto).find() ? "llamada" : "mensaje");
        // id estable: mismo chat + mismo texto + misma hora (o sin hora: mismo texto)
        o.put("id", app + "|" + chat + "|" + de + "|" + (hora > 0 ? String.valueOf(hora) : "") + "|" + Integer.toHexString(texto.hashCode()));
        return o;
    }

    // ── La cola y el envío ───────────────────────────────────────────────────────
    synchronized void encolar(JSONObject o) {
        SharedPreferences p = Datos.prefs(this);
        JSONArray cola;
        try { cola = new JSONArray(p.getString(P_COLA, "[]")); } catch (Exception e) { cola = new JSONArray(); }
        cola.put(o);
        if (cola.length() > MAX_COLA) {
            JSONArray rec = new JSONArray();
            for (int i = cola.length() - MAX_COLA; i < cola.length(); i++) rec.put(cola.opt(i));
            cola = rec;
        }
        p.edit().putString(P_COLA, cola.toString()).apply();
    }

    void apuntarError(String e) {
        try { Datos.prefs(this).edit().putString(P_ULT_ERR, e).apply(); } catch (Exception x) { }
    }

    final Runnable enviar = new Runnable() { public void run() { mandarCola(getApplicationContext()); } };

    void programarEnvio(long ms) {
        Handler m = manos();
        m.removeCallbacks(enviar);
        m.postDelayed(enviar, ms);
    }

    /** Manda lo que haya en la cola. Si falla, se queda y se reintenta en el próximo aviso. */
    static synchronized void mandarCola(Context ctx) {
        SharedPreferences p = Datos.prefs(ctx);
        JSONArray cola;
        try { cola = new JSONArray(p.getString(P_COLA, "[]")); } catch (Exception e) { cola = new JSONArray(); }
        if (cola.length() == 0) return;
        String jwt = p.getString("jwt", "");
        if (jwt.isEmpty()) { p.edit().putString(P_ULT_ERR, "falta entrar con tu usuario en esta app").apply(); return; }
        int n = Math.min(cola.length(), 80);
        JSONArray lote = new JSONArray();
        for (int i = 0; i < n; i++) lote.put(cola.opt(i));
        int code = enviarLote(jwt, lote);
        if (code == 401) {
            String u = p.getString("usuario", ""), pw = p.getString("pass", "");
            if (!u.isEmpty() && !pw.isEmpty() && Datos.login(ctx, u, pw) == null) code = enviarLote(p.getString("jwt", ""), lote);
        }
        if (code == 200) {
            // quitar de la cola lo mandado (puede haber entrado algo nuevo mientras tanto)
            JSONArray ahora;
            try { ahora = new JSONArray(p.getString(P_COLA, "[]")); } catch (Exception e) { ahora = new JSONArray(); }
            JSONArray resto = new JSONArray();
            for (int i = n; i < ahora.length(); i++) resto.put(ahora.opt(i));
            int avisos = 0;
            for (int i = 0; i < lote.length(); i++) if ("aviso".equals(lote.optJSONObject(i) == null ? "" : lote.optJSONObject(i).optString("evento"))) avisos++;
            p.edit().putString(P_COLA, resto.toString())
                    .putLong(P_ULT_OK, System.currentTimeMillis())
                    .putInt(P_TOTAL, p.getInt(P_TOTAL, 0) + avisos)
                    .putString(P_ULT_ERR, "").apply();
            if (resto.length() > 0) manos().postDelayed(new Runnable() { public void run() { mandarCola(ctx); } }, 1500);
        } else {
            p.edit().putString(P_ULT_ERR, code == -1 ? "sin conexión (se reintenta solo)" : "el servidor dijo HTTP " + code).apply();
        }
    }

    static int enviarLote(String jwt, JSONArray lote) {
        try {
            HttpURLConnection c = Datos.conecta(Datos.BASE + "/api/widget/avisos-whatsapp", "POST", jwt);
            c.setDoOutput(true);
            JSONObject cuerpo = new JSONObject();
            cuerpo.put("avisos", lote);
            c.getOutputStream().write(cuerpo.toString().getBytes(StandardCharsets.UTF_8));
            int code = c.getResponseCode();
            try { Datos.leerTodo(code < 400 ? c.getInputStream() : c.getErrorStream()); } catch (Exception e) { }
            return code;
        } catch (Exception e) { return -1; }
    }
}
