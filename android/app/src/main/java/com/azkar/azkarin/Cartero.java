package com.azkar.azkarin;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * v1.26 · EL CARTERO QUE NO DEPENDE DE QUE LA ESCUCHA ESTE VIVA (10-sep-2026).
 *
 * Asier: «¿me podria hablar aunque este bloqueado el movil, en su horario de 8 a 7,
 * y decirmelo una sola vez?». Eso ya existia (v1.9): el servicio de la escucha pregunta
 * al servidor cada cuarto de hora y, si hay algo, abre Azkarin encima de la pantalla
 * bloqueada y lo dice. Pero los partes del 9-sep lo cuentan: «estaba caida al abrir, se
 * levanta sola». Android mata el servicio en cuanto el movil lleva un rato en el bolsillo,
 * y con el muerto el cartero no pregunta nada: el 10-sep habia un pago del dia 1 esperando
 * a ser dicho desde hacia dias.
 *
 * Aqui el cartero va por su cuenta, con una ALARMA de Android que suena cada cuarto de
 * hora aunque el movil este dormido (setAndAllowWhileIdle). Cuando suena:
 *   1. si la escucha estaba puesta y el servicio esta muerto, lo levanta;
 *   2. si el servicio no esta vivo, pregunta ella misma al servidor y, si hay algo, abre
 *      Azkarin para que lo diga (el servidor decide que, cuando y que no se repita).
 * Y la app pide UNA vez quedar fuera del ahorro de bateria, que es lo que mas mata.
 */
public class Cartero {
    public static final long CADA_MS = 5 * 60 * 1000L;   // v1.27 · cada cinco minutos (era 15): una perdida en diez como maximo
    private static final int REQ_ALARMA = 4713;
    private static final String K_ULT = "carteroUltimo";
    private static final String K_PIDE_BAT = "carteroPidioBateria";

