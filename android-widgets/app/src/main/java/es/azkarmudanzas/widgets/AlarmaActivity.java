package es.azkarmudanzas.widgets;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.AlarmClock;
import android.widget.Toast;

/**
 * v1.20 — EL DESPERTADOR DE AZKARIN. Lo pidió Asier (13-ago-2026):
 *   «¿puedes hacer que Azkarin me pueda activar el despertador del móvil, que yo le
 *    diga y ponerme alarmas?»
 *
 * v1.21 — Y SIN TOCAR NADA, Y TAMBIÉN QUITARLAS. Asier, al día siguiente:
 *   «¿por qué no haces que funcione sin tener que darle al botón, y que pueda
 *    quitarlas y ponerlas?»
 *
 * Una página web no puede tocar el despertador (Android no se lo permite a ninguna).
 * ESTA APK sí — es una aplicación de verdad. Y como Asier le habla a Azkarin por la
 * BURBUJA del widget, que YA es esta app, la alarma se pone sola en cuanto lo dice:
 * la burbuja llama a {@link #aplicar} y no hay botón que valga.
 *
 * Esta pantalla (que no se ve) queda para cuando la orden llega de fuera, por enlace:
 *     azkarwidget://alarma?h=5&m=55&t=Salir%20a%20por%20la%20gr%C3%BAa   → poner
 *     azkarwidget://alarma?q=quitar&h=5&m=55                            → quitar esa
 *     azkarwidget://alarma?q=ver                                        → ver las que hay
 *
 * REGLA DURA DE LA CASA: NUNCA UN TOQUE MUERTO NI UNA MENTIRA. Cada camino dice en
 * voz alta lo que ha pasado de verdad, y si el reloj del móvil no deja hacerlo solo,
 * se abre el reloj y se avisa. Jamás se da por hecha una alarma que no existe.
 */
public class AlarmaActivity extends Activity {

    /**
     * Pone, quita o enseña las alarmas. Devuelve, en cristiano, LO QUE HA PASADO DE
     * VERDAD — es lo que Azkarin le dice a Asier por voz, así que aquí no se adorna.
     */
    public static String aplicar(Context ctx, String modo, int hora, int minutos, String texto) {
        if (ctx == null) return "No he podido tocar el reloj.";
        String m = (modo == null ? "poner" : modo.trim().toLowerCase());
        if (texto == null || texto.trim().length() == 0) texto = "Azkar";
        if (texto.length() > 60) texto = texto.substring(0, 60);

        if (m.startsWith("ver") || m.startsWith("list")) {
            try {
                Intent ver = new Intent(AlarmClock.ACTION_SHOW_ALARMS);
                ver.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(ver);
                return "Te abro las alarmas del reloj.";
            } catch (Exception e) {
                return "No he podido abrir las alarmas del reloj.";
            }
        }

        if (hora < 0 || hora > 23 || minutos < 0 || minutos > 59) {
            return "No he entendido la hora de la alarma.";
        }
        final String hhmm = dos(hora) + ":" + dos(minutos);

        if (m.startsWith("quit") || m.startsWith("borr") || m.startsWith("cancel") || m.startsWith("dismiss")) {
            // QUITARLA: se le dice al reloj que descarte la alarma de esa hora.
            try {
                Intent fuera = new Intent(AlarmClock.ACTION_DISMISS_ALARM);
                fuera.putExtra(AlarmClock.EXTRA_ALARM_SEARCH_MODE, AlarmClock.ALARM_SEARCH_MODE_TIME);
                fuera.putExtra(AlarmClock.EXTRA_HOUR, hora);
                fuera.putExtra(AlarmClock.EXTRA_MINUTES, minutos);
                fuera.putExtra(AlarmClock.EXTRA_IS_PM, hora >= 12);
                fuera.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
                fuera.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(fuera);
                return "⏰ Quitada la alarma de las " + hhmm + ".";
            } catch (Exception e) {
                // Si el reloj no deja quitarla de una, se abre la lista y se DICE.
                try {
                    Intent ver = new Intent(AlarmClock.ACTION_SHOW_ALARMS);
                    ver.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(ver);
                    return "Tu reloj no me deja quitarla de una: te abro las alarmas y la quitas de la lista (" + hhmm + ").";
                } catch (Exception e2) {
                    return "No he podido quitar la alarma de las " + hhmm + ".";
                }
            }
        }

        // PONERLA: se pone sola en el reloj, sin confirmar nada.
        try {
            Intent sola = new Intent(AlarmClock.ACTION_SET_ALARM);
            sola.putExtra(AlarmClock.EXTRA_HOUR, hora);
            sola.putExtra(AlarmClock.EXTRA_MINUTES, minutos);
            sola.putExtra(AlarmClock.EXTRA_MESSAGE, texto);
            sola.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
            sola.putExtra(AlarmClock.EXTRA_VIBRATE, true);
            sola.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(sola);
            return "⏰ Alarma puesta a las " + hhmm + " · " + texto;
        } catch (Exception e) { /* algunos relojes obligan a confirmar: plan B */ }

        try {
            Intent conReloj = new Intent(AlarmClock.ACTION_SET_ALARM);
            conReloj.putExtra(AlarmClock.EXTRA_HOUR, hora);
            conReloj.putExtra(AlarmClock.EXTRA_MINUTES, minutos);
            conReloj.putExtra(AlarmClock.EXTRA_MESSAGE, texto);
            conReloj.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(conReloj);
            return "Tu reloj pide confirmar: dale a GUARDAR (" + hhmm + ").";
        } catch (Exception e2) {
            return "No he podido abrir el reloj para la alarma de las " + hhmm + ".";
        }
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        int hora = -1, minutos = 0;
        String texto = "Azkar", modo = "poner";
        try {
            Intent in = getIntent();
            Uri d = in == null ? null : in.getData();
            if (d != null && "azkarwidget".equals(d.getScheme())) {
                hora = entero(d.getQueryParameter("h"), -1);
                minutos = entero(d.getQueryParameter("m"), 0);
                String t = d.getQueryParameter("t");
                if (t != null && t.trim().length() > 0) texto = t.trim();
                String q = d.getQueryParameter("q");
                if (q != null && q.trim().length() > 0) modo = q.trim();
            } else if (in != null) {
                hora = in.getIntExtra("azkar_hora", -1);
                minutos = in.getIntExtra("azkar_min", 0);
                String t = in.getStringExtra("azkar_texto");
                if (t != null && t.trim().length() > 0) texto = t.trim();
                String q = in.getStringExtra("azkar_modo");
                if (q != null && q.trim().length() > 0) modo = q.trim();
            }
        } catch (Exception e) { hora = -1; }

        aviso(aplicar(this, modo, hora, minutos, texto));
        finish();
    }

    private static int entero(String s, int porDefecto) {
        try { return Integer.parseInt(String.valueOf(s).trim()); } catch (Exception e) { return porDefecto; }
    }

    private static String dos(int n) { return (n < 10 ? "0" : "") + n; }

    private void aviso(String t) {
        try { Toast.makeText(getApplicationContext(), t, Toast.LENGTH_LONG).show(); } catch (Exception e) { }
    }
}
