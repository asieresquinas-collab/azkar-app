package com.azkar.azkarin;

import android.Manifest;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "WakeWord",
    permissions = {
        @Permission(alias = "mic", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notif", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class WakeWordPlugin extends Plugin {

    /**
     * v1.8 · QUE HACE FALTA PARA QUE SE ABRA SOLA. Desde Android 10 un servicio en segundo
     * plano no puede abrir una pantalla, y desde Android 14 la notificacion "de llamada"
     * tampoco vale si el permiso no esta concedido. Esto le dice a la app QUE FALTA, para
     * que Asier lo active de un toque en vez de quedarse con el micro sonando y sin app.
     */
    /**
     * v1.9 · LA LLAVE PARA PREGUNTAR SOLO. El servicio, con el movil bloqueado, va a
     * preguntarle al servidor si hay algo que recordarle a Asier. Para eso necesita la
     * direccion y la llave de la app, que se las pasa la propia web al arrancar. No se
     * guarda ninguna contrasena: solo la llave publica que ya viaja en la pagina.
     */
    @PluginMethod
    public void configurar(PluginCall call) {
        try {
            String base = call.getString("base", "");
            String apiKey = call.getString("apiKey", "");
            boolean avisos = Boolean.TRUE.equals(call.getBoolean("avisos", true));
            android.content.SharedPreferences.Editor ed = getContext()
                .getSharedPreferences("azkarin", android.content.Context.MODE_PRIVATE).edit()
                .putString("base", base == null ? "" : base)
                .putString("apiKey", apiKey == null ? "" : apiKey)
                .putBoolean("avisos", avisos);
            // v1.11 · los frenos de la batería, si la app los manda
            if (call.getData().has("soloHorario")) ed.putBoolean(WakeWordService.K_SOLO_HORARIO, Boolean.TRUE.equals(call.getBoolean("soloHorario", true)));
            if (call.getData().has("minBateria")) ed.putInt(WakeWordService.K_MIN_BATERIA, call.getInt("minBateria", 15));
            ed.apply();
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
        } catch (Exception e) { call.reject("no se pudo guardar: " + e.getMessage()); }
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        String version = "?";
        try {
            version = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0).versionName;
        } catch (Exception e) {}
        boolean overlay = true;
        try { if (Build.VERSION.SDK_INT >= 23) overlay = Settings.canDrawOverlays(getContext()); } catch (Exception e) {}
        boolean fullscreen = true;
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                android.app.NotificationManager nm = (android.app.NotificationManager)
                    getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
                fullscreen = nm != null && nm.canUseFullScreenIntent();
            }
        } catch (Exception e) {}
        r.put("version", version);
        r.put("listening", WakeWordService.RUNNING);
        r.put("overlay", overlay);
        r.put("fullscreen", fullscreen);
        r.put("mic", getPermissionState("mic") == PermissionState.GRANTED);
        r.put("heyGoogle", true);   // v1.13: existe pedirHeyGoogle()
        try {
            android.content.SharedPreferences pf = getContext().getSharedPreferences("azkarin", android.content.Context.MODE_PRIVATE);
            r.put("soloHorario", pf.getBoolean(WakeWordService.K_SOLO_HORARIO, true));
            r.put("minBateria", pf.getInt(WakeWordService.K_MIN_BATERIA, 15));
            r.put("avisos", pf.getBoolean("avisos", true));
        } catch (Exception e) {}
        call.resolve(r);
    }

    /** Abre la pantalla de Android donde se concede "mostrar sobre otras aplicaciones". */
    @PluginMethod
    public void pedirOverlay(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            }
            call.resolve();
        } catch (Exception e) { call.reject("no se pudo abrir: " + e.getMessage()); }
    }

    /** Abre la pantalla de "notificaciones a pantalla completa" (Android 14+). */
    @PluginMethod
    public void pedirPantallaCompleta(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                        Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            }
            call.resolve();
        } catch (Exception e) { call.reject("no se pudo abrir: " + e.getMessage()); }
    }

    /**
     * v1.13 · Abre la pantalla de Google donde se enciende el «Hey Google» (Voice Match).
     * Google ha cambiado esa pantalla varias veces, asi que se prueban varias puertas por
     * orden y se abre la primera que exista; si ninguna, la de Android «asistente digital».
     * Devuelve {abierto: "google-voz" | "google-ajustes" | "android-asistente" | "android-ajustes"}.
     */
    @PluginMethod
    public void pedirHeyGoogle(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        String gsa = "com.google.android.googlequicksearchbox";
        // v1.15: en el movil de Asier la pantalla «Voz» de la app de Google ya no lleva el
        // «Hey Google» (solo idiomas y la voz que habla). El interruptor esta en los ajustes
        // generales de Google → «Asistente de Google» → «Hey Google y Voice Match». Asi que
        // primero la raiz de ajustes, y la de «Voz» solo si no existe la raiz.
        String[][] puertas = {
            {"google-ajustes", gsa, "com.google.android.apps.gsa.velvet.ui.settings.PublicSettingsActivity"},
            {"google-voz", gsa, "com.google.android.apps.gsa.settingsui.VoiceSearchPreferences"},
            {"google-voz", gsa, "com.google.android.apps.gsa.velvet.ui.settings.VoiceSearchPreferences"},
            {"google-voz", gsa, "com.google.android.voicesearch.VoiceSearchPreferences"},
            {"google-voz", "com.google.android.voicesearch", "com.google.android.voicesearch.VoiceSearchPreferences"},
        };
        for (String[] p : puertas) {
            try {
                Intent i = new Intent(Intent.ACTION_MAIN);
                i.setComponent(new ComponentName(p[1], p[2]));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (i.resolveActivity(pm) == null) continue;
                getContext().startActivity(i);
                JSObject r = new JSObject(); r.put("abierto", p[0]); r.put("puerta", p[2]);
                call.resolve(r); return;
            } catch (Exception e) { /* siguiente puerta */ }
        }
        try {
            Intent i = new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            JSObject r = new JSObject(); r.put("abierto", "android-asistente");
            call.resolve(r); return;
        } catch (Exception e) { /* ultima */ }
        try {
            Intent i = new Intent(Settings.ACTION_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            JSObject r = new JSObject(); r.put("abierto", "android-ajustes");
            call.resolve(r);
        } catch (Exception e) { call.reject("no se pudo abrir: " + e.getMessage()); }
    }

    @PluginMethod
    public void isListening(PluginCall call) {
        JSObject r = new JSObject();
        r.put("listening", WakeWordService.RUNNING);
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) {
            requestPermissionForAlias("mic", call, "afterPerm");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notif") != PermissionState.GRANTED) {
            requestPermissionForAlias("notif", call, "afterPerm");
            return;
        }
        doStart(call);
    }

    @PermissionCallback
    private void afterPerm(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) {
            doStart(call);
        } else {
            call.reject("micro denegado");
        }
    }

    private void doStart(PluginCall call) {
        try {
            // v1.10 · queda apuntado que Asier la dejó encendida: al reiniciar el móvil
            // arranca sola y no hay que activarla nunca más
            try {
                getContext().getSharedPreferences(WakeWordService.PREF, android.content.Context.MODE_PRIVATE)
                    .edit().putBoolean("escuchaPuesta", true).putLong(WakeWordService.K_SIESTA, 0).apply();
            } catch (Exception e) {}
            Intent i = new Intent(getContext(), WakeWordService.class);
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
            else getContext().startService(i);
            JSObject r = new JSObject();
            r.put("listening", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("no se pudo arrancar: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            getContext().getSharedPreferences(WakeWordService.PREF, android.content.Context.MODE_PRIVATE)
                .edit().putBoolean("escuchaPuesta", false).apply();
        } catch (Exception e) {}
        try {
            getContext().stopService(new Intent(getContext(), WakeWordService.class));
        } catch (Exception e) {}
        JSObject r = new JSObject();
        r.put("listening", false);
        call.resolve(r);
    }
}
