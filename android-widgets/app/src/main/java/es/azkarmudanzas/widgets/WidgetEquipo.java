package es.azkarmudanzas.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.text.SpannableString;
import android.text.style.StyleSpan;
import android.util.TypedValue;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * WIDGET 4 (v1.16) — EL TRABAJO DE HOY DEL EQUIPO. EL PANEL GRANDE DE LA TABLET.
 *
 * Lo pidió Asier con la tablet en la mano: «que tenga un widget grande, POR LO MENOS QUE
 * OCUPE TODA LA PANTALLA, para que lo vean bien claro DÓNDE ESTÁ».
 *
 * Por eso:
 *   · nace ya enorme (320x460dp) y se estira hasta llenar la tablet — hasta 20 rayas;
 *   · las DIRECCIONES salen a 20sp en azul oscuro y con su 📍 al lado: es lo que un chico
 *     busca de un vistazo desde la furgoneta;
 *   · tocar el texto abre el plan de trabajo entero; tocar el botón hace la cosa concreta.
 *
 * ═══ ESTE NO VA CON EL LOGIN DE ASIER ═══
 * Va con EL ENLACE DE LOS CHICOS (/api/equipo/<código>), el mismo que ya tienen abierto en
 * la tablet. En esa tablet no hay usuario ni contraseña de Asier, y NO DEBE HABERLOS.
 *
 * SOLO LECTURA: aquí no se firma ni se toca nada. Y si no se puede actualizar, LO DICE y
 * enseña de cuándo es lo que hay puesto — nunca hace pasar por de hoy lo de ayer. En un
 * parte de trabajo, enseñar lo de ayer como si fuera lo de hoy manda a un chico a la casa
 * equivocada.
 */
public class WidgetEquipo extends AppWidgetProvider {

    static final String ACCION_REFRESCAR = "es.azkarmudanzas.widgets.REFRESCAR_EQUIPO";

    /** Lo que ocupa la cabecera de ESTE panel: 10dp de borde arriba + 34dp de título +
     *  10dp de borde abajo. */
    static final int ALTO_CABECERA_DP = 54;
    /** Lo que mide cada raya de ESTE panel. Es FIJO en el layout a propósito (ver w_equipo.xml):
     *  así esta cuenta es EXACTA aunque unas rayas vayan a 20sp y otras a 16sp. */
    static final int ALTO_RAYA_DP = 30;

    static final int[] IDS_LINEAS = new int[]{
            R.id.eq1, R.id.eq2, R.id.eq3, R.id.eq4, R.id.eq5, R.id.eq6, R.id.eq7,
            R.id.eq8, R.id.eq9, R.id.eq10, R.id.eq11, R.id.eq12, R.id.eq13, R.id.eq14,
            R.id.eq15, R.id.eq16, R.id.eq17, R.id.eq18, R.id.eq19, R.id.eq20};
    static final int[] IDS_FILAS = new int[]{
            R.id.fila_eq1, R.id.fila_eq2, R.id.fila_eq3, R.id.fila_eq4, R.id.fila_eq5,
            R.id.fila_eq6, R.id.fila_eq7, R.id.fila_eq8, R.id.fila_eq9, R.id.fila_eq10,
            R.id.fila_eq11, R.id.fila_eq12, R.id.fila_eq13, R.id.fila_eq14, R.id.fila_eq15,
            R.id.fila_eq16, R.id.fila_eq17, R.id.fila_eq18, R.id.fila_eq19, R.id.fila_eq20};
    static final int[] IDS_BOTONES = new int[]{
            R.id.bot_eq1, R.id.bot_eq2, R.id.bot_eq3, R.id.bot_eq4, R.id.bot_eq5,
            R.id.bot_eq6, R.id.bot_eq7, R.id.bot_eq8, R.id.bot_eq9, R.id.bot_eq10,
            R.id.bot_eq11, R.id.bot_eq12, R.id.bot_eq13, R.id.bot_eq14, R.id.bot_eq15,
            R.id.bot_eq16, R.id.bot_eq17, R.id.bot_eq18, R.id.bot_eq19, R.id.bot_eq20};

