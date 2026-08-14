package es.azkarmudanzas.widgets;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipEntry;

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  «COMPARTIR CON AZKARIN»  ·  v1.23 · 14-ago-2026
 *
 *  Asier: «necesito que Azkarin pueda ver los mensajes de WhatsApp. No quiero que
 *  conteste ni haga nada más que mirarlos, para que esté al tanto de todo lo que se
 *  habla con los clientes y pueda poner en los partes las horas y las cosas que se
 *  han dicho, y no tener que mandar yo el mensaje escrito». Y, muy claro: «no me
 *  quiero jugar que me bloqueen».
 *
 *  🛑 ESTO NO SE CONECTA A WHATSAPP. Ni sesión, ni número vinculado, ni WhatsApp Web,
 *  ni nada que WhatsApp pueda ver. Lo único que hace es aparecer en la lista de
 *  «Compartir» del móvil: cuando Asier abre un chat, le da a Exportar chat (o
 *  mantiene pulsado un mensaje y Compartir) y elige Azkarin, esta pantalla coge ese
 *  texto y lo manda a su propio servidor. Es exactamente lo mismo que si lo copiara
 *  y lo pegara en el chat de Azkarin — solo que en dos toques. Por eso no hay ningún
 *  riesgo de que le cierren el número.
 *
 *  Y es de MIRAR, no de contestar: desde aquí no se manda nada a nadie.
 *
 *  Aguanta las tres formas en que llega:
 *    · texto pelado (mantener pulsado unos mensajes → Compartir)
 *    · un .txt   (Exportar chat sin archivos, Android)
 *    · un .zip   (Exportar chat, iPhone) — se saca el .txt de dentro
 * ══════════════════════════════════════════════════════════════════════════════
 */
public class CompartirActivity extends Activity {

    // v1.24 · Asier probó el 14-ago a las 22:00 compartiendo mensajes SUELTOS (mantener
    // pulsado → Compartir) y le salió un «eso no tiene el formato del export». Mal:
    // él quiere que Azkarin se entere, no pelearse con formatos. Ahora, si el servidor
    // no sabe de quién es la conversación, se le PREGUNTA aquí mismo y se reenvía.
    private String _textoPendiente = "";
    private String _nombreArchivo = "";

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        final Intent in = getIntent();
        if (in == null) { fin("No ha llegado nada que guardar."); return; }

        aviso("Guardando la conversación…");

