package es.azkarmudanzas.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

/**
 * WIDGET 1 — La burbuja de Azkarin: solo se ve la burbuja; al tocarla se abre
 * el chat y Azkarin se pone a ESCUCHAR (hablarle por audio, sin tocar nada más).
 */
public class WidgetAzkarin extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.w_azkarin);
            PendingIntent pi = PendingIntent.getActivity(
                    ctx, 1, AbrirAzkar.hablarConAzkarin(ctx),
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            rv.setOnClickPendingIntent(R.id.burbuja, pi);
            mgr.updateAppWidget(id, rv);
        }
    }
}
