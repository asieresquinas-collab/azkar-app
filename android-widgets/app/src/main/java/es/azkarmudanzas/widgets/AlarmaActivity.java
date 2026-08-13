package es.azkarmudanzas.widgets;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.AlarmClock;
import android.widget.Toast;

/**
 * v1.20 — EL DESPERTADOR DE AZKARIN. Lo pidió Asier (13-ago-2026), después de que
 * Azkarin le ofreciera un «recordatorio de calendario» que no despierta a nadie:
 *   «¿puedes hacer que Azkarin me pueda activar el despertador del móvil, que yo le
 *    diga y ponerme alarmas?»
 *
 * Una página web NO puede poner alarmas: Android no se lo permite a ninguna. Pero
 * ESTA APK sí — es una aplicación de verdad. Así que el chat de Azkarin abre esta
 * pantalla (que no se ve) con la hora dentro:
 *
 *     azkarwidget://alarma?h=5&m=55&t=Salir%20a%20por%20la%20gr%C3%BAa
 *
 * y aquí se pone la alarma EN EL RELOJ DEL MÓVIL, sola, sin que Asier toque nada más.
 *
 * REGLA DURA (la de siempre en esta casa): NUNCA UN TOQUE MUERTO NI UNA MENTIRA.
 * Si el reloj no acepta ponerla sola (hay móviles y relojes de otras marcas que
 * obligan a confirmar), se abre el reloj con la alarma ESCRITA para que él solo dé a
 * guardar, y se le DICE lo que ha pasado. Si ni eso, se avisa en pantalla. Lo que
 * jamás puede pasar es que se dé por puesta una alarma que no existe.
 */
public class AlarmaActivity extends Activity {

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        int hora = -1, minutos = 0;
        String texto = "Azkar";
        try {
            Intent in = getIntent();
            Uri d = in == null ? null : in.getData();
            if (d != null && "azkarwidget".equals(d.getScheme())) {
                hora = entero(d.getQueryParameter("h"), -1);
                minutos = entero(d.getQueryParameter("m"), 0);
                String t = d.getQueryParameter("t");
                if (t != null && t.trim().length() > 0) texto = t.trim();
            } else if (in != null) {
                hora = in.getIntExtra("azkar_hora", -1);
                minutos = in.getIntExtra("azkar_min", 0);
                String t = in.getStringExtra("azkar_texto");
                if (t != null && t.trim().length() > 0) texto = t.trim();
            }
        } catch (Exception e) { hora = -1; }

        if (hora < 0 || hora > 23 || minutos < 0 || minutos > 59) {
            aviso("No he entendido la hora de la alarma.");
            finish();
            return;
        }
        if (texto.length() > 60) texto = texto.substring(0, 60);
        final String hhmm = dos(hora) + ":" + dos(minutos);

        // 1) LA BUENA: se pone sola en el reloj (SKIP_UI), sin tocar nada.
        try {
            Intent sola = new Intent(AlarmClock.ACTION_SET_ALARM);
            sola.putExtra(AlarmClock.EXTRA_HOUR, hora);
            sola.putExtra(AlarmClock.EXTRA_MINUTES, minutos);
            sola.putExtra(AlarmClock.EXTRA_MESSAGE, texto);
            sola.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
            sola.putExtra(AlarmClock.EXTRA_VIBRATE, true);
            sola.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(sola);
            aviso("⏰ Alarma puesta a las " + hhmm + " · " + texto);
            finish();
            return;
        } catch (Exception e) { /* algunos relojes no dejan: se va al plan B */ }

        // 2) PLAN B: se abre el reloj con la alarma escrita — él solo da a guardar.
        try {
            Intent conReloj = new Intent(AlarmClock.ACTION_SET_ALARM);
            conReloj.putExtra(AlarmClock.EXTRA_HOUR, hora);
            conReloj.putExtra(AlarmClock.EXTRA_MINUTES, minutos);
            conReloj.putExtra(AlarmClock.EXTRA_MESSAGE, texto);
            conReloj.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(conReloj);
            aviso("Tu reloj pide confirmar: dale a GUARDAR (" + hhmm + ")");
        } catch (Exception e2) {
            aviso("No he podido abrir el reloj para la alarma de las " + hhmm);
        }
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
