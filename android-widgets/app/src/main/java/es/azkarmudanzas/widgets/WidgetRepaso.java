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
 * WIDGET 3 (v1.14) — EL REPASO: lo que quedó colgado, con NOMBRE Y TELÉFONO, una raya por
 * cosa: formularios sin contestar, llamadas sin devolver, correos sin contestar, promesas
 * hechas y borradores esperando el OK. Lo pidió Asier: "que me salga aparte de las cosas
 * que hay que hacer, lo del repaso".
 *
 * SOLO LECTURA: aquí no se tacha nada. Lo que Asier tacha en la app deja de salir aquí.
 * Se puede estirar hacia abajo para ver más cosas. Si no se puede actualizar, LO DICE y
 * enseña la hora de lo último que trajo — nunca hace pasar por de ahora lo que es de antes.
 */
public class WidgetRepaso extends AppWidgetProvider {

    static final String ACCION_REFRESCAR = "es.azkarmudanzas.widgets.REFRESCAR_REPASO";
    static final int[] IDS_LINEAS = new int[]{
            R.id.rep1, R.id.rep2, R.id.rep3, R.id.rep4, R.id.rep5, R.id.rep6,
            R.id.rep7, R.id.rep8, R.id.rep9, R.id.rep10, R.id.rep11, R.id.rep12};

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACCION_REFRESCAR.equals(intent.getAction())) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, WidgetRepaso.class));
            onUpdate(ctx, mgr, ids);
        }
    }

    @Override
    public void onUpdate(final Context ctx, final AppWidgetManager mgr, final int[] ids) {
        // 1) pintar YA lo último que tuvimos (cache) — el widget nunca se queda en blanco
        for (int id : ids) {
            pinta(ctx, mgr, id, Datos.cacheLineasRepaso(ctx), Datos.cacheTituloRepaso(ctx),
                    Datos.cacheHoraRepaso(ctx), !Datos.hayLogin(ctx));
        }
        if (!Datos.hayLogin(ctx)) return;
        // 2) y en segundo plano, traer lo fresco del servidor
        final android.content.BroadcastReceiver.PendingResult res = goAsync();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject r = Datos.repaso(ctx);
                    if (r != null) {
                        Datos.guardaCacheRepaso(ctx, r);
                        String[] lineas = Datos.cacheLineasRepaso(ctx);
                        // si hay versión nueva de los widgets, avisar en el propio panel
                        try {
                            if (Datos.hayActualizacion(ctx) != null) {
                                lineas = conAvisoDelante(lineas, "🔄 Versión nueva — abre Azkar Widgets y toca ACTUALIZAR");
                            }
                        } catch (Exception eA) { /* nada */ }
                        for (int id : ids) {
                            pinta(ctx, mgr, id, lineas, r.optString("titulo", "REPASO"), r.optString("hora", ""), false);
                        }
                    } else {
                        // No se pudo traer: se DICE, y se enseña de cuándo es lo que hay puesto.
                        String hora = Datos.cacheHoraRepaso(ctx);
                        String[] viejas = Datos.cacheLineasRepaso(ctx);
                        String aviso = viejas.length > 0
                                ? "⚠️ No he podido actualizar — esto es de las " + (hora.isEmpty() ? "antes" : hora)
                                : "⚠️ No he podido traer el repaso" + (Datos.ultimoErrorRepaso.isEmpty() ? "" : " (" + Datos.ultimoErrorRepaso + ")");
                        String[] lineas = conAvisoDelante(viejas, aviso);
                        for (int id : ids) {
                            pinta(ctx, mgr, id, lineas, Datos.cacheTituloRepaso(ctx), hora, false);
                        }
                    }
                } catch (Exception e) { /* se queda la cache */ } finally {
                    try { res.finish(); } catch (Exception e) { /* nada */ }
                }
            }
        }).start();
    }

    /** Mete un aviso como primera raya sin pasarse de las que caben. Si hay que dejar una
     *  fuera, se deja una del MEDIO y se conserva la ÚLTIMA: la última suele ser el
     *  "… y N más", y perderla sería esconderle a Asier que hay más cosas debajo. */
    private static String[] conAvisoDelante(String[] lineas, String aviso) {
        if (lineas == null) lineas = new String[0];
        int cabe = IDS_LINEAS.length;
        if (lineas.length + 1 <= cabe) {
            String[] con = new String[lineas.length + 1];
            con[0] = aviso;
            for (int i = 1; i < con.length; i++) con[i] = lineas[i - 1];
            return con;
        }
        String[] con = new String[cabe];
        con[0] = aviso;
        for (int i = 1; i < cabe - 1; i++) con[i] = lineas[i - 1];
        con[cabe - 1] = lineas[lineas.length - 1];
        return con;
    }

    private void pinta(Context ctx, AppWidgetManager mgr, int id, String[] lineas, String titulo, String hora, boolean sinLogin) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.w_repaso);
        String t = (titulo == null || titulo.isEmpty()) ? "REPASO" : titulo;
        rv.setTextViewText(R.id.titulo_rep, "📋 " + t + (hora != null && !hora.isEmpty() ? " · " + hora : ""));
        if (sinLogin) {
            rv.setTextViewText(R.id.rep1, "Abre “Azkar Widgets” y entra con tu clave de la app");
            rv.setViewVisibility(R.id.rep1, android.view.View.VISIBLE);
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
                rv.setTextViewText(R.id.rep1, "Toca ↻ para cargar el repaso");
                rv.setViewVisibility(R.id.rep1, android.view.View.VISIBLE);
            }
        }
        // tocar el cuerpo → abrir la app DIRECTA en la pestaña Repaso (para ir tachando)
        PendingIntent abrir = PendingIntent.getActivity(ctx, 4, AbrirAzkar.elRepaso(ctx),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        rv.setOnClickPendingIntent(R.id.cuerpo_rep, abrir);
        // tocar ↻ → refrescar ahora
        Intent ref = new Intent(ctx, WidgetRepaso.class).setAction(ACCION_REFRESCAR);
        PendingIntent pref = PendingIntent.getBroadcast(ctx, 5, ref,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        rv.setOnClickPendingIntent(R.id.refrescar_rep, pref);
        mgr.updateAppWidget(id, rv);
    }
}
