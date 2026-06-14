package com.azkar.azkarin;

import android.Manifest;
import android.content.Intent;
import android.os.Build;

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
            getContext().stopService(new Intent(getContext(), WakeWordService.class));
        } catch (Exception e) {}
        JSObject r = new JSObject();
        r.put("listening", false);
        call.resolve(r);
    }
}
