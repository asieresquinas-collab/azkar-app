package es.azkarmudanzas.widgets;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import java.util.List;

/**
 * v1.15 — EL BOTÓN DE CADA COSA. Lo pidió Asier:
 *   «cada cosa un botón para llegar a donde tiene que llegar… pone llamar a este número
 *    que no ha llamado, pues un botón para llamar a ese número; pero yo tengo una
 *    centralita y una aplicación con la que llamo (ZOIPER): que me abra esa aplicación
 *    directamente. Y luego los otros, pues cada uno en su sitio.»
 *
 * Esta pantalla no se ve: recibe el toque, abre lo que toca y se cierra.
 *
 * REGLA DURA: NUNCA UN TOQUE MUERTO. Si Zoiper no está o no coge el número, se abre el
 * marcador de siempre Y SE DICE lo que ha pasado. Si tampoco eso, el número se copia al
 * portapapeles y se avisa. Un botón que no hace nada y no lo explica sería peor que no
 * tener botón.
 */
public class AccionActivity extends Activity {

    static final String EXTRA_TIPO = "azkar_tipo";   // llamar | correo | ficha | repaso | app
    static final String EXTRA_URI  = "azkar_uri";
    static final String EXTRA_QUE  = "azkar_que";    // "Llamar a Ricardo" — para el avisito