    /** Arma (o re-arma) la alarma del siguiente cuarto de hora. Se puede llamar tantas veces como se quiera. */
    public static void armar(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(ctx, CarteroReceiver.class);
            int pf = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) pf |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ_ALARMA, i, pf);
            long cuando = System.currentTimeMillis() + CADA_MS;
            if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi);
            else am.set(AlarmManager.RTC_WAKEUP, cuando, pi);
        } catch (Exception e) {}
    }

    /** Su horario (7-22, el mismo que la escucha) y su interruptor de avisos. El servidor afina el resto (8-19, sin repetir). */
    public static boolean tocaPreguntar(Context ctx) {
        try {
            SharedPreferences pf = ctx.getSharedPreferences(WakeWordService.PREF, Context.MODE_PRIVATE);
            if (!pf.getBoolean("avisos", true)) return false;
            if (pf.getBoolean(WakeWordService.K_SOLO_HORARIO, false)) {   // v1.29 · sin restriccion de hora por defecto
                int h = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY);
                if (h < WakeWordService.HORA_ABRE || h >= WakeWordService.HORA_CIERRA) return false;
            }
            long ult = pf.getLong(K_ULT, 0);
            if (System.currentTimeMillis() - ult < CADA_MS - 60000) return false;
            return true;
        } catch (Exception e) { return true; }
    }

    /** Pregunta al servidor si hay algo que decirle. Bloquea (llamar desde un hilo). */
    public static void preguntar(final Context ctx, String origen) {
        try {
            SharedPreferences pf = ctx.getSharedPreferences(WakeWordService.PREF, Context.MODE_PRIVATE);
            final String base = pf.getString("base", "");
            final String key = pf.getString("apiKey", "");
            if (base == null || base.isEmpty() || key == null || key.isEmpty()) return;
            pf.edit().putLong(K_ULT, System.currentTimeMillis())
                     .putLong("carteroPreguntas", pf.getLong("carteroPreguntas", 0) + 1).apply();   // v1.31 · para el latido
            HttpURLConnection con = null;
            try {
                URL u = new URL(base + "/api/voz/companero?apiKey=" + key + "&via=" + origen);
                con = (HttpURLConnection) u.openConnection();
                con.setConnectTimeout(12000);
                con.setReadTimeout(15000);
                con.setRequestProperty("User-Agent", "AzkarinAPK-cartero");
                if (con.getResponseCode() != 200) return;
                StringBuilder sb = new StringBuilder();
                BufferedReader br = new BufferedReader(new InputStreamReader(con.getInputStream(), "UTF-8"));
                String l;
                while ((l = br.readLine()) != null) sb.append(l);
                br.close();
                org.json.JSONObject j = new org.json.JSONObject(sb.toString());
                if (!j.optBoolean("hay", false)) {
                    // v1.31 · cada cuatro horas se deja constancia de que SI se pregunto y no
                    // habia nada. Antes, cuando no habia recado, no quedaba ni rastro y desde
                    // fuera no habia forma de saber si la alarma sonaba o no.
                    try {
                        long ultVacio = pf.getLong("carteroVacio", 0);
                        if (System.currentTimeMillis() - ultVacio > 4 * 60 * 60 * 1000L) {
                            pf.edit().putLong("carteroVacio", System.currentTimeMillis()).apply();
                            parte(ctx, "cartero_pregunta", "{\"hay\":false}");
                        }
                    } catch (Exception e) {}
                    return;
                }
                final String texto = j.optString("texto", "");
                final String id = j.optString("id", "");
                if (texto.isEmpty()) return;
                parte(ctx, "cartero_alarma", "{\"id\":" + org.json.JSONObject.quote(id) + "}");
                new Handler(Looper.getMainLooper()).post(new Runnable() {
                    @Override public void run() { abrirParaDecir(ctx, texto, id); }
                });
            } finally { try { if (con != null) con.disconnect(); } catch (Exception e) {} }
        } catch (Exception e) {}
    }

    /** Abre Azkarin encima de lo que haya (pantalla bloqueada incluida) para que lo diga hablando. */
    public static void abrirParaDecir(Context ctx, String texto, String id) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        i.putExtra("azkarin_aviso", texto);
        i.putExtra("azkarin_aviso_id", id);
        try { ctx.startActivity(i); } catch (Exception e) {}
        try {
            crearCanal(ctx);
            int pf = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) pf |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent full = PendingIntent.getActivity(ctx, 8, i, pf);
            Notification n = new NotificationCompat.Builder(ctx, WakeWordService.CH_LLAMA)
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
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(WakeWordService.NOTIF_ID + 2, n);
        } catch (Exception e) {}
    }

    private static void crearCanal(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null || nm.getNotificationChannel(WakeWordService.CH_LLAMA) != null) return;
            NotificationChannel cl = new NotificationChannel(WakeWordService.CH_LLAMA, "Azkarin te contesta", NotificationManager.IMPORTANCE_HIGH);
            cl.setSound(null, null);
            cl.setShowBadge(false);
            nm.createNotificationChannel(cl);
        } catch (Exception e) {}
    }

    /** Un parte al servidor (POST /api/voz/parte), para que quede escrito lo que hizo la alarma. */
    public static void parte(final Context ctx, final String evento, final String datosJson) {
        new Thread(new Runnable() {
            @Override public void run() {
                HttpURLConnection con = null;
                try {
                    SharedPreferences pf = ctx.getSharedPreferences(WakeWordService.PREF, Context.MODE_PRIVATE);
                    String base = pf.getString("base", ""), key = pf.getString("apiKey", "");
                    if (base == null || base.isEmpty() || key == null || key.isEmpty()) return;
                    URL u = new URL(base + "/api/voz/parte");
                    con = (HttpURLConnection) u.openConnection();
                    con.setRequestMethod("POST");
                    con.setConnectTimeout(8000); con.setReadTimeout(8000);
                    con.setRequestProperty("Content-Type", "application/json");
                    con.setRequestProperty("x-api-key", key);
                    con.setDoOutput(true);
                    String body = "{\"evento\":" + org.json.JSONObject.quote(evento) + ",\"datos\":" + (datosJson == null ? "{}" : datosJson) + "}";
                    OutputStream os = con.getOutputStream(); os.write(body.getBytes("UTF-8")); os.close();
                    con.getResponseCode();
                } catch (Exception e) {
                } finally { try { if (con != null) con.disconnect(); } catch (Exception e) {} }
            }
        }, "azkarin-parte").start();
    }

    /**
     * Pide UNA vez (y como mucho otra a los tres dias) quedar fuera del ahorro de bateria:
     * es lo que mas mata al servicio de la escucha y a las alarmas en el bolsillo.
     */
    public static void pedirSinAhorroDeBateria(android.app.Activity act) {
        try {
            if (Build.VERSION.SDK_INT < 23) return;
            android.os.PowerManager pm = (android.os.PowerManager) act.getSystemService(Context.POWER_SERVICE);
            if (pm == null || pm.isIgnoringBatteryOptimizations(act.getPackageName())) return;
            SharedPreferences pf = act.getSharedPreferences(WakeWordService.PREF, Context.MODE_PRIVATE);
            long ult = pf.getLong(K_PIDE_BAT, 0);
            if (System.currentTimeMillis() - ult < 3L * 24 * 3600 * 1000) return;
            pf.edit().putLong(K_PIDE_BAT, System.currentTimeMillis()).apply();
            Intent i = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(android.net.Uri.parse("package:" + act.getPackageName()));
            act.startActivity(i);
            parte(act, "cartero_bateria", "{\"motivo\":\"pedido quedar fuera del ahorro de bateria\"}");
        } catch (Exception e) {}
    }
}
