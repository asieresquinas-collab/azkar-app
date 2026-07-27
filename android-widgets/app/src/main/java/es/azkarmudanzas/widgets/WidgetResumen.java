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
 * WIDGET 2 — Lo importante de Azkar EN GRANDE: servicios de hoy y mañana,
 * llamadas por devolver, dinero pendiente y avisos. Se refresca solo cada
 * media hora, y al momento tocando la flechita ↻. SOLO LECTURA.
 *
 * v1.15 — DOS ARREGLOS QUE PIDIÓ ASIER CON UNA FOTO DE SU PANTALLA:
 *
 *  1) NO MENTIR CON LA HORA. En su foto el panel ponía "AZKAR · 07:49" a las 13:01: si no
 *     se podía traer lo de ahora, el widget se quedaba callado con lo viejo puesto y
 *     parecía recién hecho. Ahora, si no se puede actualizar, LO DICE en la primera raya
 *     y enseña de cuándo es lo que hay.
 *
 *  2) NO DEJAR MEDIO PANEL EN BLANCO. Lo tenía estirado casi a pantalla completa y solo
 *     salían 6 rayas; debajo, un hueco enorme vacío. Ahora se mira cuántas rayas caben de
 *     verdad (hasta 16) y se le piden al servidor esas, que rellena lo que sobra con cosas
 *     del repaso que están pendientes.
 *
 *  Y lo que pidió después: UN BOTÓN POR COSA — «pone llamar a este número que no ha
 *  llamado, pues un botón para llamar a ese número… y luego los otros, pues cada uno en su
 *  sitio». Llamar es por ZOIPER, su centralita.
 */
public class WidgetResumen extends AppWidgetProvider {

    static final String ACCION_REFRESCAR = "es.azkarmudanzas.widgets.REFRESCAR";
    static final int[] IDS_LINEAS = new int[]{
            R.id.linea1, R.id.linea2, R.id.linea3, R.id.linea4, R.id.linea5, R.id.linea6,
            R.id.linea7, R.id.linea8, R.id.linea9, R.id.linea10, R.id.linea11, R.id.linea12,
            R.id.linea13, R.id.linea14, R.id.linea15, R.id.linea16};
    /** v1.15 · la raya ENTERA (texto + botón): es lo que se esconde cuando sobra. */
    static final int[] IDS_FILAS = new int[]{
            R.id.fila_r1, R.id.fila_r2, R.id.fila_r3, R.id.fila_r4, R.id.fila_r5, R.id.fila_r6,
            R.id.fila_r7, R.id.fila_r8, R.id.fila_r9, R.id.fila_r10, R.id.fila_r11, R.id.fila_r12,
            R.id.fila_r13, R.id.fila_r14, R.id.fila_r15, R.id.fila_r16};
    /** v1.15 · el botoncito de cada raya (📞 llamar · ✉️ escribir · 📄 ficha). */
    static final int[] IDS_BOTONES = new int[]{
            R.id.bot_r1, R.id.bot_r2, R.id.bot_r3, R.id.bot_r4, R.id.bot_r5, R.id.bot_r6,
            R.id.bot_r7, R.id.bot_r8, R.id.bot_r9, R.id.bot_r10, R.id.bot_r11, R.id.bot_r12,
            R.id.bot_r13, R.id.bot_r14, R.id.bot_r15, R.id.bot_r16};

