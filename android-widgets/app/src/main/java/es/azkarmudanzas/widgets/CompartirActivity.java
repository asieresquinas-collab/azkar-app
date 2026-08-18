package es.azkarmudanzas.widgets;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import org.json.JSONArray;
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
 *  Aguanta las formas en que llega:
 *    · texto pelado (mantener pulsado unos mensajes → Compartir)
 *    · un .txt   (Exportar chat sin archivos, Android)
 *    · un .zip   (Exportar chat, iPhone) — se saca el .txt Y LAS FOTOS de dentro
 *    · VARIOS archivos a la vez (Exportar chat CON archivos, Android: el .txt
 *      y las fotos llegan como archivos sueltos) — v1.26
 *
 *  ── v1.26 · LAS FOTOS TAMBIÉN VIAJAN (Asier, 18-ago-2026) ────────────────────
 *  «arréglamelo por favor para que se pueda hacer por el camino que yo usé».
 *  El camino que él usa es ESTE (Compartir → Azkarin), y por aquí solo viajaba el
 *  texto: las fotos de los muebles se quedaban en el móvil y Azkarin no podía
 *  verlas. Ahora se recogen (de los archivos sueltos del export de Android y de
 *  dentro del ZIP del iPhone), se mandan con el texto, y el servidor las guarda en
 *  la carpeta del cliente en Drive (backend 2.7.396). Con topes para no atragantar
 *  el móvil ni el servidor: 30 fotos como mucho, ninguna de más de 6 MB, y no más
 *  de 24 MB en total. El aviso final dice LA VERDAD: cuántas fotos venían, cuántas
 *  se han guardado, y si el servidor todavía no sabe guardarlas, también.
 * ══════════════════════════════════════════════════════════════════════════════
 */
public class CompartirActivity extends Activity {

    // v1.24 · Asier probó el 14-ago a las 22:00 compartiendo mensajes SUELTOS (mantener
    // pulsado → Compartir) y le salió un «eso no tiene el formato del export». Mal:
    // él quiere que Azkarin se entere, no pelearse con formatos. Ahora, si el servidor
    // no sabe de quién es la conversación, se le PREGUNTA aquí mismo y se reenvía.
    private String _textoPendiente = "";
    private String _nombreArchivo = "";

    // v1.26 · las fotos que van con la conversación (se reusan si hay que reenviar)
    private static final int MAX_FOTOS = 30;
    private static final int MAX_BYTES_FOTO = 6 * 1024 * 1024;    // 6 MB por foto
    private static final int MAX_BYTES_TOTAL = 24 * 1024 * 1024;  // 24 MB entre todas
    private final JSONArray _fotos = new JSONArray();
    private int _bytesFotos = 0;
    private int _fotosVistas = 0;   // cuántas imágenes VENÍAN (aunque alguna no quepa)

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
                    //
                    // ── v1.26 · Y PUEDEN SER VARIOS ARCHIVOS ─────────────────────────
                    // «Exportar chat CON archivos» en Android no manda un zip: manda el
                    // .txt y cada foto como archivos SUELTOS (ACTION_SEND_MULTIPLE).
                    // Se miran todos: el texto es la conversación, las fotos van aparte.
                    java.util.ArrayList<Uri> uris = new java.util.ArrayList<Uri>();
                    if (Intent.ACTION_SEND_MULTIPLE.equals(accion)) {
                        java.util.ArrayList<android.os.Parcelable> ps = in.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                        if (ps != null) for (android.os.Parcelable q : ps) if (q instanceof Uri) uris.add((Uri) q);
                    } else {
                        Object p = in.getParcelableExtra(Intent.EXTRA_STREAM);
                        if (p instanceof Uri) uris.add((Uri) p);
                        if (uris.isEmpty() && in.getData() != null) uris.add(in.getData());
                    }

