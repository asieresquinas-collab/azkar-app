package es.azkarmudanzas.widgets;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Pantalla de configuración. Tiene DOS mitades y no se mezclan nunca:
 *
 *   1) 👷 EL PANEL DEL EQUIPO (la tablet de los chicos) — va con EL ENLACE de ellos.
 *      Aquí NO hay usuario ni contraseña de Asier, y no debe haberlos.
 *   2) 🔒 LO DE ASIER (su móvil) — entrar una vez con su usuario y clave de la app.
 *
 * v1.16: la mitad del equipo va ARRIBA porque en la tablet es lo único que hay que tocar,
 * y además se puede llegar aquí desde el propio plan de trabajo (el botón "PONER EL PANEL
 * EN LA TABLET" del portal abre esta pantalla CON EL ENLACE YA PUESTO: nadie tiene que
 * copiar ni pegar un código largo a mano, que es donde se equivoca todo el mundo).
 */
public class MainActivity extends Activity {

    EditText usuario, clave, enlaceEq;
    TextView estado, estadoEq;
    Button actualizar, ponerEq;
    Handler ui = new Handler(Looper.getMainLooper());
    long descargaId = -1;
    android.content.BroadcastReceiver descargaLista = null;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        // v1.22: al abrir la app, se recoge lo que Azkarin haya dejado pendiente
        try { Datos.recogerAlarmas(this); } catch (Exception e) { }
        int pad = (int) (16 * getResources().getDisplayMetrics().density);

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(pad, pad, pad, pad);

        TextView titulo = new TextView(this);
        // v1.18: la version A LA VISTA, para saber de un vistazo si la actualizacion entro
        String _vn = "?";
        try { _vn = getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { /* nada */ }
        titulo.setText("Widgets de Azkar  ·  v" + _vn);
        titulo.setTextSize(26);
        titulo.setTypeface(null, Typeface.BOLD);
        titulo.setTextColor(Color.parseColor("#1B4F8A"));
        raiz.addView(titulo);

        // v1.4: actualización a UN toque — sale solo cuando hay versión nueva publicada
        actualizar = new Button(this);
        actualizar.setText("🔄 ACTUALIZAR");
        actualizar.setBackgroundColor(Color.parseColor("#E85C0D"));
        actualizar.setTextColor(Color.WHITE);
        actualizar.setVisibility(View.GONE);
        raiz.addView(actualizar);

        // ══ 1) EL PANEL DEL EQUIPO (la tablet) ═══════════════════════════════════
        TextView tEq = new TextView(this);
        tEq.setText("👷 EL PANEL DE LA TABLET");
        tEq.setTextSize(20);
        tEq.setTypeface(null, Typeface.BOLD);
        tEq.setTextColor(Color.parseColor("#0B3D6B"));
        tEq.setPadding(0, pad, 0, 0);
        raiz.addView(tEq);

        TextView expEq = new TextView(this);
        expEq.setText("El trabajo de hoy A PANTALLA COMPLETA, con la dirección EN GRANDE y su botón 📍 para el mapa.\n\n" +
                "No hace falta usuario ni contraseña: solo el enlace del plan de trabajo (el que ya tienen abierto en la tablet).");
        expEq.setTextSize(16);
        expEq.setPadding(0, pad / 3, 0, pad / 3);
        raiz.addView(expEq);

        enlaceEq = new EditText(this);
        enlaceEq.setHint("Pega aquí el enlace del plan de trabajo");
        enlaceEq.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS | InputType.TYPE_TEXT_VARIATION_URI);
        enlaceEq.setText(Datos.enlaceEquipo(this));
        raiz.addView(enlaceEq);

        Button pegarEq = new Button(this);
        pegarEq.setText("📋 PEGAR LO COPIADO");
        raiz.addView(pegarEq);

        Button guardarEq = new Button(this);
        guardarEq.setText("GUARDAR EL ENLACE");
        guardarEq.setBackgroundColor(Color.parseColor("#0B3D6B"));
        guardarEq.setTextColor(Color.WHITE);
        raiz.addView(guardarEq);

