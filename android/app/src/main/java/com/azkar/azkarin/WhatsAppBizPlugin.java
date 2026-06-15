package com.azkar.azkarin;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Abre EXCLUSIVAMENTE WhatsApp Business (com.whatsapp.w4b) con numero + texto. */
@CapacitorPlugin(name = "WhatsAppBiz")
public class WhatsAppBizPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String phone = call.getString("phone", "");
        String text = call.getString("text", "");
        String url = "https://wa.me/" + phone + "?text=" + Uri.encode(text);
        // 1) Forzar WhatsApp Business
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.setPackage("com.whatsapp.w4b");
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            JSObject r = new JSObject(); r.put("ok", true); r.put("app", "business");
            call.resolve(r);
            return;
        } catch (Exception e) { /* sigue al fallback */ }
        // 2) Fallback: sin paquete (que el sistema elija / lo que haya)
        try {
            Intent i2 = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i2);
            JSObject r = new JSObject(); r.put("ok", true); r.put("app", "fallback");
            call.resolve(r);
        } catch (Exception e2) {
            call.reject("No se pudo abrir WhatsApp Business: " + e2.getMessage());
        }
    }
}