                    for (Uri uri : uris) {
                        byte[] datos = leerUri(uri);
                        if (datos == null || datos.length == 0) continue;
                        String nombre = nombreDe(uri);
                        // El .zip se reconoce por dentro (empieza por «PK»), no por el
                        // nombre: muchas veces el nombre no llega o llega sin extensión.
                        boolean esZip = datos.length > 4 && datos[0] == 0x50 && datos[1] == 0x4B;
                        if (esZip) {
                            String t = txtDentroDelZip(datos);
                            if (t != null && !t.trim().isEmpty() && texto.trim().isEmpty()) {
                                texto = t;
                                if (nombreArchivo.isEmpty()) nombreArchivo = nombre;
                            }
                            fotosDentroDelZip(datos);   // v1.26: las fotos del zip del iPhone
                        } else {
                            String mime = mimeDeImagen(datos);
                            if (mime != null) {
                                _fotosVistas++;
                                anadirFoto(nombre, datos, mime);
                            } else if (pareceTexto(datos, nombre) && texto.trim().isEmpty()) {
                                texto = new String(datos, StandardCharsets.UTF_8);
                                if (nombreArchivo.isEmpty()) nombreArchivo = nombre;
                            }
                            // lo que no es ni foto ni texto (audios, vídeos, pdf) se queda
                            // en el móvil: el servidor solo guarda fotos, y decir otra cosa
                            // sería mentir.
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
                    // v1.26: fotos sí pero texto no (compartir solo unas fotos del chat).
                    // No se tira: se manda igual, diciendo lo que es.
                    if ((texto == null || texto.trim().isEmpty()) && _fotos.length() > 0) {
                        texto = "(Asier ha compartido " + _fotos.length() + " foto(s) del chat, sin texto)";
                    }

                    if (texto == null || texto.trim().isEmpty()) { fin("No he podido leer la conversación. Prueba con «Exportar chat»."); return; }
                    if (texto.length() > 900000) texto = texto.substring(texto.length() - 900000); // lo más reciente

                    _textoPendiente = texto;
                    _nombreArchivo = nombreArchivo;

                    if (_fotos.length() > 0) aviso("Mandando la conversación y " + _fotos.length() + " foto(s)…");
                    mandar(texto, nombreArchivo, null);
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
                                final String n = nombre;
                                new Thread(new Runnable() { public void run() { mandar(_textoPendiente, _nombreArchivo, n); } }).start();
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

    /**
     * Manda todo al servidor (texto + fotos), con o sin el nombre del cliente delante.
     * v1.26: camino ÚNICO de envío — antes había dos trozos casi iguales y las fotos
     * se habrían quedado fuera del reenvío con nombre.
     */
    private void mandar(final String texto, final String archivo, final String contacto) {
        try {
            String jwt = Datos.prefs(CompartirActivity.this).getString("jwt", "");
            if (jwt.isEmpty()) { fin("Primero entra en la app de Azkar con tu usuario, y vuelve a compartir."); return; }

            HttpURLConnection c = Datos.conecta(Datos.BASE + "/api/widget/whatsapp", "POST", jwt);
            // v1.26: subir fotos y que el servidor las coloque en Drive lleva su tiempo.
            // Con los 15 s de siempre, el móvil colgaría ANTES de que el servidor acabe
            // y diría «no se ha podido» con todo ya guardado. Se espera hasta 4 minutos.
            if (_fotos.length() > 0) { c.setConnectTimeout(20000); c.setReadTimeout(240000); }
            c.setDoOutput(true);
            JSONObject cuerpo = new JSONObject();
            cuerpo.put("texto", texto);
            cuerpo.put("filename", archivo);
            if (contacto != null && !contacto.isEmpty()) cuerpo.put("contacto", contacto);
            if (_fotos.length() > 0) cuerpo.put("fotos", _fotos);
            OutputStream os = c.getOutputStream();
            os.write(cuerpo.toString().getBytes(StandardCharsets.UTF_8));
            os.close();
            int code = c.getResponseCode();
            String resp = Datos.leerTodo(code < 400 ? c.getInputStream() : c.getErrorStream());
            JSONObject j;
            try { j = new JSONObject(resp); } catch (Exception e) { j = new JSONObject(); }

            if (code >= 400 || !j.optBoolean("ok", false)) {
                String err = j.optString("error", "");
                if (j.optBoolean("falta_contacto", false) && (contacto == null || contacto.isEmpty())) { preguntarDeQuien(); return; }
                fin(err.isEmpty() ? ("No se ha podido guardar (HTTP " + code + ")") : err);
                return;
            }
            String quien = j.optString("contacto", contacto == null ? "" : contacto);
            String ref = j.optString("ref", "");
            int n = j.optInt("guardados", j.optInt("total", 0));
            String msg = "Guardado el WhatsApp de " + (quien.isEmpty() ? "ese cliente" : quien)
                    + " (" + n + " mensajes)"
                    + (ref == null || ref.isEmpty() || "null".equals(ref) ? " — sin ficha que le cuadre" : " → ficha " + ref);
            msg += trozoDeLasFotos(j);
            if (j.optBoolean("suelto", false)) msg += ". Ojo: venía sin fechas, así que sé lo que pone pero no a qué hora.";
            fin(msg);
        } catch (Exception e) { fin("No se ha podido guardar: " + e.getMessage()); }
    }

    /**
     * v1.26 · Lo que se dice de las fotos, SIN mentir nunca:
     *  · si el servidor dice cuántas guardó, se repite eso;
     *  · si mandamos fotos y el servidor ni las menciona (versión vieja), se AVISA;
     *  · si venían más de las que cupieron, también se dice.
     */
    private String trozoDeLasFotos(JSONObject j) {
        int mandadas = _fotos.length();
        if (mandadas == 0 && _fotosVistas == 0) return "";
        int guardadas = j.optInt("fotos_guardadas", -1);
        String s;
        if (guardadas >= 0) {
            if (guardadas > 0) s = " · " + guardadas + " foto(s) guardadas en su carpeta";
            else {
                String err = j.optString("fotos_error", "");
                s = " · ⚠️ las " + mandadas + " fotos NO se han guardado" + (err.isEmpty() || "null".equals(err) ? "" : " (" + err + ")");
            }
        } else {
            s = " · ⚠️ las " + mandadas + " fotos NO han entrado: el servidor aún no sabe guardarlas por este camino (falta actualizarlo)";
        }
        if (_fotosVistas > mandadas) s += " · " + (_fotosVistas - mandadas) + " se quedaron fuera por tamaño";
        return s;
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

    /** v1.26 · Y del mismo .zip, las fotos (antes se quedaban dentro sin decir nada). */
    private void fotosDentroDelZip(byte[] datos) {
        try {
            ZipInputStream z = new ZipInputStream(new java.io.ByteArrayInputStream(datos));
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) {
                String nombre = e.getName() == null ? "" : e.getName();
                String bajo = nombre.toLowerCase();
                if (!(bajo.endsWith(".jpg") || bajo.endsWith(".jpeg") || bajo.endsWith(".png") || bajo.endsWith(".webp"))) continue;
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n, total = 0;
                boolean pasada = false;
                while ((n = z.read(buf)) > 0) {
                    bos.write(buf, 0, n);
                    total += n;
                    if (total > MAX_BYTES_FOTO) { pasada = true; break; }
                }
                _fotosVistas++;
                if (pasada || bos.size() == 0) continue;
                byte[] foto = bos.toByteArray();
                String mime = mimeDeImagen(foto);
                if (mime == null) mime = bajo.endsWith(".png") ? "image/png" : (bajo.endsWith(".webp") ? "image/webp" : "image/jpeg");
                int barra = nombre.lastIndexOf('/');
                anadirFoto(barra >= 0 ? nombre.substring(barra + 1) : nombre, foto, mime);
            }
            z.close();
        } catch (Exception ex) { /* una foto ilegible no tumba el envío del texto */ }
    }

    /** v1.26 · Una imagen se conoce por DENTRO (sus primeros bytes), no por el nombre. */
    private String mimeDeImagen(byte[] d) {
        if (d == null || d.length < 12) return null;
        if ((d[0] & 0xFF) == 0xFF && (d[1] & 0xFF) == 0xD8) return "image/jpeg";
        if ((d[0] & 0xFF) == 0x89 && d[1] == 0x50 && d[2] == 0x4E && d[3] == 0x47) return "image/png";
        if (d[0] == 'R' && d[1] == 'I' && d[2] == 'F' && d[3] == 'F' && d[8] == 'W' && d[9] == 'E' && d[10] == 'B' && d[11] == 'P') return "image/webp";
        return null;
    }

    /** v1.26 · ¿Esto es texto de verdad? (el .txt del export, no un audio ni un vídeo) */
    private boolean pareceTexto(byte[] d, String nombre) {
        if (nombre != null && nombre.toLowerCase().endsWith(".txt")) return true;
        int mirar = Math.min(d.length, 512);
        for (int i = 0; i < mirar; i++) {
            int b = d[i] & 0xFF;
            if (b == 0 || (b < 9 && b != 0)) return false;   // bytes de archivo binario
        }
        return mirar > 0;
    }

    /** v1.26 · Meter una foto en el paquete, respetando los topes. */
    private void anadirFoto(String nombre, byte[] datos, String mime) {
        try {
            if (_fotos.length() >= MAX_FOTOS) return;
            if (datos.length > MAX_BYTES_FOTO) return;
            if (_bytesFotos + datos.length > MAX_BYTES_TOTAL) return;
            JSONObject f = new JSONObject();
            f.put("nombre", (nombre == null || nombre.isEmpty()) ? ("foto-" + (_fotos.length() + 1) + ".jpg") : nombre);
            f.put("base64", android.util.Base64.encodeToString(datos, android.util.Base64.NO_WRAP));
            f.put("mime", mime);
            _fotos.put(f);
            _bytesFotos += datos.length;
        } catch (Exception e) { /* una foto que no entra no rompe el resto */ }
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
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            public void run() {
                try { Toast.makeText(CompartirActivity.this, t, Toast.LENGTH_SHORT).show(); } catch (Exception e) { }
            }
        });
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
