package com.azkar.azkarin;

import android.Manifest;
import android.app.KeyguardManager;
import android.content.pm.PackageManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WakeWordPlugin.class);
        registerPlugin(WhatsAppBizPlugin.class);
        super.onCreate(savedInstanceState);
        pideUbicacion();
        handleWake(getIntent());
    }

    /**
     * v1.4 · LA UBICACION, PARA QUE AZKARIN PUEDA DECIR CUANTO TARDAS.
     *
     * Esto es un WebView: la pagina puede pedir la posicion, pero Android solo se la da si
     * LA APP tiene el permiso concedido. Declararlo en el manifest no basta — hay que pedirlo
     * en marcha. Se pide aqui, en la pantalla principal, nada mas abrir la app.
     *
     * Si Asier dice que NO, la app sigue funcionando igual: solo se queda sin los tiempos.
     */
    private void pideUbicacion() {
        try {
            if (Build.VERSION.SDK_INT < 23) return;
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) return;
            requestPermissions(new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION}, 9001);
        } catch (Exception e) { /* si no se puede pedir, la app sigue igual */ }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleWake(intent);
    }

    private void handleWake(Intent intent) {
        if (intent == null || !intent.getBooleanExtra("azkarin_wake", false)) return;
        showOverLockscreen();
        // El WebView remoto puede tardar en cargar: reintentamos varias veces.
        fireWakeJs(0);
    }

    private void fireWakeJs(final int tries) {
        if (tries > 8) return;
        try {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().post(new Runnable() {
                    @Override public void run() {
                        try {
                            bridge.getWebView().evaluateJavascript(
                                "(function(){if(window.__azkarinWakeFromNative){window.__azkarinWakeFromNative();return 1;}return 0;})();",
                                null);
                        } catch (Exception e) {}
                    }
                });
            }
        } catch (Exception e) {}
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override public void run() { fireWakeJs(tries + 1); }
        }, 800);
    }

    private void showOverLockscreen() {
        try {
            if (Build.VERSION.SDK_INT >= 27) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
                KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                if (km != null) km.requestDismissKeyguard(this, null);
            } else {
                getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                    | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        } catch (Exception e) {}
    }
}
