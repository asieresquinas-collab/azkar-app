package es.azkarmudanzas.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

/**
 * WIDGET 1 — La burbuja de Azkarin: la tocas y HABLAS directamente (v1.2):
 * sale solo una tarjetita flotante que te escucha, Azkarin lo hace y te
 * contesta por voz. Sin navegador y sin abrir la app.
 */
public class WidgetAzkarin extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.w_azkarin);
            android.content.Intent voz = new android.content.Intent(ctx, VozActivity.class)
                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pi = PendingIntent.getActivity(
                    ctx, 1, voz,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            rv.setOnClickPendingIntent(R.id.burbuja, pi);
            mgr.updateAppWidget(id, rv);
        }
    }
}
