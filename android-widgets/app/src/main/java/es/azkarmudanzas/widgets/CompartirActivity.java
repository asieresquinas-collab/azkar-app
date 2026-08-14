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
                    // 1) ¿viene como texto suelto?
                    CharSequence cs = in.getCharSequenceExtra(Intent.EXTRA_TEXT);
                    if (cs != null) texto = cs.toString();

                    // 2) ¿o como archivo? (el .txt del "Exportar chat", o el .zip del iPhone)
                    if (texto.trim().isEmpty()) {
                        Uri uri = null;
                        Object p = in.getParcelableExtra(Intent.EXTRA_STREAM);
                        if (p instanceof Uri) uri = (Uri) p;
                        if (uri == null && in.getData() != null) uri = in.getData();
                        if (uri != null) {
                            nombreArchivo = nombreDe(uri);
                            byte[] datos = leerUri(uri);
                            if (datos != null) {
                                if (nombreArchivo.toLowerCase().endsWith(".zip")) texto = txtDentroDelZip(datos);
                                else texto = new String(datos, StandardCharsets.UTF_8);
                            }
                        }
                    }
                    // el asunto suele traer «Chat de WhatsApp con Fulano»
                    if (nombreArchivo.isEmpty()) {
                        String asunto = in.getStringExtra(Intent.EXTRA_SUBJECT);
                        if (asunto != null) nombreArchivo = asunto;
                    }

                    if (texto == null || texto.trim().isEmpty()) { fin("No he podido leer la conversación. Prueba con «Exportar chat» (sin archivos)."); return; }
                    if (texto.length() > 900000) texto = texto.substring(texto.length() - 900000); // lo más reciente

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
                        fin(err.isEmpty() ? ("No se ha podido guardar (HTTP " + code + ")") : err);
                        return;
                    }
                    String quien = j.optString("contacto", "");
                    String ref = j.optString("ref", "");
                    int n = j.optInt("guardados", j.optInt("total", 0));
                    String msg = "Guardado el WhatsApp de " + (quien.isEmpty() ? "ese cliente" : quien)
                            + " (" + n + " mensajes)"
                            + (ref == null || ref.isEmpty() || "null".equals(ref) ? " — sin ficha que le cuadre" : " → ficha " + ref);
                    fin(msg);
                } catch (Exception e) {
                    fin("No se ha podido guardar: " + e.getMessage());
                }
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
