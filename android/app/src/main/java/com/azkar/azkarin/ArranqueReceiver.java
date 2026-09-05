package com.azkar.azkarin;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * v1.10 · QUE NO HAYA QUE ACTIVARLO NUNCA.
 *
 * Asier: «¿habría posibilidad de que en vez de tener que escribir /escucha para activarlo,
 * le diga al teléfono escucha Azkarin y se active solo?». Activarlo hablando cuando está
 * apagado es imposible —si no escucha, no puede oír que le llaman—, así que se hace lo que
 * sí resuelve su problema: la escucha ARRANCA SOLA al encender el móvil (y al actualizar la
 * app), y se le manda callar hablando, con plazo, volviendo sola después.
 *
 * Solo arranca si Asier la había dejado encendida: si la paró del todo, sigue parada.
 */
public class ArranqueReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        try {
            String a = intent == null ? "" : String.valueOf(intent.getAction());
            if (!Intent.ACTION_BOOT_COMPLETED.equals(a)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(a)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;

            boolean encendida = ctx.getSharedPreferences(WakeWordService.PREF, Context.MODE_PRIVATE)
                    .getBoolean("escuchaPuesta", false);
            if (!encendida) return;

            Intent i = new Intent(ctx, WakeWordService.class);
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Exception e) { /* si no se puede, se arranca al abrir la app */ }
    }
}