        final String accion = in.getAction() == null ? "" : in.getAction();
        new Thread(new Runnable() {
            public void run() {
                String texto = "";
                String nombreArchivo = "";
                try {
                    // ── v1.25 · EL ARCHIVO MANDA (Asier, 14-ago, 22:03) ──────────────
                    // Él SÍ usó «Exportar chat», y aun así le salió el aviso de que no
                    // tenía formato. El motivo: al exportar, WhatsApp manda el ARCHIVO y
                    // ADEMÁS un texto de acompañamiento, y esto cogía el texto — que no
                    // es la conversación. Ahora se mira SIEMPRE primero el archivo; el
                    // texto solo se usa si no hay archivo (mensajes sueltos compartidos).
                    Uri uri = null;
                    Object p = in.getParcelableExtra(Intent.EXTRA_STREAM);
                    if (p instanceof Uri) uri = (Uri) p;
                    if (uri == null && in.getData() != null) uri = in.getData();
                    if (uri != null) {
                        nombreArchivo = nombreDe(uri);
                        byte[] datos = leerUri(uri);
                        if (datos != null && datos.length > 0) {
                            // El .zip se reconoce por dentro (empieza por «PK»), no por el
                            // nombre: muchas veces el nombre no llega o llega sin extensión.
                            boolean esZip = datos.length > 4 && datos[0] == 0x50 && datos[1] == 0x4B;
                            texto = esZip ? txtDentroDelZip(datos) : new String(datos, StandardCharsets.UTF_8);
                        }
                    }

                    // Sin archivo (o vacío): entonces sí, lo que venga como texto.
                    if (texto == null || texto.trim().isEmpty()) {
                        CharSequence cs = in.getCharSequenceExtra(Intent.EXTRA_TEXT);
                        if (cs != null) texto = cs.toString();
                    }
                    // el asunto suele traer «Chat de WhatsApp con Fulano»
                    if (nombreArchivo.isEmpty()) {
                        String asunto = in.getStringExtra(Intent.EXTRA_SUBJECT);
                        if (asunto != null) nombreArchivo = asunto;
                    }

                    if (texto == null || texto.trim().isEmpty()) { fin("No he podido leer la conversación. Prueba con «Exportar chat» (sin archivos)."); return; }
                    if (texto.length() > 900000) texto = texto.substring(texto.length() - 900000); // lo más reciente

                    _textoPendiente = texto;
                    _nombreArchivo = nombreArchivo;

                    String jwt = Datos.prefs(CompartirActivity.this).getString("jwt", "");
                    if (jwt.isEmpty()) { fin("Primero entra en la app de Azkar con tu usuario, y vuelve a compartir."); return; }

                    HttpURLConnection c = Datos.conecta(Datos.BASE + "/api/widget/whatsapp", "POST", jwt);
                    c.setDoOutput(true);
                    JSONObject cuerpo = new JSONObject();
                    cuerpo.put("texto", texto);
                    cuerpo.put("filename", nombreArchivo);
                    OutputStream os = c.getOutputStream();
                    os.write(cuerpo.toString().getBytes(StandardCharsets.UTF_8));
                    os.close();
                    int code = c.getResponseCode();
                    String resp = Datos.leerTodo(code < 400 ? c.getInputStream() : c.getErrorStream());
                    JSONObject j;
                    try { j = new JSONObject(resp); } catch (Exception e) { j = new JSONObject(); }

                    if (code >= 400 || !j.optBoolean("ok", false)) {
                        String err = j.optString("error", "");
                        if (j.optBoolean("falta_contacto", false)) { preguntarDeQuien(); return; }
                        fin(err.isEmpty() ? ("No se ha podido guardar (HTTP " + code + ")") : err);
                        return;
                    }
                    String quien = j.optString("contacto", "");
                    String ref = j.optString("ref", "");
                    int n = j.optInt("guardados", j.optInt("total", 0));
                    String msg = "Guardado el WhatsApp de " + (quien.isEmpty() ? "ese cliente" : quien)
                            + " (" + n + " mensajes)"
                            + (ref == null || ref.isEmpty() || "null".equals(ref) ? " — sin ficha que le cuadre" : " → ficha " + ref);
                    if (j.optBoolean("suelto", false)) msg += ". Ojo: venía sin fechas, así que sé lo que pone pero no a qué hora.";
                    fin(msg);
                } catch (Exception e) {
                    fin("No se ha podido guardar: " + e.getMessage());
                }
            }
        }).start();
    }

    /** «¿De quién es esto?» — se pregunta y se manda otra vez con el nombre. */
    private void preguntarDeQuien() {
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            public void run() {
                try {
                    final android.widget.EditText caja = new android.widget.EditText(CompartirActivity.this);
                    caja.setHint("Nombre del cliente o su teléfono");
                    caja.setSingleLine(true);
                    new android.app.AlertDialog.Builder(CompartirActivity.this)
                        .setTitle("¿De quién es esta conversación?")
                        .setMessage("Eso venía sin nombres. Dime de qué cliente es y lo guardo con él.")
                        .setView(caja)
                        .setCancelable(false)
                        .setPositiveButton("Guardar", new android.content.DialogInterface.OnClickListener() {
                            public void onClick(android.content.DialogInterface d, int w) {
                                String nombre = caja.getText().toString().trim();
                                if (nombre.isEmpty()) { fin("Sin nombre no lo puedo guardar."); return; }
                                mandar(_textoPendiente, _nombreArchivo, nombre);
                            }
                        })
                        .setNegativeButton("Dejarlo", new android.content.DialogInterface.OnClickListener() {
                            public void onClick(android.content.DialogInterface d, int w) { fin("No he guardado nada."); }
                        })
                        .show();
                } catch (Exception e) { fin("No he podido preguntarte de quién es: " + e.getMessage()); }
            }
        });
    }

    /** Manda al servidor, ya con el nombre del cliente delante. */
    private void mandar(final String texto, final String archivo, final String contacto) {
        aviso("Guardando…");
        new Thread(new Runnable() {
            public void run() {
                try {
                    String jwt = Datos.prefs(CompartirActivity.this).getString("jwt", "");
                    if (jwt.isEmpty()) { fin("Primero entra en la app de Azkar con tu usuario."); return; }
                    HttpURLConnection c = Datos.conecta(Datos.BASE + "/api/widget/whatsapp", "POST", jwt);
                    c.setDoOutput(true);
                    JSONObject cuerpo = new JSONObject();
                    cuerpo.put("texto", texto);
                    cuerpo.put("filename", archivo);
                    cuerpo.put("contacto", contacto);
                    OutputStream os = c.getOutputStream();
                    os.write(cuerpo.toString().getBytes(StandardCharsets.UTF_8));
                    os.close();
                    int code = c.getResponseCode();
                    String resp = Datos.leerTodo(code < 400 ? c.getInputStream() : c.getErrorStream());
                    JSONObject j;
                    try { j = new JSONObject(resp); } catch (Exception e) { j = new JSONObject(); }
                    if (code >= 400 || !j.optBoolean("ok", false)) {
                        String err = j.optString("error", "");
                        fin(err.isEmpty() ? ("No se ha podido guardar (HTTP " + code + ")") : err);
                        return;
                    }
                    String ref = j.optString("ref", "");
                    String msg = "Guardado con " + contacto
                            + (ref == null || ref.isEmpty() || "null".equals(ref) ? " — sin ficha que le cuadre" : " → ficha " + ref);
                    if (j.optBoolean("suelto", false)) msg += ". Venía sin fechas: sé lo que pone, no a qué hora.";
                    fin(msg);
                } catch (Exception e) { fin("No se ha podido guardar: " + e.getMessage()); }
            }
        }).start();
    }

    // ── leer el archivo que nos comparten ────────────────────────────────────
    private byte[] leerUri(Uri uri) {
        try {
            InputStream is = getContentResolver().openInputStream(uri);
            if (is == null) return null;
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int leidos, total = 0;
            while ((leidos = is.read(buf)) > 0) {
                bos.write(buf, 0, leidos);
                total += leidos;
                if (total > 8 * 1024 * 1024) break;   // 8 MB: de sobra para un chat entero
            }
            is.close();
            return bos.toByteArray();
        } catch (Exception e) { return null; }
    }

    /** El iPhone comparte el chat dentro de un .zip: se saca el .txt de dentro. */
    private String txtDentroDelZip(byte[] datos) {
        try {
            ZipInputStream z = new ZipInputStream(new java.io.ByteArrayInputStream(datos));
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) {
                if (e.getName() != null && e.getName().toLowerCase().endsWith(".txt")) {
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = z.read(buf)) > 0) bos.write(buf, 0, n);
                    z.close();
                    return new String(bos.toByteArray(), StandardCharsets.UTF_8);
                }
            }
            z.close();
        } catch (Exception ex) { /* si no se puede abrir, se avisa arriba */ }
        return "";
    }

    private String nombreDe(Uri uri) {
        try {
            android.database.Cursor cur = getContentResolver().query(uri, null, null, null, null);
            if (cur != null) {
                int i = cur.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                String n = "";
                if (i >= 0 && cur.moveToFirst()) n = cur.getString(i);
                cur.close();
                if (n != null && !n.isEmpty()) return n;
            }
        } catch (Exception e) { /* da igual: se saca el contacto de los mensajes */ }
        String p = uri.getLastPathSegment();
        return p == null ? "" : p;
    }

    // ── avisar y cerrar (siempre en el hilo de la pantalla) ──────────────────
    private void aviso(final String t) {
        try { Toast.makeText(this, t, Toast.LENGTH_SHORT).show(); } catch (Exception e) { }
    }

    private void fin(final String t) {
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            public void run() {
                try { Toast.makeText(CompartirActivity.this, t, Toast.LENGTH_LONG).show(); } catch (Exception e) { }
                finish();
            }
        });
    }
}
