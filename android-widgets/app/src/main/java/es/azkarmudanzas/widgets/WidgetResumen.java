package es.azkarmudanzas.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * WIDGET 2 — Lo importante de Azkar EN GRANDE: servicios de hoy y mañana,
 * llamadas por devolver, dinero pendiente y avisos. Se refresca solo cada
 * media hora, y al momento tocando la flechita ↻. SOLO LECTURA.
 */
public class WidgetResumen extends AppWidgetProvider {

    static final String ACCION_REFRESCAR = "es.azkarmudanzas.widgets.REFRESCAR";
    static final int[] IDS_LINEAS = new int[]{R.id.linea1, R.id.linea2, R.id.linea3, R.id.linea4, R.id.linea5, R.id.linea6};

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACCION_REFRESCAR.equals(intent.getAction())) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, WidgetResumen.class));
            onUpdate(ctx, mgr, ids);
        }
    }

    @Override
    public void onUpdate(final Context ctx, final AppWidgetManager mgr, final int[] ids) {
        // 1) pintar YA lo último que tuvimos (cache) — el widget nunca se queda en blanco
        for (int id : ids) pinta(ctx, mgr, id, Datos.cacheLineas(ctx), Datos.cacheHora(ctx), !Datos.hayLogin(ctx));
        if (!Datos.hayLogin(ctx)) return;
        // 2) y en segundo plano, traer lo fresco del servidor
        final android.content.BroadcastReceiver.PendingResult res = goAsync();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject r = Datos.resumen(ctx);
                    if (r != null) {
                        Datos.guardaCache(ctx, r);
                        String[] lineas = Datos.cacheLineas(ctx);
                        for (int id : ids) pinta(ctx, mgr, id, lineas, r.optString("hora", ""), false);
                    }
                } catch (Exception e) { /* se queda la cache */ } finally {
                    try { res.finish(); } catch (Exception e) { /* nada */ }
                }
            }
        }).start();
    }

    private void pinta(Context ctx, AppWidgetManager mgr, int id, String[] lineas, String hora, boolean sinLogin) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.w_resumen);
        rv.setTextViewText(R.id.titulo, "AZKAR" + (hora != null && !hora.isEmpty() ? " · " + hora : ""));
        if (sinLogin) {
            rv.setTextViewText(R.id.linea1, "Abre “Azkar Widgets” y entra con tu clave de la app");
            rv.setViewVisibility(R.id.linea1, android.view.View.VISIBLE);
            for (int i = 1; i < IDS_LINEAS.length; i++) rv.setViewVisibility(IDS_LINEAS[i], android.view.View.GONE);
        } else {
            for (int i = 0; i < IDS_LINEAS.length; i++) {
                if (lineas != null && i < lineas.length && lineas[i] != null && !lineas[i].isEmpty()) {
                    rv.setTextViewText(IDS_LINEAS[i], lineas[i]);
                    rv.setViewVisibility(IDS_LINEAS[i], android.view.View.VISIBLE);
                } else {
                    rv.setViewVisibility(IDS_LINEAS[i], android.view.View.GONE);
                }
            }
            if (lineas == null || lineas.length == 0) {
                rv.setTextViewText(R.id.linea1, "Toca ↻ para cargar");
                rv.setViewVisibility(R.id.linea1, android.view.View.VISIBLE);
            }
        }
        // tocar el cuerpo → abrir la app de Azkar de siempre
        PendingIntent abrir = PendingIntent.getActivity(ctx, 2, AbrirAzkar.laApp(ctx),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        rv.setOnClickPendingIntent(R.id.cuerpo, abrir);
        // tocar ↻ → refrescar ahora
        Intent ref = new Intent(ctx, WidgetResumen.class).setAction(ACCION_REFRESCAR);
        PendingIntent pref = PendingIntent.getBroadcast(ctx, 3, ref,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        rv.setOnClickPendingIntent(R.id.refrescar, pref);
        mgr.updateAppWidget(id, rv);
    }
}
