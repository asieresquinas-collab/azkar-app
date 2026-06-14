package com.azkar.azkarin;

import android.app.KeyguardManager;
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
        super.onCreate(savedInstanceState);
        handleWake(getIntent());
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