        ponerEq = new Button(this);
        ponerEq.setText("📌 PONER EL PANEL EN LA PANTALLA");
        ponerEq.setBackgroundColor(Color.parseColor("#2E7D32"));
        ponerEq.setTextColor(Color.WHITE);
        raiz.addView(ponerEq);

        estadoEq = new TextView(this);
        estadoEq.setTextSize(16);
        estadoEq.setPadding(0, pad / 3, 0, pad);
        raiz.addView(estadoEq);

        // ══ 2) LO DE ASIER (su móvil) ════════════════════════════════════════════
        TextView tAs = new TextView(this);
        tAs.setText("🔒 LO DE ASIER (su móvil)");
        tAs.setTextSize(20);
        tAs.setTypeface(null, Typeface.BOLD);
        tAs.setTextColor(Color.parseColor("#1B4F8A"));
        tAs.setPadding(0, pad, 0, 0);
        raiz.addView(tAs);

        TextView explica = new TextView(this);
        explica.setText("Entra UNA vez con tu usuario y clave de la app de Azkar. " +
                "Luego mantén pulsado el fondo de tu pantalla de inicio → Widgets → Azkar, " +
                "y arrastra los que quieras:\n\n🔵 Azkarin — háblale (la burbuja)\n📋 Azkar — lo de hoy (el panel en grande)\n" +
                "📋 Azkar — repaso (lo que quedó colgado: nombre y teléfono de cada cosa; se puede estirar hacia abajo)\n" +
                "👷 Azkar — trabajo de hoy (el panel grande de la tablet; ese va con el enlace de arriba, sin clave)");
        explica.setTextSize(16);
        explica.setPadding(0, pad / 3, 0, pad / 2);
        raiz.addView(explica);

