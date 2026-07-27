package es.azkarmudanzas.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * WIDGET 3 (v1.14) — EL REPASO: lo que quedó colgado, con NOMBRE Y TELÉFONO, una raya por
 * cosa: formularios sin contestar, llamadas sin devolver, correos sin contestar, promesas
 * hechas y borradores esperando el OK. Lo pidió Asier: "que me salga aparte de las cosas
 * que hay que hacer, lo del repaso".
 *
 * v1.15 — UN BOTÓN POR COSA: «cada cosa un botón para llegar a donde tiene que llegar…
 * pone llamar a este número que no ha llamado, pues un botón para llamar a ese número…
 * y luego los otros, pues cada uno en su sitio». El botón llama por ZOIPER (la centralita
 * de Asier), escribe el correo o abre la ficha, según lo que sea esa cosa.
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
    /** v1.15 · la raya ENTERA (texto + botón): es lo que se esconde cuando sobra. */
    static final int[] IDS_FILAS = new int[]{
            R.id.fila1, R.id.fila2, R.id.fila3, R.id.fila4, R.id.fila5, R.id.fila6,
            R.id.fila7, R.id.fila8, R.id.fila9, R.id.fila10, R.id.fila11, R.id.fila12};
    /** v1.15 · el botoncito de cada raya (📞 llamar · ✉️ escribir · 📄 ficha). */
    static final int[] IDS_BOTONES = new int[]{
            R.id.bot1, R.id.bot2, R.id.bot3, R.id.bot4, R.id.bot5, R.id.bot6,
            R.id.bot7, R.id.bot8, R.id.bot9, R.id.bot10, R.id.bot11, R.id.bot12};

    /** v1.15 · el código del toque de cada botón: 100, 101, 102… uno por raya.
     *  OJO: Android NO mira los "extras" para distinguir un toque de otro. Si todas las
     *  rayas compartieran código, todos los botones acabarían haciendo lo mismo (llamar
     *  siempre al mismo cliente). Por eso cada raya lleva su código Y su propia dirección
     *  interna (azkarwidget://repaso/<widget>/<raya>). */
    static final int COD_BOTON = 100;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACCION_REFRESCAR.equals(intent.getAction())) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, WidgetRepaso.class));
            onUpdate(ctx, mgr, ids);
        }
    }

    /** v1.15: lo ha estirado o encogido → ahora caben otras tantas rayas: pedirlas de nuevo. */
    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, android.os.Bundle nuevas) {
        super.onAppWidgetOptionsChanged(ctx, mgr, id, nuevas);
        onUpdate(ctx, mgr, new int[]{id});
    }

    @Override
    public void onUpdate(final Context ctx, final AppWidgetManager mgr, final int[] ids) {
        // 1) pintar YA lo último que tuvimos (cache) — el widget nunca se queda en blanco
        for (int id : ids) {
            pinta(ctx, mgr, id, Datos.cacheLineasRepaso(ctx), Datos.cacheAccionesRepaso(ctx),
                    Datos.cacheTituloRepaso(ctx), Datos.cacheHoraRepaso(ctx), !Datos.hayLogin(ctx));
        }
        if (!Datos.hayLogin(ctx)) return;
        // 2) y en segundo plano, traer lo fresco del servidor — pidiendo SOLO las rayas
        //    que caben en el tamaño que tiene puesto ahora mismo (v1.15)
        final int filas = Rayas.caben(mgr, ids, IDS_LINEAS.length);
        final android.content.BroadcastReceiver.PendingResult res = goAsync();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject r = Datos.repaso(ctx, filas);
                    if (r != null) {
                        Datos.guardaCacheRepaso(ctx, r);
                        String[] lineas = Datos.cacheLineasRepaso(ctx);
                        Accion[] acciones = Datos.cacheAccionesRepaso(ctx);
                        // si hay versión nueva de los widgets, avisar en el propio panel
                        try {
                            if (Datos.hayActualizacion(ctx) != null) {
                                int[] mapa = Rayas.mapaConAviso(lineas.length, filas, IDS_LINEAS.length);
                                acciones = Rayas.reordena(acciones, mapa);
                                lineas = Rayas.reordena(lineas, mapa, "🔄 Versión nueva — abre Azkar Widgets y toca ACTUALIZAR");
                            }
                        } catch (Exception eA) { /* nada */ }
                        for (int id : ids) {
                            pinta(ctx, mgr, id, lineas, acciones, r.optString("titulo", "REPASO"), r.optString("hora", ""), false);
                        }
                    } else {
                        // No se pudo traer: se DICE, y se enseña de cuándo es lo que hay puesto.
                        String hora = Datos.cacheHoraRepaso(ctx);
                        String[] viejas = Datos.cacheLineasRepaso(ctx);
                        Accion[] accViejas = Datos.cacheAccionesRepaso(ctx);
                        String aviso = viejas.length > 0
                                ? "⚠️ No he podido actualizar — esto es de las " + (hora.isEmpty() ? "antes" : hora)
                                : "⚠️ No he podido traer el repaso" + (Datos.ultimoErrorRepaso.isEmpty() ? "" : " (" + Datos.ultimoErrorRepaso + ")");
                        int[] mapa = Rayas.mapaConAviso(viejas.length, filas, IDS_LINEAS.length);
                        String[] lineas = Rayas.reordena(viejas, mapa, aviso);
                        Accion[] acciones = Rayas.reordena(accViejas, mapa);
                        for (int id : ids) {
                            pinta(ctx, mgr, id, lineas, acciones, Datos.cacheTituloRepaso(ctx), hora, false);
                        }
                    }
                } catch (Exception e) { /* se queda la cache */ } finally {
                    try { res.finish(); } catch (Exception e) { /* nada */ }
                }
            }
        }).start();
    }

    private void pinta(Context ctx, AppWidgetManager mgr, int id, String[] lineas, Accion[] acciones,
                       String titulo, String hora, boolean sinLogin) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.w_repaso);
        String t = (titulo == null || titulo.isEmpty()) ? "REPASO" : titulo;
        rv.setTextViewText(R.id.titulo_rep, "📋 " + t + (hora != null && !hora.isEmpty() ? " · " + hora : ""));
        // Los botones solo se pintan si hay EXACTAMENTE uno por raya. Si por lo que sea no
        // cuadraran (una cache a medias, por ejemplo), se pinta el texto sin botones: mejor
        // sin botón que un botón que llame a quien no es.
        boolean fiables = lineas != null && acciones != null && acciones.length == lineas.length;
        if (sinLogin) {
            rv.setTextViewText(R.id.rep1, "Abre “Azkar Widgets” y entra con tu clave de la app");
            rv.setViewVisibility(R.id.rep1, android.view.View.VISIBLE);
            rv.setViewVisibility(R.id.fila1, android.view.View.VISIBLE);
            rv.setViewVisibility(R.id.bot1, android.view.View.GONE);
            for (int i = 1; i < IDS_LINEAS.length; i++) {
                rv.setViewVisibility(IDS_LINEAS[i], android.view.View.GONE);
                rv.setViewVisibility(IDS_FILAS[i], android.view.View.GONE);
            }
        } else {
            for (int i = 0; i < IDS_LINEAS.length; i++) {
                if (lineas != null && i < lineas.length && lineas[i] != null && !lineas[i].isEmpty()) {
                    rv.setTextViewText(IDS_LINEAS[i], lineas[i]);
                    rv.setViewVisibility(IDS_LINEAS[i], android.view.View.VISIBLE);
                    rv.setViewVisibility(IDS_FILAS[i], android.view.View.VISIBLE);
                    ponBoton(ctx, rv, id, i, fiables ? acciones[i] : null);
                } else {
                    rv.setViewVisibility(IDS_LINEAS[i], android.view.View.GONE);
                    rv.setViewVisibility(IDS_FILAS[i], android.view.View.GONE);
                    rv.setViewVisibility(IDS_BOTONES[i], android.view.View.GONE);
                }
            }
            if (lineas == null || lineas.length == 0) {
                rv.setTextViewText(R.id.rep1, "Toca ↻ para cargar el repaso");
                rv.setViewVisibility(R.id.rep1, android.view.View.VISIBLE);
                rv.setViewVisibility(R.id.fila1, android.view.View.VISIBLE);
                rv.setViewVisibility(R.id.bot1, android.view.View.GONE);
            }
        }
        // tocar el cuerpo (o el TEXTO de cualquier raya) → abrir la app DIRECTA en la
        // pestaña Repaso, para ir tachando. Un roce sin querer nunca llama a nadie.
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

    /** v1.15 · el botón de esa cosa. Si esa cosa no lleva a ningún sitio propio (un aviso,
     *  un "… y N más", una cosa sin teléfono ni correo), NO SE PINTA BOTÓN: un botón que no
     *  hace nada sería peor que no tener botón. */
    private void ponBoton(Context ctx, RemoteViews rv, int idWidget, int i, Accion a) {
        if (a == null || !a.tieneBoton()) {
            rv.setViewVisibility(IDS_BOTONES[i], android.view.View.GONE);
            return;
        }
        rv.setTextViewText(IDS_BOTONES[i], a.icono());
        rv.setContentDescription(IDS_BOTONES[i], a.queHace());
        rv.setViewVisibility(IDS_BOTONES[i], android.view.View.VISIBLE);
        Intent in = new Intent(ctx, AccionActivity.class)
                .setData(Uri.parse("azkarwidget://repaso/" + idWidget + "/" + i))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(AccionActivity.EXTRA_TIPO, a.tipo)
                .putExtra(AccionActivity.EXTRA_URI, a.uri)
                .putExtra(AccionActivity.EXTRA_QUE, a.queHace());
        PendingIntent pi = PendingIntent.getActivity(ctx, COD_BOTON + i, in,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        rv.setOnClickPendingIntent(IDS_BOTONES[i], pi);
    }
}