    /** v1.15 · el código del toque de cada botón: 200, 201, 202… uno por raya.
     *  OJO: Android NO mira los "extras" para distinguir un toque de otro, así que los
     *  códigos de este panel NO pueden pisar los del repaso (100…111) ni los de la burbuja
     *  (1) ni los del propio panel (2 y 3). Por eso empiezan en 200 y además cada raya
     *  lleva su propia dirección interna (azkarwidget://resumen/<widget>/<raya>). */
    static final int COD_BOTON = 200;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACCION_REFRESCAR.equals(intent.getAction())) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, WidgetResumen.class));
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
            pinta(ctx, mgr, id, Datos.cacheLineas(ctx), Datos.cacheAcciones(ctx),
                    Datos.cacheHora(ctx), !Datos.hayLogin(ctx));
        }
        if (!Datos.hayLogin(ctx)) return;
        // 2) y en segundo plano, traer lo fresco — pidiendo SOLO las rayas que caben en el
        //    tamaño que tiene puesto ahora mismo (v1.15)
        final int filas = Rayas.caben(mgr, ids, IDS_LINEAS.length);
        final android.content.BroadcastReceiver.PendingResult res = goAsync();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject r = Datos.resumen(ctx, filas);
                    if (r != null) {
                        Datos.guardaCache(ctx, r);
                        String[] lineas = Datos.cacheLineas(ctx);
                        Accion[] acciones = Datos.cacheAcciones(ctx);
                        // v1.4: si hay versión nueva del widget, avisar en el propio panel
                        try {
                            if (Datos.hayActualizacion(ctx) != null) {
                                int[] mapa = Rayas.mapaConAviso(lineas.length, filas, IDS_LINEAS.length);
                                acciones = Rayas.reordena(acciones, mapa);
                                lineas = Rayas.reordena(lineas, mapa, "🔄 Versión nueva — abre Azkar Widgets y toca ACTUALIZAR");
                            }
                        } catch (Exception eA) { /* nada */ }
                        for (int id : ids) pinta(ctx, mgr, id, lineas, acciones, r.optString("hora", ""), false);
                    } else {
                        // v1.15 · NO se pudo traer: se DICE, y se enseña de cuándo es lo que hay.
                        // Antes se quedaba lo viejo puesto tal cual y parecía de ahora mismo.
                        String hora = Datos.cacheHora(ctx);
                        String[] viejas = Datos.cacheLineas(ctx);
                        Accion[] accViejas = Datos.cacheAcciones(ctx);
                        String aviso = viejas.length > 0
                                ? "⚠️ No he podido actualizar — esto es de las " + (hora.isEmpty() ? "antes" : hora)
                                : "⚠️ No he podido traer lo de hoy" + (Datos.ultimoErrorResumen.isEmpty() ? "" : " (" + Datos.ultimoErrorResumen + ")");
                        int[] mapa = Rayas.mapaConAviso(viejas.length, filas, IDS_LINEAS.length);
                        String[] lineas = Rayas.reordena(viejas, mapa, aviso);
                        Accion[] acciones = Rayas.reordena(accViejas, mapa);
                        for (int id : ids) pinta(ctx, mgr, id, lineas, acciones, hora, false);
                    }
                } catch (Exception e) { /* se queda la cache */ } finally {
                    try { res.finish(); } catch (Exception e) { /* nada */ }
                }
            }
        }).start();
    }

    private void pinta(Context ctx, AppWidgetManager mgr, int id, String[] lineas, Accion[] acciones,
                       String hora, boolean sinLogin) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.w_resumen);
        rv.setTextViewText(R.id.titulo, "AZKAR" + (hora != null && !hora.isEmpty() ? " · " + hora : ""));
        // Los botones solo se pintan si hay EXACTAMENTE uno por raya. Si no cuadraran (una
        // cache a medias, por ejemplo), se pinta el texto sin botones: mejor sin botón que
        // un botón que llame a quien no es.
        boolean fiables = lineas != null && acciones != null && acciones.length == lineas.length;
        if (sinLogin) {
            rv.setTextViewText(R.id.linea1, "Abre “Azkar Widgets” y entra con tu clave de la app");
            rv.setViewVisibility(R.id.linea1, android.view.View.VISIBLE);
            rv.setViewVisibility(R.id.fila_r1, android.view.View.VISIBLE);
            rv.setViewVisibility(R.id.bot_r1, android.view.View.GONE);
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
                rv.setTextViewText(R.id.linea1, "Toca ↻ para cargar");
                rv.setViewVisibility(R.id.linea1, android.view.View.VISIBLE);
                rv.setViewVisibility(R.id.fila_r1, android.view.View.VISIBLE);
                rv.setViewVisibility(R.id.bot_r1, android.view.View.GONE);
            }
        }
        // tocar el cuerpo (o el TEXTO de cualquier raya) → abrir la app de Azkar de siempre.
        // Un roce sin querer nunca llama a nadie: para eso está el botón.
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

    /** v1.15 · el botón de esa cosa. Si esa cosa no lleva a ningún sitio propio (un aviso,
     *  un total, un "… y N más", una cosa sin teléfono ni correo), NO SE PINTA BOTÓN: un
     *  botón que no hace nada sería peor que no tener botón. */
    private void ponBoton(Context ctx, RemoteViews rv, int idWidget, int i, Accion a) {
        if (a == null || !a.tieneBoton()) {
            rv.setViewVisibility(IDS_BOTONES[i], android.view.View.GONE);
            return;
        }
        rv.setTextViewText(IDS_BOTONES[i], a.icono());
        rv.setContentDescription(IDS_BOTONES[i], a.queHace());
        rv.setViewVisibility(IDS_BOTONES[i], android.view.View.VISIBLE);
        Intent in = new Intent(ctx, AccionActivity.class)
                .setData(Uri.parse("azkarwidget://resumen/" + idWidget + "/" + i))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(AccionActivity.EXTRA_TIPO, a.tipo)
                .putExtra(AccionActivity.EXTRA_URI, a.uri)
                .putExtra(AccionActivity.EXTRA_QUE, a.queHace());
        PendingIntent pi = PendingIntent.getActivity(ctx, COD_BOTON + i, in,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        rv.setOnClickPendingIntent(IDS_BOTONES[i], pi);
    }
}
