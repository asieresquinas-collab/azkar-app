package es.azkarmudanzas.widgets;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
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
 * Pantalla de configuración (una sola vez): entrar con el MISMO usuario y clave
 * de la app de Azkar. Después, los widgets van solos. Nada se guarda fuera del móvil.
 */
public class MainActivity extends Activity {

    EditText usuario, clave;
    TextView estado;
    Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        int pad = (int) (16 * getResources().getDisplayMetrics().density);

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(pad, pad, pad, pad);

        TextView titulo = new TextView(this);
        titulo.setText("Widgets de Azkar");
        titulo.setTextSize(26);
        titulo.setTypeface(null, Typeface.BOLD);
        titulo.setTextColor(Color.parseColor("#1B4F8A"));
        raiz.addView(titulo);

        TextView explica = new TextView(this);
        explica.setText("Entra UNA vez con tu usuario y clave de la app de Azkar. " +
                "Luego mantén pulsado el fondo de tu pantalla de inicio → Widgets → Azkar, " +
                "y arrastra los dos:\n\n🔵 Azkarin — háblale (la burbuja)\n📋 Azkar — lo de hoy (el panel en grande)");
        explica.setTextSize(16);
        explica.setPadding(0, pad / 2, 0, pad);
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
            @Override public void onClick(View v) { try { startActivity(AbrirAzkar.hablarConAzkarin(MainActivity.this)); } catch (Exception e) { estado.setText("No pude abrir el chat: " + e.getMessage()); } }
        });
    }

    void pinta(final String txt) {
        ui.post(new Runnable() { @Override public void run() { estado.setText(txt); } });
    }

    void refrescaWidgets() {
        try {
            Intent i = new Intent(this, WidgetResumen.class).setAction(WidgetResumen.ACCION_REFRESCAR);
            sendBroadcast(i);
            AppWidgetManager mgr = AppWidgetManager.getInstance(this);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(this, WidgetAzkarin.class));
            if (ids != null && ids.length > 0) new WidgetAzkarin().onUpdate(this, mgr, ids);
        } catch (Exception e) { /* nada */ }
    }
}
