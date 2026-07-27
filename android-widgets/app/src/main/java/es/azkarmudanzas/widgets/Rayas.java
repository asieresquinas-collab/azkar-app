package es.azkarmudanzas.widgets;

import android.appwidget.AppWidgetManager;

/**
 * v1.15 — LAS CUENTAS DE LAS RAYAS, EN UN SOLO SITIO.
 *
 * Los dos paneles (el de "lo de hoy" y el del repaso) tienen que hacer exactamente lo
 * mismo: saber cuántas rayas caben de verdad, y colocar texto y botón SIEMPRE a la vez.
 * Si cada uno se lo hiciera por su cuenta, el día que se tocara uno el otro se quedaría
 * atrás y el botón de una raya podría acabar llamando a otra persona. Por eso está aquí
 * una sola vez y los dos lo llaman.
 */
public class Rayas {

    /** Lo que ocupa la cabecera (bordes + título con la ↻), en dp. */
    static final int ALTO_CABECERA_DP = 50;
    /** Lo que ocupa cada raya con su botoncito, en dp. */
    static final int ALTO_RAYA_DP = 25;
    /** Cuando Android no dice el tamaño (pasa en algunos lanzadores), se supone esto. */
    static final int FILAS_SI_NO_SE_SABE = 8;

    /** CUÁNTAS RAYAS CABEN DE VERDAD en el widget tal y como está puesto ahora mismo.
     *  Se mide con la altura MÍNIMA que Android garantiza (la de apaisado), así nunca
     *  pedimos más sitio del que hay y el "… y N más" cae SIEMPRE dentro de la pantalla.
     *  Si hubiera varios puestos, manda el más pequeño: mejor enseñar menos que mentir. */
    static int caben(AppWidgetManager mgr, int[] ids, int maxRayas) {
        return caben(mgr, ids, maxRayas, ALTO_CABECERA_DP, ALTO_RAYA_DP);
    }

    /** v1.16 · lo mismo, pero diciendo cuánto miden la cabecera y la raya en ESE panel.
     *  El panel grande de la tablet tiene las rayas de ALTURA FIJA (30dp) justamente para
     *  que esta cuenta sea EXACTA aunque unas rayas vayan en grande y otras normales. */
    static int caben(AppWidgetManager mgr, int[] ids, int maxRayas, int altoCabecera, int altoRaya) {
        if (altoRaya < 1) altoRaya = ALTO_RAYA_DP;
        int min = 0;
        if (ids != null && mgr != null) {
            for (int id : ids) {
                int dp = 0;
                try {
                    android.os.Bundle o = mgr.getAppWidgetOptions(id);
                    if (o != null) dp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
                } catch (Exception e) { /* nada */ }
                int filas = dp > 0 ? (dp - altoCabecera) / altoRaya : FILAS_SI_NO_SE_SABE;
                if (filas < 3) filas = 3;
                if (filas > maxRayas) filas = maxRayas;
                if (min == 0 || filas < min) min = filas;
            }
        }
        if (min == 0) min = FILAS_SI_NO_SE_SABE;
        if (min > maxRayas) min = maxRayas;
        return min;
    }

    /** EL MAPA DE LAS RAYAS cuando hay que meter un aviso delante: dice, para cada hueco
     *  del widget, qué raya de las de antes va ahí (-1 = el aviso). Se usa EL MISMO mapa
     *  para el texto Y para el botón.
     *
     *  Si hay que dejar una fuera, se deja una del MEDIO y se conserva la ÚLTIMA: la
     *  última suele ser el "… y N más", y perderla sería esconderle a Asier que hay más. */
    static int[] mapaConAviso(int cuantas, int filas, int maxRayas) {
        if (cuantas < 0) cuantas = 0;
        int cabe = filas > 0 ? Math.min(filas, maxRayas) : maxRayas;
        if (cabe < 2) cabe = 2;
        if (cuantas + 1 <= cabe) {
            int[] m = new int[cuantas + 1];
            m[0] = -1;
            for (int i = 1; i < m.length; i++) m[i] = i - 1;
            return m;
        }
        int[] m = new int[cabe];
        m[0] = -1;
        for (int i = 1; i < cabe - 1; i++) m[i] = i - 1;
        m[cabe - 1] = cuantas - 1;
        return m;
    }

    /** Coloca los textos según el mapa (el -1 es el aviso nuevo). */
    static String[] reordena(String[] lineas, int[] mapa, String aviso) {
        if (lineas == null) lineas = new String[0];
        String[] con = new String[mapa.length];
        for (int i = 0; i < mapa.length; i++) {
            con[i] = mapa[i] < 0 ? aviso : (mapa[i] < lineas.length ? lineas[mapa[i]] : "");
        }
        return con;
    }

    /** Coloca los botones con EL MISMO mapa que los textos. El aviso no lleva botón. */
    static Accion[] reordena(Accion[] acciones, int[] mapa) {
        Accion[] con = new Accion[mapa.length];
        for (int i = 0; i < mapa.length; i++) {
            con[i] = (mapa[i] < 0 || acciones == null || mapa[i] >= acciones.length) ? null : acciones[mapa[i]];
        }
        return con;
    }
}
