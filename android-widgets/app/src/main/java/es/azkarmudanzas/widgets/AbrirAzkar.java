package es.azkarmudanzas.widgets;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;

import java.util.List;

/** Abre la app de Azkar de siempre (si está instalada) o la web de la app. */
public class AbrirAzkar {

    /** Busca la app instalada de Azkar/Azkarin (que no sea esta) y da su intent de arranque. */
    static Intent appInstalada(Context ctx) {
        try {
            PackageManager pm = ctx.getPackageManager();
            Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<android.content.pm.ResolveInfo> apps = pm.queryIntentActivities(main, 0);
            for (android.content.pm.ResolveInfo ri : apps) {
                if (ri.activityInfo == null) continue;
                String paquete = ri.activityInfo.packageName;
                if (paquete == null || paquete.equals(ctx.getPackageName())) continue;
                CharSequence etiqueta = ri.loadLabel(pm);
                String nombre = etiqueta == null ? "" : etiqueta.toString().toLowerCase();
                String paq = paquete.toLowerCase();
                if (nombre.contains("azkar") || paq.contains("azkar")) {
                    Intent li = pm.getLaunchIntentForPackage(paquete);
                    if (li != null) {
                        li.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        return li;
                    }
                }
            }
        } catch (Exception e) { /* seguimos con la web */ }
        return null;
    }

    /** La app de siempre (para el widget grande): su APK si está, si no la web. */
    static Intent laApp(Context ctx) {
        Intent app = appInstalada(ctx);
        if (app != null) return app;
        return new Intent(Intent.ACTION_VIEW, Uri.parse("https://asieresquinas-collab.github.io/azkar-app/"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    /** Hablar con Azkarin YA (para la burbuja): la web con ?azkarin=voz — abre el chat
     *  y arranca la conversación por voz él solo (v371 de la app). */
    static Intent hablarConAzkarin(Context ctx) {
        return new Intent(Intent.ACTION_VIEW, Uri.parse(Datos.URL_APP_VOZ))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }
}