    /** El código del toque de cada botón: 300, 301, 302… uno por raya, y distintos de los
     *  del repaso (100) y los de lo de hoy (200). Si dos botones compartieran código Y la
     *  misma dirección interna, Android los daría por el mismo toque y todos acabarían
     *  abriendo el mapa del PRIMER cliente. Por eso cada raya lleva código propio Y su
     *  propia dirección azkarwidget://equipo/<widget>/<raya>. */
    static final int COD_BOTON = 300;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (intent != null && ACCION_REFRESCAR.equals(intent.getAction())) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, WidgetEquipo.class));
            onUpdate(ctx, mgr, ids);
        }
    }

    /** Lo han estirado o encogido → ahora caben otras tantas rayas: pedirlas de nuevo. */
    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, android.os.Bundle nuevas) {
        super.onAppWidgetOptionsChanged(ctx, mgr, id, nuevas);
        onUpdate(ctx, mgr, new int[]{id});
    }

    @Override
    public void onUpdate(final Context ctx, final AppWidgetManager mgr, final int[] ids) {
        // v1.22: de paso que se refresca, mira si Azkarin ha dejado alguna alarma que poner
        try { Datos.recogerAlarmas(ctx); } catch (Exception e) { }
        // 1) pintar YA lo último que tuvimos — el panel no se queda nunca en blanco
        for (int id : ids) {
            pinta(ctx, mgr, id, Datos.cacheLineasEquipo(ctx), Datos.cacheAccionesEquipo(ctx),
                    Datos.cacheTituloEquipo(ctx), Datos.cacheHoraEquipo(ctx), !Datos.hayEquipo(ctx));
        }
        if (!Datos.hayEquipo(ctx)) return;
        // 2) y en segundo plano, traer lo de hoy — pidiendo SOLO las rayas que caben en el
        //    tamaño que tiene puesto ahora mismo
        final int filas = Rayas.caben(mgr, ids, IDS_LINEAS.length, ALTO_CABECERA_DP, ALTO_RAYA_DP);
        final android.content.BroadcastReceiver.PendingResult res = goAsync();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject r = Datos.hoyEquipo(ctx, filas);
                    if (r != null) {
                        Datos.guardaCacheEquipo(ctx, r);
                        String[] lineas = Datos.cacheLineasEquipo(ctx);
                        Accion[] acciones = Datos.cacheAccionesEquipo(ctx);
                        try {
                            if (Datos.hayActualizacion(ctx) != null) {
                                int[] mapa = Rayas.mapaConAviso(lineas.length, filas, IDS_LINEAS.length);
                                acciones = Rayas.reordena(acciones, mapa);
                                lineas = Rayas.reordena(lineas, mapa, "🔄 Versión nueva — abre Azkar Widgets y toca ACTUALIZAR");
                            }
                        } catch (Exception eA) { /* nada */ }
                        for (int id : ids) {
                            pinta(ctx, mgr, id, lineas, acciones,
                                    r.optString("titulo", "AZKAR"), r.optString("hora", ""), false);
                        }
                    } else {
                        // No se pudo traer: se DICE, y se dice de cuándo es lo que hay puesto.
                        String hora = Datos.cacheHoraEquipo(ctx);
                        String[] viejas = Datos.cacheLineasEquipo(ctx);
                        Accion[] accViejas = Datos.cacheAccionesEquipo(ctx);
                        String aviso = viejas.length > 0
                                ? "⚠️ No he podido actualizar — esto es de las " + (hora.isEmpty() ? "antes" : hora)
                                : "⚠️ No he podido traer el trabajo de hoy" + (Datos.ultimoErrorEquipo.isEmpty() ? "" : " (" + Datos.ultimoErrorEquipo + ")");
                        int[] mapa = Rayas.mapaConAviso(viejas.length, filas, IDS_LINEAS.length);
                        String[] lineas = Rayas.reordena(viejas, mapa, aviso);
                        Accion[] acciones = Rayas.reordena(accViejas, mapa);
                        for (int id : ids) {
                            pinta(ctx, mgr, id, lineas, acciones, Datos.cacheTituloEquipo(ctx), hora, false);
                        }
                    }
                } catch (Exception e) { /* se queda la cache */ } finally {
                    try { res.finish(); } catch (Exception e) { /* nada */ }
                }
            }
        }).start();
    }

    private void pinta(Context ctx, AppWidgetManager mgr, int id, String[] lineas, Accion[] acciones,
                       String titulo, String hora, boolean sinEnlace) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.w_equipo);
        String t = (titulo == null || titulo.isEmpty()) ? "AZKAR" : titulo;
        rv.setTextViewText(R.id.titulo_eq, "👷 " + t + (hora != null && !hora.isEmpty() ? " · " + hora : ""));

        // Los botones y los tamaños solo se usan si hay EXACTAMENTE uno por raya. Si no
        // cuadraran (una cache guardada a medias, por ejemplo), se pinta el texto pelado:
        // mejor una raya sin botón que un 📍 que mande al chico a la dirección de otro.
        boolean fiables = lineas != null && acciones != null && acciones.length == lineas.length;

        if (sinEnlace) {
            // Aún no le han pegado el enlace de los chicos. Se explica en una frase, con
            // las palabras que Asier usa, y tocando el panel se abre esta misma app.
            escribe(rv, IDS_LINEAS[0], "Falta el enlace de los chicos", 18f, 0xFFB23B00, true);
            rv.setViewVisibility(IDS_LINEAS[0], android.view.View.VISIBLE);
            rv.setViewVisibility(IDS_FILAS[0], android.view.View.VISIBLE);
            rv.setViewVisibility(IDS_BOTONES[0], android.view.View.GONE);
            if (IDS_LINEAS.length > 1) {
                escribe(rv, IDS_LINEAS[1], "Toca aquí y pégalo", 16f, 0xFF111111, false);
                rv.setViewVisibility(IDS_LINEAS[1], android.view.View.VISIBLE);
                rv.setViewVisibility(IDS_FILAS[1], android.view.View.VISIBLE);
                rv.setViewVisibility(IDS_BOTONES[1], android.view.View.GONE);
            }
            for (int i = 2; i < IDS_LINEAS.length; i++) {
                rv.setViewVisibility(IDS_LINEAS[i], android.view.View.GONE);
                rv.setViewVisibility(IDS_FILAS[i], android.view.View.GONE);
                rv.setViewVisibility(IDS_BOTONES[i], android.view.View.GONE);
            }
        } else {
            for (int i = 0; i < IDS_LINEAS.length; i++) {
                if (lineas != null && i < lineas.length && lineas[i] != null && !lineas[i].isEmpty()) {
                    Accion a = fiables ? acciones[i] : null;
                    // El tamaño, el color y la negrita SIEMPRE se ponen, en todas las rayas
                    // visibles. Si se dejara la de antes, al reciclarse el panel una línea
                    // normal podría quedarse pintada como una dirección (o al revés).
                    escribe(rv, IDS_LINEAS[i], lineas[i],
                            a == null ? 16f : a.tamano(),
                            a == null ? 0xFF111111 : a.color(),
                            a != null && a.negrita());
                    rv.setViewVisibility(IDS_LINEAS[i], android.view.View.VISIBLE);
                    rv.setViewVisibility(IDS_FILAS[i], android.view.View.VISIBLE);
                    ponBoton(ctx, rv, id, i, a);
                } else {
                    rv.setViewVisibility(IDS_LINEAS[i], android.view.View.GONE);
                    rv.setViewVisibility(IDS_FILAS[i], android.view.View.GONE);
                    rv.setViewVisibility(IDS_BOTONES[i], android.view.View.GONE);
                }
            }
            if (lineas == null || lineas.length == 0) {
                escribe(rv, IDS_LINEAS[0], "Toca ↻ para ver el trabajo de hoy", 16f, 0xFF111111, false);
                rv.setViewVisibility(IDS_LINEAS[0], android.view.View.VISIBLE);
                rv.setViewVisibility(IDS_FILAS[0], android.view.View.VISIBLE);
                rv.setViewVisibility(IDS_BOTONES[0], android.view.View.GONE);
            }
        }

        // Tocar el cuerpo (o el TEXTO de cualquier raya) → el plan de trabajo entero, que es
        // lo que ya conocen. Si todavía no hay enlace, se abre esta app para pegarlo.
        Intent alTocar;
        String portal = Datos.enlaceEquipo(ctx);
        if (sinEnlace || portal.isEmpty()) {
            alTocar = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        } else {
            alTocar = new Intent(Intent.ACTION_VIEW, Uri.parse(portal)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        }
        PendingIntent abrir = PendingIntent.getActivity(ctx, 6, alTocar,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        rv.setOnClickPendingIntent(R.id.cuerpo_eq, abrir);

        // Tocar ↻ → traerlo ahora mismo
        Intent ref = new Intent(ctx, WidgetEquipo.class).setAction(ACCION_REFRESCAR);
        PendingIntent pref = PendingIntent.getBroadcast(ctx, 7, ref,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        rv.setOnClickPendingIntent(R.id.refrescar_eq, pref);

        mgr.updateAppWidget(id, rv);
    }

    /** Escribe una raya con SU tamaño, SU color y SU negrita.
     *  La negrita va dentro del propio texto (StyleSpan): un widget no puede llamar a
     *  setTypeface desde fuera, así que se manda ya marcada. Si algo fallara al marcarla,
     *  se pinta el texto sin negrita — se ve peor, pero se ve. */
    static void escribe(RemoteViews rv, int idTexto, String texto, float sp, int color, boolean negrita) {
        String s = texto == null ? "" : texto;
        CharSequence salida = s;
        if (negrita) {
            try {
                SpannableString ss = new SpannableString(s);
                ss.setSpan(new StyleSpan(Typeface.BOLD), 0, s.length(), 0);
                salida = ss;
            } catch (Exception e) { salida = s; }
        }
        rv.setTextViewText(idTexto, salida);
        try { rv.setTextViewTextSize(idTexto, TypedValue.COMPLEX_UNIT_SP, sp); } catch (Exception e) { /* se queda el del layout */ }
        try { rv.setTextColor(idTexto, color); } catch (Exception e) { /* se queda el del layout */ }
    }

    /** El botón de esa raya: 📍 el mapa, 📄 el parte, 📋 el plan entero. Si esa raya no
     *  lleva a ningún sitio propio (un aviso, un "… y N más", una línea suelta), NO SE
     *  PINTA BOTÓN: un botón que no hace nada sería peor que no tener botón. */
    private void ponBoton(Context ctx, RemoteViews rv, int idWidget, int i, Accion a) {
        if (a == null || !a.tieneBoton()) {
            rv.setViewVisibility(IDS_BOTONES[i], android.view.View.GONE);
            return;
        }
        rv.setTextViewText(IDS_BOTONES[i], a.icono());
        rv.setContentDescription(IDS_BOTONES[i], a.queHace());
        rv.setViewVisibility(IDS_BOTONES[i], android.view.View.VISIBLE);
        Intent in = new Intent(ctx, AccionActivity.class)
                .setData(Uri.parse("azkarwidget://equipo/" + idWidget + "/" + i))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(AccionActivity.EXTRA_TIPO, a.tipo)
                .putExtra(AccionActivity.EXTRA_URI, a.uri)
                .putExtra(AccionActivity.EXTRA_QUE, a.queHace());
        PendingIntent pi = PendingIntent.getActivity(ctx, COD_BOTON + i, in,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        rv.setOnClickPendingIntent(IDS_BOTONES[i], pi);
    }
}
