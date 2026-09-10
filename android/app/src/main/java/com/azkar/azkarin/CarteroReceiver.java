package com.azkar.azkarin;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** v1.26 · la alarma del cartero: cada cuarto de hora, aunque el movil duerma. */
public class CarteroReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(final Context ctx, Intent intent) {
        Cartero.armar(ctx);   // la siguiente, siempre
        boolean viva = WakeWordService.RUNNING;
        // v1.28 · un latido cada hora como mucho, para poder comprobar desde fuera que la alarma suena
        try {
            android.content.SharedPreferences pf = ctx.getSharedPreferences(WakeWordService.PREF, Context.MODE_PRIVATE);
            long ultLatido = pf.getLong("carteroLatido", 0);
            if (System.currentTimeMillis() - ultLatido > 60 * 60 * 1000L) {
                pf.edit().putLong("carteroLatido", System.currentTimeMillis()).apply();
                Cartero.parte(ctx, "cartero_tick", "{\"viva\":" + (viva ? "true" : "false") + "}");
            }
        } catch (Exception e) {}
        try {
            boolean encendida = ctx.getSharedPreferences(WakeWordService.PREF, Context.MODE_PRIVATE)
                    .getBoolean("escuchaPuesta", false);
            if (!viva && encendida) {
                Intent i = new Intent(ctx, WakeWordService.class);
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
                Cartero.parte(ctx, "cartero_revive", "{\"motivo\":\"la alarma la ha encontrado caida y la levanta\"}");
            }
        } catch (Exception e) {}
        if (viva) return;                      // el servicio vivo ya pregunta el solo
        if (!Cartero.tocaPreguntar(ctx)) return;
        final PendingResult pr = goAsync();
        new Thread(new Runnable() {
            @Override public void run() {
                try { Cartero.preguntar(ctx, "alarma"); } catch (Exception e) {}
                finally { try { pr.finish(); } catch (Exception e) {} }
            }
        }, "azkarin-cartero-alarma").start();
    }
}
