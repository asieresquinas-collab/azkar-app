package es.azkarmudanzas.widgets;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.AlarmClock;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;

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
 *     azkarwidget://alarma?h=7&m=30&t=Pastillas&d=2,3,4,5,6,7,1         → poner, que se repita esos días
 *     …&id=alp_…                                                        → (v1.38) su número: no entra dos veces
 *     azkarwidget://alarma?q=recoger                                    → (v1.38) mete todas las que tiene apuntadas el servidor
 *
 * v1.38 — QUE LAS META ESTA APP, TODAS. Asier (2-nov-2026, noche) volvió a pedir las nueve y entró una: la app de
 * Azkarin no se había cambiado a la versión nueva (no lo hace con el chat abierto). Ahora cada alarma que pide va
 * también a la cola del servidor con su número, y esta app la mete en el reloj con sus días: al momento si se lo
 * pide la pantalla (q=recoger), y si no al abrirla, por la burbuja o al refrescarse los widgets. La que ya entró
 * (por su número) no se vuelve a poner.
 *
 * v1.37 — QUE SE REPITAN. Asier (2-nov-2026): «ponme estas alarmas para todos los días, cada una con su
 * nombre» (nueve). Se ponían para una sola vez. Ahora la orden puede llevar los días (d=…, como los cuenta
 * Android: domingo 1, lunes 2… sábado 7) y el reloj la repite esos días. Y la burbuja las pone TODAS cuando
 * Azkarin manda varias de golpe (antes, solo la última).
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
        return aplicar(ctx, modo, hora, minutos, texto, null);
    }

    /** v1.37 · los días que se repite (domingo 1 … sábado 7). Vacío o null = una sola vez. */
    public static String aplicar(Context ctx, String modo, int hora, int minutos, String texto, ArrayList<Integer> dias) {
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
        final boolean repite = dias != null && !dias.isEmpty();
        final String cuando = repite ? " (" + textoDias(dias) + ")" : "";
        try {
            Intent sola = new Intent(AlarmClock.ACTION_SET_ALARM);
            sola.putExtra(AlarmClock.EXTRA_HOUR, hora);
            sola.putExtra(AlarmClock.EXTRA_MINUTES, minutos);
            sola.putExtra(AlarmClock.EXTRA_MESSAGE, texto);
            if (repite) sola.putIntegerArrayListExtra(AlarmClock.EXTRA_DAYS, dias);
            sola.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
            sola.putExtra(AlarmClock.EXTRA_VIBRATE, true);
            sola.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(sola);
            return "⏰ Alarma puesta a las " + hhmm + " · " + texto + cuando;
        } catch (Exception e) { /* algunos relojes obligan a confirmar: plan B */ }

        try {
            Intent conReloj = new Intent(AlarmClock.ACTION_SET_ALARM);
            conReloj.putExtra(AlarmClock.EXTRA_HOUR, hora);
            conReloj.putExtra(AlarmClock.EXTRA_MINUTES, minutos);
            conReloj.putExtra(AlarmClock.EXTRA_MESSAGE, texto);
            if (repite) conReloj.putIntegerArrayListExtra(AlarmClock.EXTRA_DAYS, dias);
            conReloj.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(conReloj);
            return "Tu reloj pide confirmar: dale a GUARDAR (" + hhmm + cuando + ").";
        } catch (Exception e2) {
            return "No he podido abrir el reloj para la alarma de las " + hhmm + ".";
        }
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        int hora = -1, minutos = 0;
        String texto = "Azkar", modo = "poner", id = "";
        boolean forzar = false;   // v1.38 · tocada a mano en la tarjeta: se pone aunque ya entrara (igual la quitó él)
        ArrayList<Integer> dias = null;
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
                dias = diasDe(d.getQueryParameter("d"));
                String i2 = d.getQueryParameter("id");
                if (i2 != null) id = i2.trim();
                forzar = "1".equals(d.getQueryParameter("f"));
            } else if (in != null) {
                hora = in.getIntExtra("azkar_hora", -1);
                minutos = in.getIntExtra("azkar_min", 0);
                String t = in.getStringExtra("azkar_texto");
                if (t != null && t.trim().length() > 0) texto = t.trim();
                String q = in.getStringExtra("azkar_modo");
                if (q != null && q.trim().length() > 0) modo = q.trim();
            }
        } catch (Exception e) { hora = -1; }

        // v1.38 · «recoger»: que meta todas las que le ha apuntado Azkarin. Se trae la lista en otro hilo y se ponen
        //  AQUÍ, con esta pantalla (invisible) todavía abierta: Android no deja a una app abrir el reloj desde segundo
        //  plano, así que la pantalla se queda hasta que entra la última, y entonces se cierra.
        if (modo.toLowerCase().startsWith("recog")) {
            recogerAqui();
            return;
        }
        // v1.38 · la que ya entró (por su número) no se pone otra vez
        if (id.length() > 0 && !forzar && Datos.yaPuesta(this, id)) {
            aviso("⏰ Esa alarma ya la tenías puesta.");
            Datos.avisarPuesta(this, id);
            finish();
            return;
        }
        String hecho = aplicar(this, modo, hora, minutos, texto, dias);
        if (id.length() > 0 && hecho != null && hecho.startsWith("⏰")) { Datos.apuntarPuesta(this, id); Datos.avisarPuesta(this, id); }
        aviso(hecho);
        finish();
    }

    private final android.os.Handler ui = new android.os.Handler(android.os.Looper.getMainLooper());
    private boolean cerrada = false;
    private volatile boolean conLlave = false;   // v1.38 · esta pantalla tiene la recogida (nadie más mete alarmas a la vez)

    private void soltarLlave() { if (conLlave) { conLlave = false; Datos.acabarRecogida(); } }

    @Override
    protected void onDestroy() { cerrada = true; soltarLlave(); super.onDestroy(); }

    /** v1.38 · trae del servidor las alarmas apuntadas y las mete en el reloj una a una (con esta pantalla abierta). */
    private void recogerAqui() {
        aviso("⏰ Metiendo en el reloj las alarmas que te ha puesto Azkarin…");
        final Context app = getApplicationContext();
        ui.postDelayed(new Runnable() { public void run() { cerrar(); } }, 40000);   // pase lo que pase, a los cuarenta segundos se cierra
        new Thread(new Runnable() { public void run() {
            // si hay otra recogida en marcha (un widget, la app), se espera a que acabe: así ninguna entra dos veces
            boolean tengo = false;
            for (int k = 0; k < 30 && !cerrada; k++) {
                if (Datos.empezarRecogida()) { tengo = true; break; }
                try { Thread.sleep(500); } catch (InterruptedException ie) { }
            }
            conLlave = tengo;   // con llave o sin ella (a los quince segundos), se sigue: la que ya entró la salta por su número
            if (cerrada) { soltarLlave(); return; }
            Datos.ultimaRecogida = System.currentTimeMillis();
            JSONArray lista = null;
            try { lista = Datos.alarmasPendientes(app); } catch (Exception e) { lista = null; }
            final JSONArray l = lista;
            ui.post(new Runnable() { public void run() { ponerDeLaLista(l, 0, 0, new JSONArray(), 0); } });
        } }).start();
    }

    private void ponerDeLaLista(final JSONArray lista, final int i, final int metidas, final JSONArray puestas, final int fallos) {
        if (cerrada) return;
        if (lista == null || i >= lista.length() || i >= 20) {
            final Context app = getApplicationContext();
            final JSONArray ids = puestas;
            new Thread(new Runnable() { public void run() { try { Datos.alarmasPuestas(app, ids); } catch (Exception e) { } } }).start();
            soltarLlave();
            if (lista == null) aviso("No he podido traer las alarmas del servidor. Abre la app de widgets y lo vuelvo a intentar.");
            else if (metidas == 0 && fallos == 0) aviso("⏰ No había ninguna alarma nueva que meter.");
            else aviso("⏰ " + metidas + (metidas == 1 ? " alarma metida" : " alarmas metidas") + " en el reloj" + (fallos > 0 ? " (" + fallos + " no han entrado: ábrelas desde la tarjeta de Azkarin)" : "") + ".");
            ui.postDelayed(new Runnable() { public void run() { cerrar(); } }, 1500);
            return;
        }
        JSONObject a = lista.optJSONObject(i);
        String id = a == null ? "" : a.optString("id", "");
        if (a == null || Datos.yaPuesta(this, id)) {
            if (a != null && id.length() > 0) puestas.put(id);
            ponerDeLaLista(lista, i + 1, metidas, puestas, fallos);
            return;
        }
        String hecho = aplicar(this, "poner", a.optInt("hora", -1), a.optInt("minutos", 0), a.optString("texto", "Azkar"), diasDeJson(a.optJSONArray("dias")));
        boolean ok = hecho != null && hecho.startsWith("⏰");
        if (ok) { puestas.put(id); Datos.apuntarPuesta(this, id); }
        final int m2 = metidas + (ok ? 1 : 0), f2 = fallos + (ok ? 0 : 1);
        ui.postDelayed(new Runnable() { public void run() { ponerDeLaLista(lista, i + 1, m2, puestas, f2); } }, 900);   // un respiro al reloj
    }

    private void cerrar() { if (cerrada) return; cerrada = true; soltarLlave(); try { finish(); } catch (Exception e) { } }

    /** v1.38 · los días de la lista JSON del servidor ([2,3,4,5,6,7,1]); vacío o null = una sola vez. */
    public static ArrayList<Integer> diasDeJson(JSONArray a) {
        if (a == null || a.length() == 0) return null;
        ArrayList<Integer> out = new ArrayList<Integer>();
        for (int i = 0; i < a.length(); i++) { int n = a.optInt(i, 0); if (n >= 1 && n <= 7 && !out.contains(n)) out.add(n); }
        return out.isEmpty() ? null : out;
    }

    /** «2,3,4,5,6,7,1» → [2,3,4,5,6,7,1] (solo del 1 al 7, sin repetir). Vacío → null (una sola vez). */
    public static ArrayList<Integer> diasDe(String s) {
        if (s == null || s.trim().length() == 0) return null;
        ArrayList<Integer> out = new ArrayList<Integer>();
        for (String p : s.split("[^0-9]+")) {
            if (p.length() == 0) continue;
            int n = entero(p, 0);
            if (n >= 1 && n <= 7 && !out.contains(n)) out.add(n);
        }
        return out.isEmpty() ? null : out;
    }

    /** Los días, en cristiano, para lo que se dice y se ve. */
    public static String textoDias(ArrayList<Integer> dias) {
        if (dias == null || dias.isEmpty()) return "una vez";
        if (dias.size() == 7) return "todos los días";
        String[] nombres = { "", "domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado" };
        int[] orden = { 2, 3, 4, 5, 6, 7, 1 };
        StringBuilder sb = new StringBuilder();
        int n = 0;
        for (int k : orden) if (dias.contains(k)) { if (n++ > 0) sb.append(", "); sb.append(nombres[k]); }
        if (dias.size() == 5 && !dias.contains(1) && !dias.contains(7)) return "de lunes a viernes";
        return sb.toString();
    }

    private static int entero(String s, int porDefecto) {
        try { return Integer.parseInt(String.valueOf(s).trim()); } catch (Exception e) { return porDefecto; }
    }

    private static String dos(int n) { return (n < 10 ? "0" : "") + n; }

    private void aviso(String t) {
        try { Toast.makeText(getApplicationContext(), t, Toast.LENGTH_LONG).show(); } catch (Exception e) { }
    }
}