        usuario = new EditText(this);
        usuario.setHint("Usuario (el de la app)");
        // v1.1: SIN autocorrector ni sugerencias del teclado — los teclados (Samsung sobre todo)
        // "arreglan" el usuario por su cuenta y la clave sale mal sin que se vea.
        usuario.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS | InputType.TYPE_TEXT_VARIATION_FILTER);
        usuario.setText(Datos.prefs(this).getString("usuario", ""));
        raiz.addView(usuario);

        clave = new EditText(this);
        clave.setHint("Contraseña");
        clave.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        raiz.addView(clave);

        Button entrar = new Button(this);
        entrar.setText("ENTRAR Y PROBAR");
        entrar.setBackgroundColor(Color.parseColor("#1B4F8A"));
        entrar.setTextColor(Color.WHITE);
        raiz.addView(entrar);

        estado = new TextView(this);
        estado.setTextSize(16);
        estado.setPadding(0, pad, 0, pad);
        estado.setText(Datos.hayLogin(this) ? "✅ Ya estás dentro. Los widgets funcionan." : "Aún sin entrar.");
        raiz.addView(estado);

        Button probar = new Button(this);
        probar.setText("🩺 PROBAR CONEXIÓN");
        raiz.addView(probar);

        Button abrirApp = new Button(this);
        abrirApp.setText("ABRIR LA APP DE AZKAR");
        raiz.addView(abrirApp);

        Button hablar = new Button(this);
        hablar.setText("🎙 HABLAR CON AZKARIN");
        raiz.addView(hablar);

        ScrollView sc = new ScrollView(this);
        sc.addView(raiz, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(sc);

        // ── botones del panel del equipo ────────────────────────────────────────
        pegarEq.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                String p = delPortapapeles();
                if (p.isEmpty()) { estadoEq.setText("No hay nada copiado. Abre el plan de trabajo en la tablet y copia la dirección de arriba del navegador."); return; }
                enlaceEq.setText(p);
                guardaEnlace(p, false);
            }
        });
        guardarEq.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { guardaEnlace(enlaceEq.getText().toString(), false); }
        });
        ponerEq.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { ponEnLaPantalla(true); }
        });

        entrar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                final String u = usuario.getText().toString().trim();
                final String p = clave.getText().toString();
                if (u.isEmpty() || p.isEmpty()) { estado.setText("Pon el usuario y la contraseña de la app."); return; }
                estado.setText("Entrando…");
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        final String err = Datos.login(MainActivity.this, u, p);
                        if (err != null) { pinta("❌ No pude entrar.\n\n" + err + "\n\n(Usuario probado: \"" + u + "\")"); return; }
                        final JSONObject r = Datos.resumen(MainActivity.this);
                        if (r == null) { pinta("✅ DENTRO (la clave es buena), pero el resumen falló:\n" + (Datos.ultimoErrorResumen.isEmpty() ? "(sin detalle)" : Datos.ultimoErrorResumen) + "\n\nReintenta en un momento."); refrescaWidgets(); return; }
                        Datos.guardaCache(MainActivity.this, r);
                        StringBuilder sb = new StringBuilder("✅ Dentro. Esto verás en el widget:\n\n");
                        JSONArray a = r.optJSONArray("lineas");
                        if (a != null) for (int i = 0; i < a.length(); i++) sb.append("• ").append(a.optString(i)).append("\n");
                        pinta(sb.toString());
                        refrescaWidgets();
                    }
                }).start();
            }
        });

        probar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                estado.setText("Probando conexión…");
                new Thread(new Runnable() { @Override public void run() { pinta(Datos.probarConexion()); } }).start();
            }
        });

        abrirApp.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { try { startActivity(AbrirAzkar.laApp(MainActivity.this)); } catch (Exception e) { estado.setText("No pude abrir la app: " + e.getMessage()); } }
        });
        hablar.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { try { startActivity(new Intent(MainActivity.this, VozActivity.class)); } catch (Exception e) { estado.setText("No pude abrir la voz: " + e.getMessage()); } }
        });

        cuentaEstadoEquipo();
        atiendeEnlaceDeFuera(getIntent());
    }

    /** Si vuelven a tocar el botón del portal con la app ya abierta. */
    @Override
    protected void onNewIntent(Intent in) {
        super.onNewIntent(in);
        setIntent(in);
        atiendeEnlaceDeFuera(in);
    }

    // ══ v1.16 · EL ENLACE DE LOS CHICOS ═════════════════════════════════════════

    /** Llega desde el propio plan de trabajo: el portal tiene un botón que abre esta app
     *  con el enlace dentro (azkarwidget://equipo?u=…). Así nadie teclea el código. */
    void atiendeEnlaceDeFuera(Intent in) {
        try {
            Uri d = in == null ? null : in.getData();
            if (d == null) return;
            if (!"azkarwidget".equals(d.getScheme())) return;
            String u = "";
            try { u = d.getQueryParameter("u"); } catch (Exception e) { /* nada */ }
            if (u == null) u = "";
            if (u.isEmpty()) {
                // forma corta: azkarwidget://equipo/<código>
                String p = d.getPath();
                if (p != null && p.length() > 1) u = Datos.BASE + "/api/equipo/" + p.substring(1);
            }
            if (u.isEmpty()) return;
            enlaceEq.setText(u);
            guardaEnlace(u, true);
        } catch (Exception e) { /* nada */ }
    }

    /** Guarda el enlace y lo DICE: o quedó puesto, o por qué no. Nunca se queda callado. */
    void guardaEnlace(String texto, final boolean ofrecerPonerlo) {
        String err = Datos.guardaEnlaceEquipo(this, texto);
        if (err != null) { estadoEq.setText("❌ " + err); return; }
        enlaceEq.setText(Datos.enlaceEquipo(this));
        estadoEq.setText("✅ Enlace guardado. Comprobando que trae el trabajo de hoy…");
        refrescaWidgets();
        new Thread(new Runnable() {
            @Override
            public void run() {
                final JSONObject r = Datos.hoyEquipo(MainActivity.this, 14);
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        if (r == null) {
                            estadoEq.setText("⚠️ El enlace está guardado, pero ahora mismo no he podido traer el trabajo de hoy"
                                    + (Datos.ultimoErrorEquipo.isEmpty() ? "." : ": " + Datos.ultimoErrorEquipo + ".")
                                    + "\nSi pone que el enlace ya no vale, pídele el nuevo a Asier.");
                            return;
                        }
                        Datos.guardaCacheEquipo(MainActivity.this, r);
                        StringBuilder sb = new StringBuilder("✅ Listo. Esto es lo que verá el panel:\n\n");
                        JSONArray a = r.optJSONArray("lineas");
                        int n = a == null ? 0 : Math.min(a.length(), 6);
                        for (int i = 0; i < n; i++) sb.append("• ").append(a.optString(i)).append("\n");
                        if (a != null && a.length() > n) sb.append("• …\n");
                        estadoEq.setText(sb.toString());
                        refrescaWidgets();
                        if (ofrecerPonerlo) ponEnLaPantalla(false);
                    }
                });
            }
        }).start();
    }

    /** Cuenta si ya hay enlace puesto, sin dar detalles del código. */
    void cuentaEstadoEquipo() {
        if (!Datos.hayEquipo(this)) {
            estadoEq.setText("Aún sin enlace. Pega arriba el del plan de trabajo (el que lleva /api/equipo/ dentro).");
        } else {
            estadoEq.setText("✅ Enlace puesto. El panel 👷 trae el trabajo de hoy solo.");
        }
    }

    /** PONER EL PANEL EN LA PANTALLA de un toque (Android lo pregunta y ya está).
     *  Se llama por reflexión porque la APK se compila contra Android 25 y esto es de
     *  Android 26: si el móvil es más viejo o el lanzador no lo admite, se EXPLICA cómo
     *  ponerlo a mano — nunca un botón que no hace nada. */
    void ponEnLaPantalla(boolean aviso) {
        if (!Datos.hayEquipo(this)) { estadoEq.setText("Primero pega y guarda el enlace del plan de trabajo."); return; }
        boolean pedido = false;
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(this);
            java.lang.reflect.Method admite = AppWidgetManager.class.getMethod("isRequestPinAppWidgetSupported");
            Object ok = admite.invoke(mgr);
            if (ok instanceof Boolean && (Boolean) ok) {
                java.lang.reflect.Method pon = AppWidgetManager.class.getMethod("requestPinAppWidget",
                        ComponentName.class, Bundle.class, android.app.PendingIntent.class);
                Object res = pon.invoke(mgr, new ComponentName(this, WidgetEquipo.class), null, null);
                pedido = !(res instanceof Boolean) || (Boolean) res;
            }
        } catch (Exception e) { pedido = false; }
        if (pedido) {
            if (aviso) estadoEq.setText("👉 Dile que SÍ al aviso de Android y el panel se pone solo en la pantalla.\n\nDespués, mantenlo pulsado y estíralo hasta llenar la tablet.");
        } else {
            estadoEq.setText("Este Android no lo pone solo. Hazlo así:\n\n1) Sal a la pantalla de inicio\n2) Mantén pulsado el fondo\n3) Widgets → Azkar\n4) Arrastra «👷 Azkar — trabajo de hoy»\n5) Estíralo hasta llenar la pantalla");
        }
    }

    String delPortapapeles() {
        try {
            ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cb == null) return "";
            ClipData c = cb.getPrimaryClip();
            if (c == null || c.getItemCount() == 0) return "";
            CharSequence t = c.getItemAt(0).coerceToText(this);
            return t == null ? "" : t.toString().trim();
        } catch (Exception e) { return ""; }
    }

    void pinta(final String txt) {
        ui.post(new Runnable() { @Override public void run() { estado.setText(txt); } });
    }

    // v1.19: qué ha contestado Asier al permiso de ubicación (solo para decírselo claro)
    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code != 9) return;
        boolean ok = false;
        for (int r : res) if (r == PackageManager.PERMISSION_GRANTED) ok = true;
        estado.setText(ok
            ? "✅ Ubicación permitida. Ya puedes preguntarle a Azkarin cuánto tardas en llegar a un sitio."
            : "La ubicación se ha quedado sin permiso: Azkarin seguirá funcionando igual, pero no podrá decirte cuánto tardas. Si cambias de idea: Ajustes → Aplicaciones → Azkar → Permisos → Ubicación.");
    }

    // ── v1.4: AUTOACTUALIZACIÓN a un toque ─────────────────────────────────────
    @Override
    protected void onResume() {
        super.onResume();
        // v1.19 · EL PERMISO DE UBICACIÓN SE PIDE AQUÍ, NO EN LA BURBUJA.
        // La tarjeta del walkie-talkie es `noHistory` + tema de diálogo: Android la DESTRUYE en
        // cuanto le sale cualquier ventana encima, así que el aviso del permiso moría ahí y la
        // respuesta no llegaba nunca (por eso Asier no conseguía aceptarlo). Esta pantalla es
        // una pantalla normal y corriente: aquí el aviso sale y se puede contestar tranquilamente.
        try {
            if (!Ubic.hayPermiso(this)) {
                requestPermissions(new String[]{
                    android.Manifest.permission.ACCESS_FINE_LOCATION,
                    android.Manifest.permission.ACCESS_COARSE_LOCATION}, 9);
            }
        } catch (Exception e) { /* si no se puede pedir, la app sigue igual */ }
        new Thread(new Runnable() {
            @Override
            public void run() {
                final JSONObject act = Datos.hayActualizacion(MainActivity.this);
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        if (act == null) { actualizar.setVisibility(View.GONE); return; }
                        final String vn = act.optString("versionName", "?");
                        final String url = act.optString("url", "");
                        actualizar.setText("🔄 HAY VERSIÓN NUEVA — ACTUALIZAR A v" + vn);
                        actualizar.setVisibility(View.VISIBLE);
                        actualizar.setOnClickListener(new View.OnClickListener() {
                            @Override public void onClick(View v) { descargaEInstala(url, vn); }
                        });
                    }
                });
            }
        }).start();
    }

    // v1.7: A PRUEBA DE BALAS. El instalador automático de Android (DownloadManager + content://)
    // fallaba mudo en algunos móviles (Samsung). Ahora el botón abre la descarga directa en el
    // navegador —el mismo camino del enlace, que SÍ funciona— y solo hay que darle a Instalar.
    void descargaEInstala(String url, String vn) {
        try {
            estado.setText("⬇️ Bajando la v" + vn + "…\nCuando termine, ábrela desde la barra de notificaciones (o en Descargas) y dale a INSTALAR. Si pregunta por 'apps desconocidas', permítelo (solo la 1ª vez).");
            startActivity(new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            estado.setText("No pude abrir la descarga. Copia este enlace en el navegador:\n" + url);
        }
    }

    @Override
    protected void onDestroy() {
        try { if (descargaLista != null) unregisterReceiver(descargaLista); } catch (Exception e) { /* nada */ }
        super.onDestroy();
    }

    void refrescaWidgets() {
        try {
            Intent i = new Intent(this, WidgetResumen.class).setAction(WidgetResumen.ACCION_REFRESCAR);
            sendBroadcast(i);
            // v1.14: y el del repaso, que también se refresque al entrar
            sendBroadcast(new Intent(this, WidgetRepaso.class).setAction(WidgetRepaso.ACCION_REFRESCAR));
            // v1.16: y el panel grande del equipo
            sendBroadcast(new Intent(this, WidgetEquipo.class).setAction(WidgetEquipo.ACCION_REFRESCAR));
            AppWidgetManager mgr = AppWidgetManager.getInstance(this);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(this, WidgetAzkarin.class));
            if (ids != null && ids.length > 0) new WidgetAzkarin().onUpdate(this, mgr, ids);
        } catch (Exception e) { /* nada */ }
    }
}