    /** El de Google Play. Si algún día cambia, más abajo se busca por el nombre igualmente. */
    static final String PAQUETE_ZOIPER = "com.zoiper.android.app";
    static final String PREFS = "azkar_widgets";
    static final String CLAVE_ZOIPER = "paq_zoiper";

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Intent in = getIntent();
        String tipo = in == null ? null : in.getStringExtra(EXTRA_TIPO);
        String uri = in == null ? null : in.getStringExtra(EXTRA_URI);
        String que = in == null ? null : in.getStringExtra(EXTRA_QUE);
        if (que == null) que = "";
        try {
            if (uri == null || uri.isEmpty()) {
                abrirSinMas(deReserva(tipo), "", tipo);
            } else if ("llamar".equals(tipo)) {
                llamar(soloNumero(uri), que);
            } else {
                abrirSinMas(uri, que, tipo);
            }
        } catch (Exception e) {
            aviso("No he podido abrirlo: " + e.getMessage());
        }
        finish();
    }

    // ── LLAMAR: primero Zoiper, y si no se puede, se dice ────────────────────────
    private void llamar(String num, String que) {
        if (num == null || num.length() < 3) { aviso("Esa cosa no tiene un teléfono al que llamar"); return; }
        String paq = paqueteZoiper(this);
        if (paq != null) {
            // Se prueban en orden las formas de decirle a Zoiper "llama a este número".
            // No hay una sola que funcione en todas las versiones: se va probando y la
            // primera que Zoiper acepte, esa vale.
            // (ACTION_CALL queda fuera a propósito: exige el permiso CALL_PHONE, y pedirle
            //  permisos a Asier desde una pantalla invisible sería peor que abrir Zoiper.)
            Intent[] intentos = new Intent[]{
                    new Intent(Intent.ACTION_VIEW, Uri.parse("tel:" + num)),
                    new Intent(Intent.ACTION_VIEW, Uri.parse("sip:" + num)),
                    new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + num)),
                    new Intent(Intent.ACTION_VIEW, Uri.parse("zoiper://" + num))
            };
            for (Intent i : intentos) {
                i.setPackage(paq);
                if (arranca(i)) { aviso("📞 " + (que.isEmpty() ? num : que) + " — por Zoiper"); return; }
            }
            // Zoiper está instalado pero no coge el número por ninguna vía: se abre Zoiper
            // y se le deja el número copiado, diciéndoselo. Nunca se le deja colgado.
            Intent li = null;
            try { li = getPackageManager().getLaunchIntentForPackage(paq); } catch (Exception e) { /* nada */ }
            if (li != null) {
                li.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (arranca(li)) { copia(num); aviso("Zoiper no coge el número solo. Te lo he copiado: " + num); return; }
            }
        }
        // Sin Zoiper (o Zoiper no ha querido): el marcador de siempre, DICIÉNDOLO.
        Intent ver = new Intent(Intent.ACTION_VIEW, Uri.parse("tel:" + num)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (arranca(ver)) { aviso(paq == null ? "No he encontrado Zoiper — te abro el marcador" : "Zoiper no lo ha cogido — te abro el marcador"); return; }
        Intent marcar = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + num)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (arranca(marcar)) { aviso(paq == null ? "No he encontrado Zoiper — te abro el marcador" : "Zoiper no lo ha cogido — te abro el marcador"); return; }
        copia(num);
        aviso("No he podido abrir ningún marcador. Te he copiado el número: " + num);
    }

    // ── CORREO / FICHA / MAPA / PARTE / PORTAL / APP: cada uno a su sitio ────────
    private void abrirSinMas(String uri, String que, String tipo) {
        if (uri == null || uri.isEmpty()) { aviso("Eso no lleva a ningún sitio"); return; }
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (arranca(i)) return;
        if (uri.startsWith("mailto:")) {
            String correo = uri.substring(7);
            Intent alt = new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:" + correo)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (arranca(alt)) return;
            copia(correo);
            aviso("No tienes app de correo. Te he copiado la dirección: " + correo);
            return;
        }
        // Lo último que nunca falla. OJO (v1.16): el de reserva DEPENDE DE QUIÉN TOCA.
        // En la tablet de los chicos no existe la app de Asier y no debe abrirse nunca:
        // ahí lo de reserva es el plan de trabajo de ellos.
        String reserva = deReserva(tipo);
        if (!reserva.equals(uri)) {
            Intent r = new Intent(Intent.ACTION_VIEW, Uri.parse(reserva)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (arranca(r)) { aviso("No he podido abrir eso — te abro " + (esDelEquipo(tipo) ? "el plan de trabajo" : "el repaso")); return; }
        }
        if (!esDelEquipo(tipo) && arranca(AbrirAzkar.elRepaso(this))) { aviso("No he podido abrir eso — te abro el repaso"); return; }
        copia(uri);
        aviso("No he podido abrir " + (que.isEmpty() ? uri : que) + ". Te he copiado el enlace.");
    }

    /** v1.16 · ¿esto es del panel de los chicos? (mapa, parte del día, plan entero) */
    static boolean esDelEquipo(String tipo) {
        return "mapa".equals(tipo) || "parte".equals(tipo) || "portal".equals(tipo);
    }

    /** v1.16 · a dónde ir cuando lo de arriba no se puede abrir: el plan de trabajo si el
     *  toque venía del panel del equipo (y hay enlace puesto), y el repaso de Asier si no. */
    private String deReserva(String tipo) {
        if (esDelEquipo(tipo)) {
            String portal = Datos.enlaceEquipo(this);
            if (!portal.isEmpty()) return portal;
        }
        return Datos.URL_APP_REPASO;
    }

    // ── Herramientas ────────────────────────────────────────────────────────────
    /** Lanza si de verdad hay quien lo atienda. Devuelve false en vez de reventar. */
    private boolean arranca(Intent i) {
        if (i == null) return false;
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (getPackageManager().resolveActivity(i, 0) == null) return false;
            startActivity(i);
            return true;
        } catch (Exception e) { return false; }
    }

    /** El paquete de Zoiper si está instalado; null si no está. Se recuerda para no
     *  rebuscar en cada toque, pero se comprueba que siga instalado. */
    static String paqueteZoiper(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String guardado = sp.getString(CLAVE_ZOIPER, "");
        if (guardado != null && !guardado.isEmpty() && estaInstalado(ctx, guardado)) return guardado;
        if (estaInstalado(ctx, PAQUETE_ZOIPER)) { sp.edit().putString(CLAVE_ZOIPER, PAQUETE_ZOIPER).apply(); return PAQUETE_ZOIPER; }
        try {
            PackageManager pm = ctx.getPackageManager();
            Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> apps = pm.queryIntentActivities(main, 0);
            for (ResolveInfo ri : apps) {
                if (ri.activityInfo == null) continue;
                String p = String.valueOf(ri.activityInfo.packageName).toLowerCase();
                CharSequence et = ri.loadLabel(pm);
                String n = (et == null ? "" : et.toString()).toLowerCase();
                if (p.contains("zoiper") || n.contains("zoiper")) {
                    sp.edit().putString(CLAVE_ZOIPER, ri.activityInfo.packageName).apply();
                    return ri.activityInfo.packageName;
                }
            }
        } catch (Exception e) { /* seguimos sin Zoiper */ }
        sp.edit().remove(CLAVE_ZOIPER).apply();
        return null;
    }

    static boolean estaInstalado(Context ctx, String paquete) {
        try { ctx.getPackageManager().getPackageInfo(paquete, 0); return true; }
        catch (Exception e) { return false; }
    }

    /** "tel:626768600" → "626768600". Se quedan solo cifras, + y * # (extensiones). */
    static String soloNumero(String uri) {
        String s = String.valueOf(uri);
        int i = s.indexOf(':');
        if (i >= 0) s = s.substring(i + 1);
        return s.replaceAll("[^0-9+*#]", "");
    }

    private void copia(String texto) {
        try {
            ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cb != null) cb.setPrimaryClip(ClipData.newPlainText("Azkar", texto));
        } catch (Exception e) { /* nada */ }
    }

    private void aviso(String texto) {
        try { Toast.makeText(this, texto, Toast.LENGTH_LONG).show(); } catch (Exception e) { /* nada */ }
    }
}
