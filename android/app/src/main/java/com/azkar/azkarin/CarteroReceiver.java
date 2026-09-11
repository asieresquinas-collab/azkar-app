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
                // v1.31 · con las veces que ha preguntado desde el ultimo latido: asi se ve
                // desde fuera si la alarma suena de verdad o Android se la esta comiendo.
                long veces = pf.getLong("carteroPreguntas", 0);
                pf.edit().putLong("carteroPreguntas", 0).apply();
                Cartero.parte(ctx, "cartero_tick", "{\"viva\":" + (viva ? "true" : "false") + ",\"veces\":" + veces + "}");
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
        // ══════════════════════════════════════════════════════════════════════
        // 🛑 v1.31 · AQUI ESTABA EL FALLO (Asier, 11-sep): «se supone que me tenia
        //  que recordar cosas y no me ha mandado ni un recordatorio».
        //  Antes ponia «if (viva) return», dando por hecho que el servicio vivo
        //  pregunta el solo. Pero el servicio pregunta con un handler del hilo
        //  principal, y con el movil bloqueado en el bolsillo Android lo CONGELA:
        //  esta «vivo» y no pregunta nada. Justo cuando mas falta hace, la alarma
        //  —lo unico que sobrevive al Doze— se apartaba. Ya no: pregunta siempre,
        //  y el que no se repita lo garantiza tocaPreguntar (un hueco de cinco
        //  minutos compartido por los dos caminos).
        // ══════════════════════════════════════════════════════════════════════
        if (!Cartero.tocaPreguntar(ctx)) return;
        final PendingResult pr = goAsync();
        new Thread(new Runnable() {
            @Override public void run() {
                try { Cartero.preguntar(ctx, viva ? "alarma_con_servicio" : "alarma"); } catch (Exception e) {}
                finally { try { pr.finish(); } catch (Exception e) {} }
            }
        }, "azkarin-cartero-alarma").start();
    }
}
