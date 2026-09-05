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

import android.webkit.PermissionRequest;
import java.util.ArrayList;
import java.util.List;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WakeWordPlugin.class);
        registerPlugin(WhatsAppBizPlugin.class);
        super.onCreate(savedInstanceState);
        pideUbicacion();
        pideMicro();
        dejaQueLaWebUseElMicro();
        handleWake(getIntent());
        handleAviso(getIntent());
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

    /**
     * v1.5 · EL MICROFONO, PARA LA WEB DE DENTRO.
     *
     * Asier, 4-sep-2026: «cada vez que se activa el microfono suena; quitame eso».
     * Ese «pi» lo hace Android cada vez que se abre y se cierra su reconocedor de voz, y no
     * se puede silenciar. La app web ya sabe escuchar sin pitar (abre el microfono normal,
     * graba, y pasa el audio a texto en el servidor), pero para eso el WebView tiene que
     * poder abrir el microfono — y aqui no podia: el parte que manda su movil decia
     * NotAllowedError una y otra vez.
     *
     * Dos cosas hacen falta, y ninguna estaba: (1) que la APP tenga concedido RECORD_AUDIO
     * (declararlo en el manifest NO basta: hay que pedirlo en marcha), y (2) que cuando la
     * pagina pida el microfono, la aplicacion se lo CONCEDA. Eso es lo que hay aqui debajo.
     */
    private void pideMicro() {
        try {
            if (Build.VERSION.SDK_INT < 23) return;
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) return;
            requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, 9002);
        } catch (Exception e) { /* si no se puede pedir, la app sigue igual */ }
    }

    /** Cuando la pagina pide el microfono, se le da — pero SOLO el microfono, y solo si la
     *  app lo tiene concedido. Nada de camara ni de conceder a ciegas lo que pida. */
    private void dejaQueLaWebUseElMicro() {
        try {
            if (bridge == null || bridge.getWebView() == null) return;
            bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(bridge) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(new Runnable() {
                        @Override public void run() {
                            try {
                                List<String> vale = new ArrayList<>();
                                String[] pide = request.getResources();
                                boolean tieneMicro = Build.VERSION.SDK_INT < 23 ||
                                    checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
                                for (int i = 0; pide != null && i < pide.length; i++) {
                                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(pide[i]) && tieneMicro) vale.add(pide[i]);
                                }
                                if (vale.isEmpty()) {
                                    // no esta concedido todavia: se pide y esta vez se deniega
                                    pideMicro();
                                    request.deny();
                                } else {
                                    request.grant(vale.toArray(new String[0]));
                                }
                            } catch (Exception e) {
                                try { request.deny(); } catch (Exception e2) {}
                            }
                        }
                    });
                }
            });
        } catch (Exception e) { /* si algo falla, la app sigue como siempre */ }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleWake(intent);
        handleAviso(intent);
    }

    /** v1.12 · ¿ha entrado por el icono «Hablar con Azkarin» (el que abre Google)? */
    private boolean vieneDelTimbre(Intent intent) {
        try {
            if (intent == null) return false;
            if (Intent.ACTION_VOICE_COMMAND.equals(intent.getAction())) return true;
            android.content.ComponentName c = intent.getComponent();
            return c != null && c.getClassName() != null && c.getClassName().endsWith("HablarActivity");
        } catch (Exception e) { return false; }
    }

    private void handleWake(Intent intent) {
        if (intent == null) return;
        if (!intent.getBooleanExtra("azkarin_wake", false) && !vieneDelTimbre(intent)) return;
        showOverLockscreen();
        // El WebView remoto puede tardar en cargar: reintentamos varias veces.
        fireWakeJs(0);
    }

    /** v1.9 · el recado que trae el cartero: se le pasa a la web para que lo diga hablando. */
    private void handleAviso(Intent intent) {
        if (intent == null) return;
        final String texto = intent.getStringExtra("azkarin_aviso");
        if (texto == null || texto.isEmpty()) return;
        final String id = intent.getStringExtra("azkarin_aviso_id");
        intent.removeExtra("azkarin_aviso");
        showOverLockscreen();
        fireAvisoJs(texto, id == null ? "" : id, 0);
    }

    private void fireAvisoJs(final String texto, final String id, final int tries) {
        if (tries > 10) return;
        try {
            if (bridge != null && bridge.getWebView() != null) {
                final String js = "(function(){if(window.__azkarinAvisoDeVoz){window.__azkarinAvisoDeVoz("
                    + org.json.JSONObject.quote(texto) + "," + org.json.JSONObject.quote(id) + ");return 1;}return 0;})();";
                bridge.getWebView().post(new Runnable() {
                    @Override public void run() {
                        try { bridge.getWebView().evaluateJavascript(js, null); } catch (Exception e) {}
                    }
                });
            }
        } catch (Exception e) {}
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override public void run() { fireAvisoJs(texto, id, tries + 1); }
        }, 900);
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
